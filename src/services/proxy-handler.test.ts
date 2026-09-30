import { afterEach, describe, expect, it, vi } from "vitest";
import { handleProxyRequest } from "@/services/proxy-handler";
import {
  decodeUpstreamHeaders,
  encodeUpstreamHeaders,
  PROXIED_HEADER,
  PROXY_ERROR_HEADER,
  PROXY_TARGET_HEADER,
  UPSTREAM_HEADERS_HEADER,
} from "@/services/proxy-constants";

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
    vi.unstubAllEnvs();
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

  const PRIVATE_TARGETS = [
    "http://localhost:9999",
    "http://127.0.0.1:9999",
    "http://0.0.0.0",
    "http://0.1.2.3", // 0.0.0.0/8, not just the literal all-zero address
    "http://169.254.169.254/latest/meta-data/", // cloud metadata endpoint
    "http://10.1.2.3",
    "http://172.16.0.1",
    "http://172.31.255.255",
    "http://192.168.1.1",
    "http://100.64.0.1", // 100.64.0.0/10 (CGNAT: Tailscale, some cloud VPCs)
    "http://100.127.255.254",
    "http://198.18.0.1", // 198.18.0.0/15
    "http://198.19.255.255",
    "http://[::1]:9999",
    "http://[::]:9999",
    "http://[fe80::1]", // link-local (fe80::/10)
    "http://[fd12:3456::1]", // unique-local (fc00::/7)
    "http://[::ffff:127.0.0.1]", // IPv4-mapped IPv6, dotted form
    "http://[::ffff:7f00:1]", // IPv4-mapped IPv6, all-hex form new URL() normalizes to
    "http://2130706433", // decimal-encoded 127.0.0.1
    "http://0x7f.0.0.1", // hex-encoded 127.0.0.1
    "http://127.1", // shorthand for 127.0.0.1
  ];

  // Private targets are ALLOWED by default. reqlo sends every request through
  // this proxy, and "http://localhost:3000" is the single most common thing
  // anyone points it at — blocking that by default would break the tool's main
  // use on a machine the user already owns.
  it.each(PRIVATE_TARGETS)("forwards to the private target %s by default", async (target) => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await handleProxyRequest({ request: makeRequest(target) });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // ...and refused once a deployment opts in to hardening, which is what a
  // public instance is expected to do.
  it.each(PRIVATE_TARGETS)(
    "refuses the private target %s when REQLO_BLOCK_PRIVATE_TARGETS=1",
    async (target) => {
      vi.stubEnv("REQLO_BLOCK_PRIVATE_TARGETS", "1");
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const res = await handleProxyRequest({ request: makeRequest(target) });

      expect(res.status).toBe(400);
      expect(res.headers.get(PROXIED_HEADER)).toBe("1");
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("doesn't mistake the addresses just outside those ranges for private ones", async () => {
    vi.stubEnv("REQLO_BLOCK_PRIVATE_TARGETS", "1");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("ok", { status: 200 })),
    );
    for (const target of ["http://100.63.0.1", "http://100.128.0.1", "http://198.20.0.1"]) {
      const res = await handleProxyRequest({ request: makeRequest(target) });
      expect(res.status, target).toBe(200);
    }
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
  // Redirects are followed HERE rather than by fetch, so every hop gets the
  // same host check the original target got — the whole point being that
  // fetch's own "follow" would take the chain out of this function's hands and
  // only the first hop would ever be validated.
  it("follows a redirect and returns the final response", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        seen.push(url.toString());
        expect(init?.redirect).toBe("manual");
        if (seen.length === 1) {
          return new Response(null, {
            status: 302,
            headers: { location: "https://api.example.com/moved" },
          });
        }
        return new Response("final", { status: 200 });
      }),
    );

    const res = await handleProxyRequest({ request: makeRequest("https://api.example.com") });

    expect(seen).toEqual(["https://api.example.com/", "https://api.example.com/moved"]);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("final");
  });

  it("refuses to follow a redirect into a private address when hardening is on", async () => {
    vi.stubEnv("REQLO_BLOCK_PRIVATE_TARGETS", "1");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(null, {
            status: 302,
            headers: { location: "http://169.254.169.254/latest/meta-data/" },
          }),
      ),
    );

    const res = await handleProxyRequest({ request: makeRequest("https://api.example.com") });

    expect(res.status).toBe(400);
    expect(await res.text()).toContain("169.254.169.254");
    expect(res.headers.get(PROXIED_HEADER)).toBe("1");
  });

  it("gives up rather than looping forever on a redirect cycle", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(null, { status: 302, headers: { location: "https://api.example.com/loop" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await handleProxyRequest({ request: makeRequest("https://api.example.com/loop") });

    expect(res.status).toBe(502);
    expect(await res.text()).toContain("Too many redirects");
  });

  // Matches the fetch spec's redirect handling, which is what a browser (and
  // therefore reqlo before it proxied everything) would have done.
  it("turns a 303 into a GET and drops the body", async () => {
    const seen: { method?: string; hasBody: boolean }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        seen.push({ method: init?.method, hasBody: init?.body != null });
        if (seen.length === 1) {
          return new Response(null, {
            status: 303,
            headers: { location: "https://api.example.com/result" },
          });
        }
        return new Response("ok", { status: 200 });
      }),
    );

    const request = new Request("https://reqlo.local/api/proxy", {
      method: "POST",
      headers: { [PROXY_TARGET_HEADER]: "https://api.example.com/submit" },
      body: "payload",
    });
    const res = await handleProxyRequest({ request });

    expect(res.status).toBe(200);
    expect(seen[0]).toEqual({ method: "POST", hasBody: true });
    expect(seen[1]).toEqual({ method: "GET", hasBody: false });
  });

  it("drops Authorization when a redirect crosses to another origin", async () => {
    const seenAuth: (string | null)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        seenAuth.push(new Headers(init?.headers).get("authorization"));
        if (seenAuth.length === 1) {
          return new Response(null, {
            status: 302,
            headers: { location: "https://elsewhere.example.net/token" },
          });
        }
        return new Response("ok", { status: 200 });
      }),
    );

    const request = new Request("https://reqlo.local/api/proxy", {
      headers: {
        [PROXY_TARGET_HEADER]: "https://api.example.com/start",
        authorization: "Bearer secret",
      },
    });
    await handleProxyRequest({ request });

    expect(seenAuth[0]).toBe("Bearer secret");
    expect(seenAuth[1]).toBeNull();
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

  it("forwards the incoming request's abort signal to the upstream fetch", async () => {
    const fetchMock = vi.fn(async (_url: URL, _init?: RequestInit) => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const request = makeRequest("https://api.example.com", { signal: controller.signal });

    await handleProxyRequest({ request });

    const upstreamSignal = fetchMock.mock.calls[0][1]?.signal;
    expect(upstreamSignal).toBeDefined();
    expect(upstreamSignal?.aborted).toBe(false);
    controller.abort();
    expect(upstreamSignal?.aborted).toBe(true);
  });

  it("marks its own errors so the client can tell them from the target's answer", async () => {
    const missing = await handleProxyRequest({ request: makeRequest(null) });
    expect(missing.headers.get(PROXY_ERROR_HEADER)).toBe("1");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("upstream says no", { status: 502 })),
    );
    const relayed = await handleProxyRequest({ request: makeRequest("https://api.example.com") });
    expect(relayed.status).toBe(502);
    expect(relayed.headers.has(PROXY_ERROR_HEADER)).toBe(false);
  });

  it("says why it couldn't connect, from the fetch error's cause", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed", {
          cause: Object.assign(new Error("getaddrinfo ENOTFOUND nope.invalid"), {
            code: "ENOTFOUND",
          }),
        });
      }),
    );

    const res = await handleProxyRequest({ request: makeRequest("https://nope.invalid/x") });
    const { error } = (await res.json()) as { error: string };

    expect(res.headers.get(PROXY_ERROR_HEADER)).toBe("1");
    expect(error).toContain("nope.invalid");
    expect(error).toContain("DNS lookup failed");
    expect(error).toContain("ENOTFOUND");
    expect(error).not.toBe("fetch failed");
  });

  it("carries the target's untouched headers in an encoded copy, cookies included", async () => {
    const upstreamHeaders = new Headers({
      "cache-control": "max-age=60",
      "content-encoding": "gzip",
      "x-note": "café",
    });
    upstreamHeaders.append("set-cookie", "a=1; Path=/");
    upstreamHeaders.append("set-cookie", "b=2; HttpOnly");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("ok", { headers: upstreamHeaders })),
    );

    const res = await handleProxyRequest({ request: makeRequest("https://api.example.com") });

    // The transport copy is reqlo's: never cached, and no third-party cookies
    // handed to the browser for reqlo's own origin.
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.has("set-cookie")).toBe(false);

    const decoded = decodeUpstreamHeaders(res.headers.get(UPSTREAM_HEADERS_HEADER));
    expect(decoded).toMatchObject({
      "cache-control": "max-age=60",
      "content-encoding": "gzip",
      "x-note": "café",
      "set-cookie": "a=1; Path=/\nb=2; HttpOnly",
    });
    expect(decoded).not.toHaveProperty(PROXIED_HEADER);
  });
});

