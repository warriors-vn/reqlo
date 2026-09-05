import { describe, expect, it } from "vitest";
import { buildHarLog } from "@/services/har-export";
import { looksLikeHarLog, parseHarLog } from "@/services/har";
import {
  createDefaultBodyDrafts,
  createDefaultAuth,
  normalizeHistoryEntry,
  uid,
  type HistoryEntry,
} from "@/services/db";

function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return normalizeHistoryEntry({
    id: uid(),
    workspaceId: "ws-1",
    method: "GET",
    url: "https://api.example.com/users",
    ok: true,
    status: 200,
    durationMs: 42,
    sizeBytes: 13,
    executedAt: 1_700_000_000_000,
    responseContentType: "application/json",
    responseHeaders: { "content-type": "application/json" },
    responseBody: `{"ok":true}`,
    responseKind: "json",
    snapshot: {
      requestId: null,
      requestName: "List users",
      workspaceId: "ws-1",
      collectionId: null,
      method: "GET",
      url: "https://api.example.com/users",
      headers: [{ id: "h1", key: "Accept", value: "application/json", enabled: true }],
      queryParams: [],
      body: "",
      bodyType: "none",
      bodyDrafts: createDefaultBodyDrafts(),
      auth: createDefaultAuth(),
    },
    ...overrides,
  });
}

describe("buildHarLog", () => {
  it("produces a log reqlo's own HAR importer accepts", () => {
    const har = buildHarLog([makeEntry()]);
    expect(looksLikeHarLog(har)).toBe(true);
    expect(looksLikeHarLog(JSON.parse(JSON.stringify(har)))).toBe(true);
  });

  it("round-trips the request back through the HAR importer", () => {
    const har = buildHarLog([makeEntry()]);
    const back = parseHarLog(har, "ws-2");

    expect(back.requests).toHaveLength(1);
    expect(back.requests[0].url).toBe("https://api.example.com/users");
    expect(back.requests[0].method).toBe("GET");
    expect(back.requests[0].headers.map((h) => [h.key, h.value])).toEqual([
      ["Accept", "application/json"],
    ]);
  });

  it("orders entries oldest first, the way a capture would have recorded them", () => {
    const har = buildHarLog([
      makeEntry({ executedAt: 3000, url: "https://api.example.com/c" }),
      makeEntry({ executedAt: 1000, url: "https://api.example.com/a" }),
      makeEntry({ executedAt: 2000, url: "https://api.example.com/b" }),
    ]);
    expect(har.log.entries.map((e) => e.request.url)).toEqual([
      "https://api.example.com/a",
      "https://api.example.com/b",
      "https://api.example.com/c",
    ]);
  });

  it("writes a JSON body as postData the importer reads back", () => {
    const entry = makeEntry({
      method: "POST",
      snapshot: {
        ...makeEntry().snapshot,
        method: "POST",
        bodyType: "json",
        bodyDrafts: { ...createDefaultBodyDrafts(), json: `{"name":"x"}` },
      },
    });

    const har = buildHarLog([entry]);
    expect(har.log.entries[0].request.postData).toEqual({
      mimeType: "application/json",
      text: `{"name":"x"}`,
    });

    const back = parseHarLog(har, "ws-2");
    expect(back.requests[0].bodyDrafts.json).toBe(`{"name":"x"}`);
  });

  it("omits postData for a GET, which has no body to log", () => {
    const har = buildHarLog([makeEntry()]);
    expect(har.log.entries[0].request.postData).toBeUndefined();
    expect(har.log.entries[0].request.bodySize).toBe(0);
  });

  // A failed send has no status. Writing 200 would turn a recorded failure
  // into a recorded success in every HAR viewer that opens the file.
  it("records a failed send as status 0 with the error as its status text", () => {
    const har = buildHarLog([
      makeEntry({ status: null, ok: false, errorMessage: "Couldn't reach the server" }),
    ]);
    expect(har.log.entries[0].response.status).toBe(0);
    expect(har.log.entries[0].response.statusText).toBe("Couldn't reach the server");
  });

  // History caps large bodies. A consumer can't tell a clipped body from a
  // short one, so a clipped body is left out rather than passed off as whole.
  it("omits a truncated response body instead of exporting a partial one", () => {
    const har = buildHarLog([
      makeEntry({ responseBody: "clipped…", responseBodyTruncated: true, sizeBytes: 999_999 }),
    ]);
    expect(har.log.entries[0].response.content.text).toBeUndefined();
    expect(har.log.entries[0].response.content.size).toBe(999_999);
  });

  it("keeps a complete body", () => {
    const har = buildHarLog([makeEntry()]);
    expect(har.log.entries[0].response.content.text).toBe(`{"ok":true}`);
  });

  it("reports unknown wire sizes as HAR's -1 rather than guessing", () => {
    const har = buildHarLog([makeEntry()]);
    expect(har.log.entries[0].request.headersSize).toBe(-1);
    expect(har.log.entries[0].response.headersSize).toBe(-1);
  });

  it("writes an ISO timestamp a HAR viewer can place on a timeline", () => {
    const har = buildHarLog([makeEntry({ executedAt: 1_700_000_000_000 })]);
    expect(har.log.entries[0].startedDateTime).toBe(new Date(1_700_000_000_000).toISOString());
  });

  it("produces an empty but valid log for no history", () => {
    const har = buildHarLog([]);
    expect(looksLikeHarLog(har)).toBe(true);
    expect(har.log.entries).toEqual([]);
  });
});
