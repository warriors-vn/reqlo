import { PROXY_TARGET_HEADER } from "@/services/proxy-constants";

/**
 * Thrown when /api/proxy answered without the marker header — meaning nothing
 * on the other end is reqlo's proxy. In practice: the app is being served as
 * static files (an S3/Pages-style host, or the old nginx Docker image), so the
 * request fell through to the SPA shell and came back as a 200 full of HTML.
 */
export class ProxyUnavailableError extends Error {
  constructor() {
    super(
      "This copy of reqlo has no server behind it, so it can't send requests. " +
        "Every send goes through reqlo's own /api/proxy, which needs the app to be " +
        "run with its server (npm run dev, npm start after npm run build:node, the " +
        "production Docker image, or a Cloudflare Worker deploy) rather than served " +
        "as static files.",
    );
    this.name = "ProxyUnavailableError";
  }
}

/**
 * Sends the request through reqlo's own same-origin /api/proxy route (see
 * src/services/proxy-handler.ts), which performs the real call server-side.
 *
 * This is the only path — nothing is ever fetched directly from the browser.
 * That's deliberate: a browser applies CORS to every cross-origin request and
 * a server applies none, so routing everything through the server makes an
 * API client that works the same on every endpoint instead of one that works
 * on whichever endpoints happen to send the right headers. It also means a
 * request is sent exactly once, so a POST can't be attempted directly, get
 * its response withheld by CORS, and then be retried — which is what the
 * earlier retry-on-failure design risked.
 *
 * The cost is that reqlo now needs a server to send anything at all. When it
 * doesn't have one, the missing marker header surfaces as
 * ProxyUnavailableError rather than a confusing network error.
 *
 * No `duplex` option needed here: `init.body` is at most a string/FormData/
 * Blob (SerializedRequestBody), never a stream.
 */
export function fetchViaProxy(
  url: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<Response> {
  const headers = new Headers(init.headers);
  // Resolved against the page origin so a relative target ("/health") arrives
  // as something the server can actually parse — new URL() on the server has
  // no origin to resolve it against.
  headers.set(PROXY_TARGET_HEADER, new URL(url, globalThis.location?.origin).toString());
  // The outer URL is always the literal string "/api/proxy" — the real
  // target lives in a header, which the browser's HTTP cache doesn't key on.
  // Without this, a second send to a different target through the same
  // browser session can be served an earlier target's cached response
  // outright. The server route also sends Cache-Control: no-store; this is
  // belt-and-suspenders on the request side.
  return fetch("/api/proxy", { ...init, headers, signal, cache: "no-store" });
}
