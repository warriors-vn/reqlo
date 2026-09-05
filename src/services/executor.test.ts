import { afterEach, describe, expect, it, vi } from "vitest";
import { NO_ANCESTORS } from "@/services/inheritance";
import { executeRequest } from "@/services/executor";
import { normalizeApiRequest, uid, type ApiRequest, type HttpMethod } from "@/services/db";
import { MAX_RESPONSE_RENDER_LENGTH } from "@/lib/response-body-view";
import { PROXIED_HEADER, PROXY_TARGET_HEADER } from "@/services/proxy-constants";

function makeRequest(overrides: Partial<ApiRequest> = {}): ApiRequest {
  const now = Date.now();
  return normalizeApiRequest({
    id: uid(),
    workspaceId: "ws-1",
    name: "Req",
    method: "GET",
    url: "https://api.example.com",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe("executeRequest — mocked requests", () => {
  it("resolves normally when not cancelled", async () => {
    const request = makeRequest({
      mock: {
        enabled: true,
        status: 200,
        contentType: "application/json",
        body: "{}",
        delayMs: 10,
      },
    });
    const result = await executeRequest(request, null, NO_ANCESTORS);
    expect(result.mocked).toBe(true);
    expect(result.status).toBe(200);
  });

  it("aborts a mocked request's delay immediately instead of waiting it out", async () => {
    vi.useFakeTimers();
    try {
      const request = makeRequest({
        mock: {
          enabled: true,
          status: 200,
          contentType: "application/json",
          body: "{}",
          delayMs: 60_000,
        },
      });
      const controller = new AbortController();
      const pending = executeRequest(request, null, NO_ANCESTORS, { signal: controller.signal });

      // Cancel well before the mock's own 60s delay would resolve.
      await vi.advanceTimersByTimeAsync(100);
      controller.abort();
      await vi.advanceTimersByTimeAsync(0);

      const result = await pending;
      expect(result.error).toBe("Request cancelled.");
      expect(result.mocked).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("resolves immediately when the signal is already aborted before the delay starts", async () => {
    const request = makeRequest({
      mock: {
        enabled: true,
        status: 200,
        contentType: "application/json",
        body: "{}",
        delayMs: 60_000,
      },
    });
    const controller = new AbortController();
    controller.abort();

    const start = Date.now();
    const result = await executeRequest(request, null, NO_ANCESTORS, { signal: controller.signal });
    expect(Date.now() - start).toBeLessThan(1000);
    expect(result.error).toBe("Request cancelled.");
  });
});

describe("executeRequest — every send goes through /api/proxy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends to /api/proxy, never to the target URL directly", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      proxiedResponse("ok"),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await executeRequest(
      makeRequest({ url: "https://api.example.com/data" }),
      null,
      NO_ANCESTORS,
    );

    expect(result.status).toBe(200);
    expect(result.error).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/proxy");
  });

  it("passes the real target in the proxy header, absolute even for a relative URL", async () => {
    vi.stubGlobal("location", { protocol: "https:", origin: "https://app.reqlo.dev" });
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      proxiedResponse("ok"),
    );
    vi.stubGlobal("fetch", fetchMock);

    await executeRequest(makeRequest({ url: "/health" }), null, NO_ANCESTORS);

    const init = fetchMock.mock.calls[0][1]!;
    expect(new Headers(init.headers).get(PROXY_TARGET_HEADER)).toBe("https://app.reqlo.dev/health");
  });

  // The one case the direct-fetch fallback used to cover. Without a server,
  // /api/proxy falls through to the SPA shell and answers 200 with HTML — a
  // response that would otherwise be reported as the API's own.
  it("reports a missing proxy instead of passing off the SPA shell as a response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<!doctype html>", { status: 200 })),
    );

    const result = await executeRequest(
      makeRequest({ url: "https://api.example.com/data" }),
      null,
      NO_ANCESTORS,
    );

    expect(result.status).toBeNull();
    expect(result.error).toContain("no server behind it");
    expect(result.error).toContain("build:node");
  });

  // A CORS block can't happen any more — the only fetch the browser makes is
  // same-origin — so the failure that remains is reqlo's own server being
  // unreachable, and the message has to say that rather than blaming CORS.
  it("blames reqlo's own server, not CORS, when the proxy fetch itself fails", async () => {
    vi.stubGlobal("location", { protocol: "https:", origin: "https://app.reqlo.dev" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    const result = await executeRequest(
      makeRequest({ url: "https://api.example.com/data" }),
      null,
      NO_ANCESTORS,
    );

    expect(result.error).toContain("Couldn't reach reqlo's own server");
    expect(result.error).not.toContain("CORS");
  });

  it("reports offline when navigator.onLine is false", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    const result = await executeRequest(
      makeRequest({ url: "https://api.example.com" }),
      null,
      NO_ANCESTORS,
    );

    expect(result.error).toBe(
      "Couldn't send — this browser is currently offline, so nothing went out.",
    );
  });

  // Nothing about the method changes the path any more: there is no direct
  // attempt to skip, so every method makes exactly one request.
  it.each(["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"])(
    "sends a %s exactly once, through the proxy",
    async (method) => {
      const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
        proxiedResponse("ok"),
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await executeRequest(
        makeRequest({ url: "https://api.example.com/data", method: method as HttpMethod }),
        null,
        NO_ANCESTORS,
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe("/api/proxy");
      expect(result.status).toBe(200);
    },
  );

  it("keeps a mocked request off the network entirely", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      proxiedResponse("ok"),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await executeRequest(
      makeRequest({
        mock: {
          enabled: true,
          status: 201,
          contentType: "application/json",
          body: "{}",
          delayMs: 0,
        },
      }),
      null,
      NO_ANCESTORS,
    );

    expect(result.mocked).toBe(true);
    expect(result.status).toBe(201);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/** What the proxy route actually returns: the upstream response plus the
 * marker header the client uses to tell "reqlo's proxy answered" apart from
 * "something else answered on this path". */
function proxiedResponse(body: string, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set(PROXIED_HEADER, "1");
  return new Response(body, { status: 200, ...init, headers });
}

describe("executeRequest — post-response script", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const scripted = (source: string) =>
    makeRequest({
      url: "https://api.example.com/data",
      postResponseScript: { enabled: true, source },
    });

  it("runs tests against the real response and reports their outcomes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        proxiedResponse('{"token":"t-1"}', { headers: { "content-type": "application/json" } }),
      ),
    );

    const result = await executeRequest(
      scripted(`
        test("is 200", () => expect(response.status).toBe(200));
        test("has a token", () => expect(JSON.parse(response.body).token).toBe("nope"));
      `),
      null,
      NO_ANCESTORS,
    );

    expect(result.scriptTests?.map((t) => [t.name, t.passed])).toEqual([
      ["is 200", true],
      ["has a token", false],
    ]);
    expect(result.postScriptError).toBeUndefined();
  });

  it("feeds the script's environment patch back for the caller to persist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => proxiedResponse('{"token":"t-9"}')),
    );

    const result = await executeRequest(
      scripted(`return { environment: { authToken: JSON.parse(response.body).token } };`),
      null,
      NO_ANCESTORS,
    );

    expect(result.scriptEnvironmentPatch).toEqual({ authToken: "t-9" });
  });

  // The response already happened; a broken script is the script's problem.
  it("keeps the response intact when the script throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => proxiedResponse("ok", { status: 201 })),
    );

    const result = await executeRequest(
      scripted(`throw new Error("bad script");`),
      null,
      NO_ANCESTORS,
    );

    expect(result.status).toBe(201);
    expect(result.error).toBeUndefined();
    expect(result.postScriptError).toBe("bad script");
  });

  it("does not run when the script is disabled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => proxiedResponse("ok")),
    );

    const result = await executeRequest(
      makeRequest({
        url: "https://api.example.com/data",
        postResponseScript: {
          enabled: false,
          source: `test("x", () => { throw new Error("!"); });`,
        },
      }),
      null,
      NO_ANCESTORS,
    );

    expect(result.scriptTests).toBeUndefined();
    expect(result.postScriptError).toBeUndefined();
  });

  // A mock stands in for a response, so the checks that guard that response
  // have to run against it too — otherwise tests are dead exactly where the
  // mock is being relied on.
  it("runs against a mocked response, with no network call at all", async () => {
    const fetchMock = vi.fn(async () => proxiedResponse("ok"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await executeRequest(
      makeRequest({
        mock: {
          enabled: true,
          status: 418,
          contentType: "application/json",
          body: `{"brewing":false}`,
          delayMs: 0,
        },
        postResponseScript: {
          enabled: true,
          source: `test("teapot", () => expect(response.status).toBe(418));`,
        },
      }),
      null,
      NO_ANCESTORS,
    );

    expect(result.mocked).toBe(true);
    expect(result.scriptTests).toEqual([{ name: "teapot", passed: true, message: "" }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/** A `Response` whose body streams `chunks` (each a `Uint8Array`) one at a
 * time, so tests can exercise the real `ReadableStream` reader path instead
 * of the buffered `res.blob()` one. */
function makeStreamedResponse(chunks: Uint8Array[], headers: Record<string, string>): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    statusText: "OK",
    headers: { ...headers, [PROXIED_HEADER]: "1" },
  });
}

function utf8Chunks(...strings: string[]): Uint8Array[] {
  return strings.map((s) => new TextEncoder().encode(s));
}

describe("executeRequest — streaming responses", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports responseKind 'stream' and live chunks for a text/event-stream response", async () => {
    const frames = utf8Chunks("data: hello\n\n", "data: world\n\n");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => makeStreamedResponse(frames, { "content-type": "text/event-stream" })),
    );
    const onStreamChunk = vi.fn();
    const request = makeRequest({ url: "https://api.example.com/events" });
    const result = await executeRequest(request, null, NO_ANCESTORS, { onStreamChunk });

    expect(result.responseKind).toBe("stream");
    expect(result.body).toBe("data: hello\n\ndata: world\n\n");
    expect(onStreamChunk).toHaveBeenCalledWith("data: hello\n\n", "text/event-stream");
    expect(onStreamChunk).toHaveBeenCalledWith(
      "data: hello\n\ndata: world\n\n",
      "text/event-stream",
    );
  });

  it("streams a plain JSON response too, reporting live progress before it completes", async () => {
    const chunks = utf8Chunks('{"a":1,', '"b":2}');
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => makeStreamedResponse(chunks, { "content-type": "application/json" })),
    );
    const onStreamChunk = vi.fn();
    const request = makeRequest({ url: "https://api.example.com/data" });
    const result = await executeRequest(request, null, NO_ANCESTORS, { onStreamChunk });

    expect(result.responseKind).toBe("json");
    expect(result.body).toBe('{"a":1,"b":2}');
    expect(onStreamChunk.mock.calls.map((call) => call[0])).toEqual(['{"a":1,', '{"a":1,"b":2}']);
  });

  it("never streams a binary response — no chunk callback, body stays empty, blob is intact", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => makeStreamedResponse([bytes], { "content-type": "image/png" })),
    );
    const onStreamChunk = vi.fn();
    const request = makeRequest({ url: "https://api.example.com/pic.png" });
    const result = await executeRequest(request, null, NO_ANCESTORS, { onStreamChunk });

    expect(result.responseKind).toBe("image");
    expect(result.body).toBe("");
    expect(onStreamChunk).not.toHaveBeenCalled();
    expect(result.blob?.size).toBe(bytes.byteLength);
  });

  it("decodes a multi-byte UTF-8 character split across two chunks correctly", async () => {
    // "€" is 3 bytes in UTF-8 (0xE2 0x82 0xAC) at byte offset 7 — this cut
    // lands right after its first byte, splitting the character in two.
    const full = new TextEncoder().encode("price: €5");
    const chunks = [full.slice(0, 8), full.slice(8)];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => makeStreamedResponse(chunks, { "content-type": "text/plain" })),
    );
    const request = makeRequest({ url: "https://api.example.com/price" });
    const result = await executeRequest(request, null, NO_ANCESTORS);

    expect(result.body).toBe("price: €5");
  });

  it("reconstructs a full Blob from streamed chunks for Download to keep working", async () => {
    const chunks = utf8Chunks("hello ", "world");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => makeStreamedResponse(chunks, { "content-type": "text/plain" })),
    );
    const request = makeRequest({ url: "https://api.example.com/text" });
    const result = await executeRequest(request, null, NO_ANCESTORS);

    expect(await result.blob?.text()).toBe("hello world");
  });

  it("cancels an in-progress stream read when the signal aborts mid-stream", async () => {
    // Mirrors what a real fetch does internally: aborting the signal errors
    // the response body stream, which is what actually unblocks a pending
    // `reader.read()` — a bare `ReadableStream` doesn't wire that up on its
    // own, so the mock does it explicitly to stand in for the browser.
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
    const abortController = new AbortController();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
        controller.enqueue(new TextEncoder().encode("data: first\n\n"));
        // Deliberately never closes — a real long-lived SSE connection.
      },
    });
    abortController.signal.addEventListener("abort", () => {
      streamController?.error(new DOMException("Request cancelled.", "AbortError"));
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(body, {
            status: 200,
            headers: { "content-type": "text/event-stream", [PROXIED_HEADER]: "1" },
          }),
      ),
    );

    const request = makeRequest({ url: "https://api.example.com/events" });
    const pending = executeRequest(request, null, NO_ANCESTORS, { signal: abortController.signal });
    // Let the first chunk's read resolve before cancelling mid-stream.
    await Promise.resolve();
    await Promise.resolve();
    abortController.abort();

    const result = await pending;
    expect(result.error).toBe("Request cancelled.");
  });

  it("keeps invoking the live callback after the accumulated text crosses the render cap (no permanent freeze)", async () => {
    // Regression test: an earlier version gated the live callback on
    // `text.length <= MAX_RESPONSE_RENDER_LENGTH`, so once a long-lived
    // stream crossed that cap it stopped firing for the rest of the
    // connection — the live view would freeze mid-stream and look hung even
    // though data kept arriving.
    const overCap = new TextEncoder().encode("x".repeat(MAX_RESPONSE_RENDER_LENGTH + 10));
    const afterCap = new TextEncoder().encode("still going");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(overCap);
                controller.enqueue(afterCap);
                controller.close();
              },
            }),
            { status: 200, headers: { "content-type": "text/plain", [PROXIED_HEADER]: "1" } },
          ),
      ),
    );
    const onStreamChunk = vi.fn();
    const request = makeRequest({ url: "https://api.example.com/huge" });
    const result = await executeRequest(request, null, NO_ANCESTORS, { onStreamChunk });

    const lastCallText = onStreamChunk.mock.calls.at(-1)?.[0] as string;
    expect(lastCallText.endsWith("still going")).toBe(true);
    expect(result.body.endsWith("still going")).toBe(true);
  });
});
