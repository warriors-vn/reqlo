import { describe, expect, it, vi } from "vitest";
import { executeRequest } from "@/services/executor";
import { normalizeApiRequest, uid, type ApiRequest } from "@/services/db";

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