describe("upstream header encoding", () => {
  it("leaves the copy off when it would be too large, and decodes garbage to null", () => {
    expect(encodeUpstreamHeaders(new Headers({ "x-big": "y".repeat(20_000) }))).toBeNull();
    expect(decodeUpstreamHeaders("not base64 json")).toBeNull();
    expect(decodeUpstreamHeaders(null)).toBeNull();
  });

  describe("request body size", () => {
    const post = (body: BodyInit, headers: Record<string, string> = {}) =>
      makeRequest("https://api.example.com", { method: "POST", body, headers });

    it("refuses a body over REQLO_MAX_BODY_BYTES before forwarding anything", async () => {
      vi.stubEnv("REQLO_MAX_BODY_BYTES", "10");
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const res = await handleProxyRequest({ request: post("x".repeat(11)) });

      expect(res.status).toBe(413);
      expect(res.headers.get(PROXY_ERROR_HEADER)).toBe("1");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("counts while reading, so a missing or understated Content-Length doesn't get around it", async () => {
      vi.stubEnv("REQLO_MAX_BODY_BYTES", "10");
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(6));
          controller.enqueue(new Uint8Array(6));
          controller.close();
        },
      });
      const request = makeRequest("https://api.example.com", {
        method: "POST",
        body: stream,
        headers: { "content-length": "1" },
        // @ts-expect-error — required by undici for a streaming body
        duplex: "half",
      });

      const res = await handleProxyRequest({ request });

      expect(res.status).toBe(413);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("forwards a body at the limit intact", async () => {
      vi.stubEnv("REQLO_MAX_BODY_BYTES", "10");
      const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);

      const res = await handleProxyRequest({ request: post("0123456789") });

      expect(res.status).toBe(200);
      const sent = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body;
      expect(new TextDecoder().decode(sent as ArrayBuffer)).toBe("0123456789");
    });
  });
});
