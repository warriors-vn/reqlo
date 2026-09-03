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
