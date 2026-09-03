import { createFileRoute } from "@tanstack/react-router";
import { PROXIED_HEADER, PROXY_TARGET_HEADER } from "@/services/proxy-constants";

// Metadata about reqlo's own request to /api/proxy — meaningless (or a
// privacy leak) to forward on to an arbitrary third-party target.
const STRIPPED_REQUEST_HEADERS = [
  PROXY_TARGET_HEADER,
  "origin",
  "referer",
  "cookie",
  "host",
  "content-length",
];
// Hop-by-hop headers describing the transport between reqlo's server and the
// target — stale or wrong once re-wrapped in the response back to the
// browser. content-length is included because undici/fetch transparently
// decompresses a gzip/br body while leaving the original (compressed)
// Content-Length header untouched — forwarding it verbatim describes a body
// shorter than the one actually being sent, which a client can read as
// truncated or protocol-broken.
const STRIPPED_RESPONSE_HEADERS = [
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
];

/** Extracts the embedded IPv4 address from an IPv4-mapped IPv6 literal, in
 * either its dotted (`::ffff:127.0.0.1`) or all-hex (`::ffff:7f00:1`) form —
 * `new URL()` normalizes to the latter, so both need handling. Returns null
 * for anything else. */
function ipv4MappedToDotted(h: string): string | null {
  const dotted = h.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted) return dotted[1];
  const hex = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
  }
  return null;
}

function isBlockedIpv4(h: string): boolean {
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 0) return true; // 0.0.0.0/8 ("this network")
  if (a === 127) return true; // 127.0.0.0/8
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (incl. cloud metadata)
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  return false;
}

/**
 * Blocks proxying to loopback/private/link-local addresses by literal
 * hostname match — including 169.254.169.254, the cloud metadata endpoint
 * cloud providers expose to their VMs. This is a baseline SSRF guard, not a
 * complete one: it doesn't resolve DNS first, so a hostname that only
 * resolves to a private address at request time (DNS rebinding) isn't
 * caught. Worth doing anyway since this route has no auth in front of it —
 * anyone who can load reqlo can ask it to fetch on their behalf.
 *
 * `new URL()` already normalizes unusual IPv4 encodings (decimal
 * `2130706433`, octal `0177.0.0.1`, hex `0x7f.0.0.1`, short `127.1`) down to
 * dotted-quad form before this ever sees them, so only that canonical form
 * needs handling here. IPv6 needs its own checks: `::1`/`::`,
 * `fe80::/10` (link-local), `fc00::/7` (unique-local), and IPv4-mapped
 * addresses (`::ffff:127.0.0.1` or its all-hex form `::ffff:7f00:1`), which
 * are unwrapped to their embedded IPv4 address and re-checked.
 */
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost") return true;

  const mapped = ipv4MappedToDotted(h);
  if (mapped) return isBlockedIpv4(mapped);
  if (isBlockedIpv4(h)) return true;

  if (h === "::" || h === "::1") return true;
  if (/^fe[89ab][0-9a-f]:/.test(h)) return true; // fe80::/10
  if (/^f[cd][0-9a-f]{2}:/.test(h)) return true; // fc00::/7

  return false;
}

function proxyErrorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "content-type": "application/json",
      [PROXIED_HEADER]: "1",
      "cache-control": "no-store",
    },
  });
}

// Exported for direct unit testing of the SSRF guard and header handling —
// createFileRoute's own machinery isn't something a unit test should have to
// exercise to cover this.
export async function handleProxyRequest({ request }: { request: Request }): Promise<Response> {
  // A hostile page's own fetch()/XHR always carries this header, and it
  // can't be set or spoofed by page JavaScript — only the browser sets it.
  // Its absence (curl, older browsers) is left unblocked since there's no
  // reliable signal either way there; its presence with any value other
  // than "same-origin" means some OTHER origin's script is asking reqlo to
  // fetch on its behalf, which is exactly the "open proxy" abuse case this
  // guards against for a publicly deployed instance (see wrangler.jsonc).
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") {
    return proxyErrorResponse(403, "This proxy only serves requests from reqlo's own page.");
  }

  const target = request.headers.get(PROXY_TARGET_HEADER);
  if (!target) return proxyErrorResponse(400, "Missing proxy target.");

  let targetUrl: URL;
  try {
    targetUrl = new URL(target);
  } catch {
    return proxyErrorResponse(400, "Invalid proxy target URL.");
  }
  if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
    return proxyErrorResponse(400, "Only http/https targets can be proxied.");
  }
  if (isBlockedHost(targetUrl.hostname)) {
    return proxyErrorResponse(
      400,
      "reqlo's proxy refuses to forward requests to private/internal network addresses.",
    );
  }

  const forwardHeaders = new Headers(request.headers);
  for (const key of STRIPPED_REQUEST_HEADERS) forwardHeaders.delete(key);

  let upstream: Response;
  try {
    upstream = (await fetch(targetUrl, {
      method: request.method,
      headers: forwardHeaders,
      body: request.body,
      // Not in this project's lib.dom.d.ts RequestInit yet, but required at
      // runtime (Node/undici and browsers alike) whenever `body` is a
      // ReadableStream — true for every non-GET/HEAD request here, since
      // that's what request.body always is when present.
      duplex: "half",
      // "manual", not the fetch default of "follow": a public target that
      // 302s to a private/internal address (169.254.169.254, a Docker
      // bridge IP, ...) would otherwise sail straight past the isBlockedHost
      // check above, which only ever sees the FIRST hop. Any redirect is
      // returned to the client as-is (status + Location header intact)
      // rather than silently re-validated and followed here — simpler, and
      // it sidesteps having to re-send a request body that's already been
      // consumed as a stream by this first attempt.
      redirect: "manual",
    } as RequestInit)) as Response;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return proxyErrorResponse(502, `reqlo's proxy couldn't reach the target: ${message}`);
  }

  const responseHeaders = new Headers(upstream.headers);
  for (const key of STRIPPED_RESPONSE_HEADERS) responseHeaders.delete(key);
  responseHeaders.set(PROXIED_HEADER, "1");
  // Every call here is semantically a fresh outbound send, even though the
  // outer URL is always the same "/api/proxy" — the real target lives in a
  // request header, which the browser's HTTP cache doesn't key on. Without
  // this, a second send to a different target can be served the first
  // target's cached response outright, with no network request at all.
  responseHeaders.set("cache-control", "no-store");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

// ANY, not POST: fetchViaProxy (executor.ts) re-sends the outer call to
// /api/proxy with the SAME method as the original target request (a GET stays
// a GET), since the tunnel is transparent — the real HTTP verb only ever
// matters for the forwarded upstream fetch inside the handler.
export const Route = createFileRoute("/api/proxy")({
  server: { handlers: { ANY: handleProxyRequest } },
});
