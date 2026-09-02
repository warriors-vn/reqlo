import { describe, expect, it } from "vitest";
import { buildMockFromResponse, type MockSourceResponse } from "@/services/mock-from-response";

function makeSource(overrides: Partial<MockSourceResponse> = {}): MockSourceResponse {
  return {
    status: 200,
    contentType: "application/json",
    body: '{"ok":true}',
    responseKind: "json",
    truncated: false,
    hasError: false,
    ...overrides,
  };
}

describe("buildMockFromResponse", () => {
  it("builds a mock patch from a normal textual response", () => {
    const result = buildMockFromResponse(makeSource());
    expect(result).toEqual({
      ok: true,
      mock: { status: 200, contentType: "application/json", body: '{"ok":true}' },
    });
  });

  it("defaults status to 200 when the response has no status", () => {
    const result = buildMockFromResponse(makeSource({ status: null }));
    expect(result.ok).toBe(true);
    expect(result.ok && result.mock.status).toBe(200);
  });

  it("refuses a failed send", () => {
    const result = buildMockFromResponse(makeSource({ hasError: true }));
    expect(result).toEqual({ ok: false, reason: "This send didn't get a real response to save." });
  });

  it.each(["binary", "image", "pdf"] as const)("refuses a %s response", (responseKind) => {
    const result = buildMockFromResponse(makeSource({ responseKind }));
    expect(result.ok).toBe(false);
    expect(result.ok || result.reason).toContain("text only");
  });

  it("allows an empty response (e.g. 204)", () => {
    const result = buildMockFromResponse(
      makeSource({ responseKind: "empty", body: "", status: 204 }),
    );
    expect(result).toEqual({
      ok: true,
      mock: { status: 204, contentType: "application/json", body: "" },
    });
  });

  it("refuses a stream (SSE) response, distinctly from the binary/image/pdf reason", () => {
    const result = buildMockFromResponse(
      makeSource({ responseKind: "stream", contentType: "text/event-stream" }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok || result.reason).toContain("static body to replay");
    expect(result.ok || result.reason).not.toContain("text only");
  });

  it("refuses a truncated response", () => {
    const result = buildMockFromResponse(makeSource({ truncated: true }));
    expect(result.ok).toBe(false);
    expect(result.ok || result.reason).toContain("too large");
  });
});
