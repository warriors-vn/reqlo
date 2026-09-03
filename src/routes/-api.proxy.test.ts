import { afterEach, describe, expect, it, vi } from "vitest";
import { handleProxyRequest } from "@/routes/api.proxy";
import { PROXIED_HEADER, PROXY_TARGET_HEADER } from "@/services/proxy-constants";

function makeRequest(target: string | null, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (target !== null) headers.set(PROXY_TARGET_HEADER, target);
  headers.set("cookie", "session=leak-me-not");
  headers.set("origin", "https://app.reqlo.dev");
  return new Request("https://app.reqlo.dev/api/proxy", { ...init, headers });
}

describe("handleProxyRequest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects when the target header is missing", async () => {
    const res = await handleProxyRequest({ request: makeRequest(null) });
    expect(res.status).toBe(400);
    expect(res.headers.get(PROXIED_HEADER)).toBe("1");
  });

  // Sec-Fetch-Site is set by the browser itself on every fetch()/XHR and
  // can't be overridden by page JavaScript — its presence with a value other
  // than "same-origin" means some OTHER page's script (not reqlo's own) is
  // asking this route to fetch on its behalf. That matters specifically
  // because this route has no auth in front of it: a publicly reachable
  // deployment (see wrangler.jsonc) would otherwise be usable by any website
  // as a free CORS-bypass proxy.
  it.each(["cross-site", "same-site", "none"])(
    "rejects a request whose Sec-Fetch-Site is %s (not reqlo's own page)",
    async (site) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const request = makeRequest("https://api.example.com");
      request.headers.set("sec-fetch-site", site);

      const res = await handleProxyRequest({ request });

      expect(res.status).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("allows a request whose Sec-Fetch-Site is same-origin", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("ok", { status: 200 })),
    );
    const request = makeRequest("https://api.example.com");
    request.headers.set("sec-fetch-site", "same-origin");

    const res = await handleProxyRequest({ request });
    expect(res.status).toBe(200);
  });

  it("allows a request with no Sec-Fetch-Site at all (e.g. a non-browser client)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("ok", { status: 200 })),
    );
    const res = await handleProxyRequest({ request: makeRequest("https://api.example.com") });
    expect(res.status).toBe(200);
  });

  it("rejects a malformed target URL", async () => {
    const res = await handleProxyRequest({ request: makeRequest("not a url") });
    expect(res.status).toBe(400);
  });

  it("rejects a non-http(s) protocol", async () => {
    const res = await handleProxyRequest({ request: makeRequest("file:///etc/passwd") });
    expect(res.status).toBe(400);
  });

  it.each([
    "http://localhost:9999",
    "http://127.0.0.1:9999",
    "http://0.0.0.0",
    "http://0.1.2.3", // 0.0.0.0/8, not just the literal all-zero address
    "http://169.254.169.254/latest/meta-data/", // cloud metadata endpoint
    "http://10.1.2.3",
    "http://172.16.0.1",
    "http://172.31.255.255",
    "http://192.168.1.1",
    "http://[::1]:9999",
    "http://[::]:9999",
    "http://[fe80::1]", // link-local (fe80::/10)
    "http://[fd12:3456::1]", // unique-local (fc00::/7)
    "http://[::ffff:127.0.0.1]", // IPv4-mapped IPv6, dotted form
    "http://[::ffff:7f00:1]", // IPv4-mapped IPv6, all-hex form new URL() normalizes to
    "http://2130706433", // decimal-encoded 127.0.0.1
    "http://0x7f.0.0.1", // hex-encoded 127.0.0.1
    "http://127.1", // shorthand for 127.0.0.1
  ])("refuses to forward to the private/loopback target %s", async (target) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await handleProxyRequest({ request: makeRequest(target) });

    expect(res.status).toBe(400);
    expect(res.headers.get(PROXIED_HEADER)).toBe("1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not block a normal public host that merely contains private-looking substrings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("ok", { status: 200 })),
    );
    const res = await handleProxyRequest({
      request: makeRequest("https://not-127.0.0.1.example.com/path"),
    });
    expect(res.status).toBe(200);
  });

  it.each([
    "http://8.8.8.8", // public IPv4
    "http://[2001:4860:4860::8888]", // public IPv6
    "http://[::ffff:8.8.8.8]", // IPv4-mapped IPv6 wrapping a public address
  ])("does not block the public target %s", async (target) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("ok", { status: 200 })),
    );
    const res = await handleProxyRequest({ request: makeRequest(target) });
    expect(res.status).toBe(200);
  });

  // Regression: a fully public, allowed target that itself 302s to a
  // private/internal address (169.254.169.254, a Docker bridge IP, ...)
  // would sail straight past isBlockedHost above, which only ever inspects
  // the FIRST hop — fetch's default redirect:"follow" would then fetch the
  // private target on this route's behalf with no further check at all.
  // Caught with a live repro (a local redirecting server) before this fix.
  it("does not follow a redirect from the target — returns the 3xx and Location as-is", async () => {
    let seenInit: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        seenInit = init;
        return new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data/" },
        });
      }),
    );

    const res = await handleProxyRequest({ request: makeRequest("https://api.example.com") });

    expect(seenInit?.redirect).toBe("manual");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("http://169.254.169.254/latest/meta-data/");
    expect(res.headers.get(PROXIED_HEADER)).toBe("1");
  });

  it("forwards to an allowed target, stripping request metadata headers and adding the proxied marker", async () => {
    let seenInit: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        seenInit = init;
        return new Response("upstream body", {
          status: 201,
          // "40" mimics undici/fetch's real behavior: it decompresses a
          // gzip body transparently but leaves the original (compressed)
          // Content-Length untouched, which would describe a body far
          // shorter than the decoded one actually being sent — see the
          // dedicated regression test below for why that has to be dropped.
          headers: { "content-encoding": "gzip", "content-length": "40", "x-upstream": "yes" },
        });
      }),
    );

    const res = await handleProxyRequest({
      request: makeRequest("https://api.example.com/widgets", {
        method: "POST",
        body: "hello",
        headers: { "content-type": "text/plain" },
      }),
    });

    const forwarded = new Headers(seenInit?.headers);
    expect(forwarded.has(PROXY_TARGET_HEADER)).toBe(false);
    expect(forwarded.has("cookie")).toBe(false);
    expect(forwarded.has("origin")).toBe(false);
    expect(forwarded.get("content-type")).toBe("text/plain");
    expect(seenInit?.redirect).toBe("manual");

    expect(res.status).toBe(201);
    expect(res.headers.get(PROXIED_HEADER)).toBe("1");
    expect(res.headers.get("x-upstream")).toBe("yes");
    expect(res.headers.has("content-encoding")).toBe(false);
    expect(res.headers.has("content-length")).toBe(false);
    await expect(res.text()).resolves.toBe("upstream body");
  });

  // Regression: undici/fetch decompresses a gzip/br response body
  // transparently but leaves the ORIGINAL (compressed) Content-Length header
  // untouched. Forwarding that verbatim describes a decoded body far shorter
  // than what's actually being sent — a client reading it can see the
  // response as truncated. Confirmed live: a real gzip response's declared
  // length was ~0.8% of its actual decoded size before this header was
  // added to the strip list alongside content-encoding.
  it("strips a stale content-length left over from an upstream response the runtime already decompressed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const decodedBody = "x".repeat(5000);
        return new Response(decodedBody, {
          status: 200,
          headers: { "content-encoding": "gzip", "content-length": "40" },
        });
      }),
    );

    const res = await handleProxyRequest({ request: makeRequest("https://api.example.com") });

    expect(res.headers.has("content-length")).toBe(false);
    await expect(res.text()).resolves.toHaveLength(5000);
  });

  // Regression test: the outer request URL is always the literal
  // "/api/proxy" — the real target lives in a header the browser's HTTP
  // cache doesn't key on — so without an explicit no-store, a second send to
  // a different target can be served the first target's cached response with
  // no network request at all. Caught live: sending to a private/loopback
  // target right after a successful public one returned the earlier
  // response instead of the expected SSRF-guard 400.
  it("marks every response no-store, success or error, so the browser never caches by the outer /api/proxy URL alone", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("ok", { status: 200 })),
    );
    const ok = await handleProxyRequest({ request: makeRequest("https://api.example.com") });
    expect(ok.headers.get("cache-control")).toBe("no-store");

    const blocked = await handleProxyRequest({ request: makeRequest("http://localhost:1") });
    expect(blocked.headers.get("cache-control")).toBe("no-store");
  });

  it("returns a 502 with the marker header when the upstream fetch itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("getaddrinfo ENOTFOUND");
      }),
    );

    const res = await handleProxyRequest({ request: makeRequest("https://api.example.com") });

    expect(res.status).toBe(502);
    expect(res.headers.get(PROXIED_HEADER)).toBe("1");
  });
});
