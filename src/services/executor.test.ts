import { afterEach, describe, expect, it, vi } from "vitest";
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
    const result = await executeRequest(request, null);
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
      const pending = executeRequest(request, null, { signal: controller.signal });

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
    const result = await executeRequest(request, null, { signal: controller.signal });
    expect(Date.now() - start).toBeLessThan(1000);
    expect(result.error).toBe("Request cancelled.");
  });
});

describe("executeRequest — send-failure diagnosis", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports offline when navigator.onLine is false, regardless of the thrown error", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const request = makeRequest({ url: "https://api.example.com" });
    const result = await executeRequest(request, null);
    expect(result.error).toBe(
      "Couldn't send — this browser is currently offline, so nothing went out.",
    );
  });

  it("flags mixed content when the page is https and the request URL is http", async () => {
    vi.stubGlobal("location", { protocol: "https:", origin: "https://app.reqlo.dev" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const request = makeRequest({ url: "http://api.example.com" });
    const result = await executeRequest(request, null);
    expect(result.error).toContain("mixed content");
    expect(result.error).toContain("http://");
  });

  it("flags a likely CORS block for a cross-origin TypeError with no status", async () => {
    vi.stubGlobal("location", { protocol: "https:", origin: "https://app.reqlo.dev" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const request = makeRequest({ url: "https://api.example.com" });
    const result = await executeRequest(request, null);
    expect(result.error).toContain("CORS");
  });

  it("falls back to the generic message when nothing more specific applies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("boom");
      }),
    );
    const request = makeRequest({ url: "https://api.example.com" });
    const result = await executeRequest(request, null);
    expect(result.error).toBe("Request failed: boom. Check the URL, CORS, or network connection.");
  });
});

describe("executeRequest — CORS-block proxy retry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retries through /api/proxy and succeeds when it carries the proxied marker header", async () => {
    vi.stubGlobal("location", { protocol: "https:", origin: "https://app.reqlo.dev" });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/proxy") {
        expect(new Headers(init?.headers).get(PROXY_TARGET_HEADER)).toBe(
          "https://api.example.com/data",
        );
        return new Response("ok", { status: 200, headers: { [PROXIED_HEADER]: "1" } });
      }
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);

    const request = makeRequest({ url: "https://api.example.com/data" });
    const result = await executeRequest(request, null);

    expect(result.viaProxy).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to the normal CORS message when the proxy response carries no marker header (route doesn't exist in this deployment)", async () => {
    vi.stubGlobal("location", { protocol: "https:", origin: "https://app.reqlo.dev" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "/api/proxy") {
          return new Response("Not Found", { status: 404 });
        }
        throw new TypeError("Failed to fetch");
      }),
    );

    const request = makeRequest({ url: "https://api.example.com/data" });
    const result = await executeRequest(request, null);

    expect(result.viaProxy).toBeFalsy();
    expect(result.error).toContain("CORS");
  });

  it("never retries a same-origin failure through the proxy", async () => {
    vi.stubGlobal("location", { protocol: "https:", origin: "https://api.example.com" });
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);

    const request = makeRequest({ url: "https://api.example.com/data" });
    await executeRequest(request, null);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // A CORS block only ever means the browser withheld the *response* — for
  // a "simple request" (e.g. a form-urlencoded POST with no custom headers),
  // the real request can already have reached the server with no preflight
  // at all. Auto-retrying one of those through the proxy risks silently
  // firing the same side-effecting call twice, so only safe/idempotent
  // methods (GET/HEAD/OPTIONS) are retried automatically.
  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "never auto-retries a %s through the proxy, even when it looks CORS-blocked",
    async (method) => {
      vi.stubGlobal("location", { protocol: "https:", origin: "https://app.reqlo.dev" });
      const fetchMock = vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      });
      vi.stubGlobal("fetch", fetchMock);

      const request = makeRequest({
        url: "https://api.example.com/data",
        method: method as HttpMethod,
      });
      const result = await executeRequest(request, null);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.viaProxy).toBeFalsy();
      expect(result.error).toContain("CORS");
    },
  );

  it.each(["GET", "HEAD", "OPTIONS"])(
    "does auto-retry a safe %s through the proxy",
    async (method) => {
      vi.stubGlobal("location", { protocol: "https:", origin: "https://app.reqlo.dev" });
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "/api/proxy") {
          return new Response("ok", { status: 200, headers: { [PROXIED_HEADER]: "1" } });
        }
        throw new TypeError("Failed to fetch");
      });
      vi.stubGlobal("fetch", fetchMock);

      const request = makeRequest({
        url: "https://api.example.com/data",
        method: method as HttpMethod,
      });
      const result = await executeRequest(request, null);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.viaProxy).toBe(true);
    },
  );
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
  return new Response(body, { status: 200, statusText: "OK", headers });
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
    const result = await executeRequest(request, null, { onStreamChunk });

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
    const result = await executeRequest(request, null, { onStreamChunk });

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
    const result = await executeRequest(request, null, { onStreamChunk });

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
    const result = await executeRequest(request, null);

    expect(result.body).toBe("price: €5");
  });

  it("reconstructs a full Blob from streamed chunks for Download to keep working", async () => {
    const chunks = utf8Chunks("hello ", "world");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => makeStreamedResponse(chunks, { "content-type": "text/plain" })),
    );
    const request = makeRequest({ url: "https://api.example.com/text" });
    const result = await executeRequest(request, null);

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
          new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }),
      ),
    );

    const request = makeRequest({ url: "https://api.example.com/events" });
    const pending = executeRequest(request, null, { signal: abortController.signal });
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
            { status: 200, headers: { "content-type": "text/plain" } },
          ),
      ),
    );
    const onStreamChunk = vi.fn();
    const request = makeRequest({ url: "https://api.example.com/huge" });
    const result = await executeRequest(request, null, { onStreamChunk });

    const lastCallText = onStreamChunk.mock.calls.at(-1)?.[0] as string;
    expect(lastCallText.endsWith("still going")).toBe(true);
    expect(result.body.endsWith("still going")).toBe(true);
  });
});
