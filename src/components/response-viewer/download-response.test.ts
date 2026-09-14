// @vitest-environment jsdom
import "@/test/setup-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadResponse } from "@/components/response-viewer/download-response";
import type { ExecutionResult } from "@/services/execution";

function makeResult(overrides: Partial<ExecutionResult> = {}): ExecutionResult {
  return {
    status: 200,
    statusText: "OK",
    durationMs: 10,
    sizeBytes: 0,
    headers: {},
    body: "",
    contentType: "text/plain",
    ok: true,
    responseKind: "text",
    blob: null,
    fileName: null,
    ...overrides,
  };
}

let clickedAnchors: HTMLAnchorElement[];
let revokedUrls: string[];

beforeEach(() => {
  vi.useFakeTimers();
  clickedAnchors = [];
  revokedUrls = [];

  URL.createObjectURL = vi.fn(() => "blob:mock-url");
  URL.revokeObjectURL = vi.fn((url: string) => void revokedUrls.push(url));

  const realCreateElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    const el = realCreateElement(tag);
    if (tag === "a") {
      (el as HTMLAnchorElement).click = () => void clickedAnchors.push(el as HTMLAnchorElement);
    }
    return el;
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("downloadResponse", () => {
  it("prefers the captured blob over re-wrapping the decoded body", () => {
    const capturedBlob = new Blob(["binary payload"]);
    downloadResponse(makeResult({ blob: capturedBlob, body: "decoded text" }));

    expect(URL.createObjectURL).toHaveBeenCalledWith(capturedBlob);
  });

  it("wraps the decoded body in a Blob when no blob was captured", () => {
    downloadResponse(makeResult({ blob: null, body: "hello world", contentType: "text/plain" }));

    const [blobArg] = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(blobArg).toBeInstanceOf(Blob);
    expect(blobArg.type).toBe("text/plain");
  });

  it("falls back to text/plain when the response has no content type", () => {
    downloadResponse(makeResult({ blob: null, body: "hi", contentType: "" }));

    const [blobArg] = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(blobArg.type).toBe("text/plain");
  });

  it("uses the server-provided filename when present", () => {
    downloadResponse(makeResult({ fileName: "report.csv" }));

    expect(clickedAnchors).toHaveLength(1);
    expect(clickedAnchors[0].download).toBe("report.csv");
  });

  it.each([
    ["json", "application/json", "response.json"],
    ["html", "text/html", "response.html"],
    ["text", "text/plain", "response.txt"],
    ["stream", "text/event-stream", "response.txt"],
    ["pdf", "application/pdf", "response.pdf"],
    ["binary", "application/octet-stream", "response.bin"],
    ["empty", "", "response.bin"],
  ] as const)(
    "derives a %s filename from the response kind when none is given",
    (responseKind, contentType, expected) => {
      downloadResponse(makeResult({ responseKind, contentType, fileName: null }));

      expect(clickedAnchors[0].download).toBe(expected);
    },
  );

  it.each([
    ["image/png", "response.png"],
    ["image/jpeg", "response.jpg"],
    ["image/gif", "response.gif"],
    ["image/webp", "response.webp"],
    ["image/svg+xml", "response.svg"],
    ["image/x-unknown", "response.img"],
  ] as const)("infers the image extension from %s", (contentType, expected) => {
    downloadResponse(makeResult({ responseKind: "image", contentType, fileName: null }));

    expect(clickedAnchors[0].download).toBe(expected);
  });

  it("appends the anchor, clicks it, and removes it from the document", () => {
    const appendSpy = vi.spyOn(document.body, "appendChild");
    const removeSpy = vi.spyOn(HTMLElement.prototype, "remove");

    downloadResponse(makeResult({ fileName: "file.txt" }));

    expect(appendSpy).toHaveBeenCalled();
    expect(clickedAnchors).toHaveLength(1);
    expect(removeSpy).toHaveBeenCalled();
  });

  it("revokes the object URL after a delay instead of immediately", () => {
    downloadResponse(makeResult({ fileName: "file.txt" }));

    expect(revokedUrls).toHaveLength(0);
    vi.advanceTimersByTime(1000);
    expect(revokedUrls).toEqual(["blob:mock-url"]);
  });
});
