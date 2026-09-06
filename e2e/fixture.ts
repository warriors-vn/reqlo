// The origin the e2e specs send their requests to.
//
// Deliberately NOT a third-party API. The two specs that assert on a real
// response body used to hit jsonplaceholder.typicode.com, which made a UI
// smoke suite's pass/fail depend on someone else's uptime, latency and rate
// limits — the suite failed on a slow or offline runner while nothing in
// reqlo was broken.
//
// The proxy is still fully in the loop: the browser calls /api/proxy, the dev
// server really fetches this target over real HTTP and streams the response
// back. Only the far end is now something this repo controls. (Loopback
// targets are allowed by the proxy unless REQLO_BLOCK_PRIVATE_TARGETS=1 —
// see proxy-handler.ts — which is exactly the "point reqlo at localhost"
// case it was made the default for.)
export const FIXTURE_PORT = 8181;
export const FIXTURE_ORIGIN = `http://127.0.0.1:${FIXTURE_PORT}`;
