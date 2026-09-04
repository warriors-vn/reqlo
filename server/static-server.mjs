// The server the production Docker image runs: reqlo's built client plus the
// one route that genuinely needs a server, /api/proxy.
//
// This exists because the built client alone isn't enough. reqlo's CORS-bypass
// proxy works by having *something other than the browser* make the request —
// so a deployment that serves only static files (the old nginx image) can
// never have it, and every CORS-blocked send there dead-ends with the "Request
// possibly blocked by CORS" message no matter what the client does.
//
// Deliberately dependency-free: it runs against dist/ with no node_modules, so
// the runtime image is just node:lts-alpine plus the build output.

import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { handleProxyRequest } from "./proxy-handler.mjs";

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? "0.0.0.0";
const CLIENT_DIR = resolve(process.env.REQLO_CLIENT_DIR ?? "dist/client");
// TanStack Start's SPA mode prerenders the app's HTML shell to this name, not
// index.html — every navigation route is served from it and the router takes
// over in the browser.
const SHELL = join(CLIENT_DIR, "_shell.html");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function contentTypeFor(path) {
  return MIME_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
}

/** Resolves a URL path inside CLIENT_DIR, or null if it escapes it — `..`
 * segments and encoded variants are the classic path-traversal read of any
 * file on the host, and this server has no other authorization in front of
 * it. */
function safeJoin(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const candidate = resolve(join(CLIENT_DIR, normalize(decoded)));
  if (candidate !== CLIENT_DIR && !candidate.startsWith(CLIENT_DIR + sep)) return null;
  return candidate;
}

async function statFile(path) {
  try {
    const info = await stat(path);
    return info.isFile() ? info : null;
  } catch {
    return null;
  }
}

function sendFile(res, path, info, { immutable }) {
  res.writeHead(200, {
    "content-type": contentTypeFor(path),
    "content-length": info.size,
    // Vite fingerprints everything under /assets, so those are safe to cache
    // forever; the shell and the service worker must never be, or a deploy
    // never reaches anyone who has already loaded the app.
    "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
  });
  createReadStream(path).pipe(res);
}

/** Node's IncomingMessage → a WHATWG Request, so the proxy handler stays the
 * exact same code the TanStack route and its unit tests use. */
function toWebRequest(req) {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  return new Request(url, {
    method: req.method,
    headers: new Headers(
      Object.entries(req.headers).flatMap(([key, value]) =>
        value === undefined ? [] : [[key, Array.isArray(value) ? value.join(", ") : value]],
      ),
    ),
    body: hasBody ? Readable.toWeb(req) : undefined,
    duplex: "half",
  });
}

async function sendWebResponse(res, webResponse) {
  const headers = {};
  webResponse.headers.forEach((value, key) => {
    headers[key] = value;
  });
  res.writeHead(webResponse.status, headers);
  if (!webResponse.body) {
    res.end();
    return;
  }
  Readable.fromWeb(webResponse.body).pipe(res);
}

const server = createServer((req, res) => {
  void (async () => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;

    if (path === "/api/proxy") {
      try {
        await sendWebResponse(res, await handleProxyRequest({ request: toWebRequest(req) }));
      } catch (error) {
        console.error(error);
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Proxy failed." }));
      }
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { allow: "GET, HEAD" }).end();
      return;
    }

    const filePath = safeJoin(path);
    if (filePath) {
      const info = await statFile(filePath);
      if (info) {
        sendFile(res, filePath, info, { immutable: path.startsWith("/assets/") });
        return;
      }
    }

    // Anything else is a client route — hand over the shell and let the
    // router resolve it in the browser.
    const shellInfo = await statFile(SHELL);
    if (!shellInfo) {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end(`Missing ${SHELL} — run "npm run build:node" first.`);
      return;
    }
    sendFile(res, SHELL, shellInfo, { immutable: false });
  })();
});

server.listen(PORT, HOST, () => {
  console.log(`reqlo listening on http://${HOST}:${PORT} (serving ${CLIENT_DIR})`);
});
