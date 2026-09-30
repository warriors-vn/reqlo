// Shared between the client (executor.ts) and the server route
// (src/routes/api.proxy.ts) that tunnels a CORS-blocked send through reqlo's
// own origin — kept in one place so the two sides can't drift apart.

/** Set by the client on the request it wants /api/proxy to forward, carrying
 * the real target URL instead of a JSON envelope. */
export const PROXY_TARGET_HEADER = "x-reqlo-proxy-target";

/** Set by /api/proxy on every response it ever returns, success or error —
 * how the client tells "reqlo's proxy actually ran" apart from a plain 404
 * from a deployment (e.g. the static-nginx Docker image) that has no server
 * for this route at all. */
export const PROXIED_HEADER = "x-reqlo-proxied";

/** Set by /api/proxy on a response it made up itself — a bad target, a
 * refused private address, a target it couldn't connect to. Without it the
 * client can't tell "the API answered 502" from "reqlo never reached the
 * API", and would show the second as if it were the first. */
export const PROXY_ERROR_HEADER = "x-reqlo-proxy-error";

/** The target's own response headers, exactly as it sent them (see
 * encodeUpstreamHeaders). The headers on the /api/proxy response itself are a
 * mix of the target's and the hop between the browser and reqlo's server —
 * `cache-control: no-store`, `connection`, `vary`, this marker — and the
 * browser hides `set-cookie` from script altogether, so they can't be shown
 * to the user as "what the API returned". */
export const UPSTREAM_HEADERS_HEADER = "x-reqlo-upstream-headers";

/** Past this the encoded copy is left off rather than risk a response header
 * block some host refuses; the client then falls back to the raw headers. */
const MAX_ENCODED_UPSTREAM_HEADERS = 16_000;

/** Header name/value pairs as base64'd UTF-8 JSON — base64 because a header
 * value has to be ASCII and the target's needn't be. Each `set-cookie` stays
 * its own pair: they can't be comma-joined like other repeated headers. */
export function encodeUpstreamHeaders(headers: Headers): string | null {
  const pairs: [string, string][] = [];
  headers.forEach((value, name) => {
    if (name !== "set-cookie") pairs.push([name, value]);
  });
  for (const cookie of headers.getSetCookie?.() ?? []) pairs.push(["set-cookie", cookie]);

  const bytes = new TextEncoder().encode(JSON.stringify(pairs));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary);
  return encoded.length > MAX_ENCODED_UPSTREAM_HEADERS ? null : encoded;
}

/** The inverse of encodeUpstreamHeaders, as the flat record the response
 * view renders. Repeated `set-cookie` headers become one entry, a cookie per
 * line. Returns null for anything that isn't a valid encoding. */
export function decodeUpstreamHeaders(encoded: string | null): Record<string, string> | null {
  if (!encoded) return null;
  try {
    const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
    const pairs = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (!Array.isArray(pairs)) return null;
    const out: Record<string, string> = {};
    for (const pair of pairs) {
      if (!Array.isArray(pair) || typeof pair[0] !== "string" || typeof pair[1] !== "string") {
        return null;
      }
      const [name, value] = pair;
      out[name] =
        name in out ? `${out[name]}${name === "set-cookie" ? "\n" : ", "}${value}` : value;
    }
    return out;
  } catch {
    return null;
  }
}
