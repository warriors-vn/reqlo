import { describe, expect, it } from "vitest";
import { buildHistoryCompareSections } from "@/features/request-history/utils/compare";
import type { HistoryEntry, RequestSnapshot } from "@/services/db";

function makeSnapshot(overrides: Partial<RequestSnapshot> = {}): RequestSnapshot {
  return {
    requestId: "req-1",
    requestName: "Get user",
    workspaceId: "ws-1",
    collectionId: null,
    method: "GET",
    url: "https://api.example.com/users/1",
    headers: [],
    queryParams: [],
    body: "",
    bodyType: "none",
    bodyDrafts: {
      json: "",
      raw: "",
      xml: "",
      formData: [],
      urlEncoded: [],
      binary: { file: null },
      graphql: { query: "", variables: "", operationName: "" },
    },
    auth: { type: "none" },
    ...overrides,
  };
}

function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: "hist-1",
    workspaceId: "ws-1",
    requestId: "req-1",
    requestName: "Get user",
    method: "GET",
    url: "https://api.example.com/users/1",
    status: 200,
    ok: true,
    durationMs: 120,
    sizeBytes: 256,
    executedAt: 1_700_000_000_000,
    environmentId: null,
    environmentName: "Production",
    favorite: false,
    pinned: false,
    searchText: "",
    snapshot: makeSnapshot(),
    responseKind: "json",
    responseContentType: "application/json",
    responseHeaders: { "content-type": "application/json" },
    responseBody: '{"id":1,"name":"Ada"}',
    responseBodyTruncated: false,
    ...overrides,
  };
}

describe("buildHistoryCompareSections", () => {
  it("marks an identical pair of entries with no changed overview rows", () => {
    const left = makeEntry();
    const right = makeEntry({ id: "hist-2" });
    const sections = buildHistoryCompareSections(left, right);

    const overview = sections.find((s) => s.title === "Overview");
    expect(overview?.kind).toBe("rows");
    if (overview?.kind === "rows") {
      expect(overview.rows.every((row) => !row.changed)).toBe(true);
    }
  });

  it("flags overview fields that differ between the two entries", () => {
    const left = makeEntry({ method: "GET", status: 200 });
    const right = makeEntry({ method: "POST", status: 500, errorMessage: "boom" });
    const sections = buildHistoryCompareSections(left, right);

    const overview = sections.find((s) => s.title === "Overview");
    expect(overview?.kind).toBe("rows");
    if (overview?.kind === "rows") {
      const methodRow = overview.rows.find((r) => r.label === "Method");
      const statusRow = overview.rows.find((r) => r.label === "Status");
      expect(methodRow).toEqual({ label: "Method", left: "GET", right: "POST", changed: true });
      expect(statusRow?.changed).toBe(true);
      expect(statusRow?.right).toBe("ERR · boom");
    }
  });

  it("diffs request headers into added/removed/changed entries", () => {
    const left = makeEntry({
      snapshot: makeSnapshot({
        headers: [
          { id: "h1", key: "Authorization", value: "Bearer old", enabled: true },
          { id: "h2", key: "X-Stays-Same", value: "same", enabled: true },
          { id: "h3", key: "X-Removed", value: "gone", enabled: true },
        ],
      }),
    });
    const right = makeEntry({
      snapshot: makeSnapshot({
        headers: [
          { id: "h1", key: "Authorization", value: "Bearer new", enabled: true },
          { id: "h2", key: "X-Stays-Same", value: "same", enabled: true },
          { id: "h4", key: "X-Added", value: "new", enabled: true },
        ],
      }),
    });
    const sections = buildHistoryCompareSections(left, right);

    const headerSection = sections.find((s) => s.title === "Request headers");
    expect(headerSection?.kind).toBe("diff-list");
    if (headerSection?.kind === "diff-list") {
      const byKey = Object.fromEntries(headerSection.entries.map((e) => [e.key, e]));
      expect(byKey["Authorization"]).toMatchObject({
        state: "changed",
        left: "Bearer old",
        right: "Bearer new",
      });
      expect(byKey["X-Removed"]).toMatchObject({ state: "removed", right: "—" });
      expect(byKey["X-Added"]).toMatchObject({ state: "added", left: "—" });
      expect(byKey["X-Stays-Same"]).toBeUndefined();
    }
  });

  it("excludes disabled headers from the diff", () => {
    const left = makeEntry({
      snapshot: makeSnapshot({
        headers: [{ id: "h1", key: "X-Disabled", value: "left", enabled: false }],
      }),
    });
    const right = makeEntry({
      snapshot: makeSnapshot({
        headers: [{ id: "h1", key: "X-Disabled", value: "right", enabled: false }],
      }),
    });
    const sections = buildHistoryCompareSections(left, right);
    const headerSection = sections.find((s) => s.title === "Request headers");
    expect(headerSection?.kind).toBe("diff-list");
    if (headerSection?.kind === "diff-list") {
      expect(headerSection.entries).toHaveLength(0);
    }
  });

  it("diffs JSON request bodies field-by-field when both sides parse as JSON", () => {
    const left = makeEntry({
      snapshot: makeSnapshot({
        bodyType: "json",
        body: JSON.stringify({ name: "Ada", age: 30, tags: ["a", "b"] }),
      }),
    });
    const right = makeEntry({
      snapshot: makeSnapshot({
        bodyType: "json",
        body: JSON.stringify({ name: "Grace", age: 30, tags: ["a"] }),
      }),
    });
    const sections = buildHistoryCompareSections(left, right);

    const bodySection = sections.find((s) => s.title === "Request body");
    expect(bodySection?.kind).toBe("diff-list");
    if (bodySection?.kind === "diff-list") {
      const byKey = Object.fromEntries(bodySection.entries.map((e) => [e.key, e]));
      expect(byKey["$.name"]).toMatchObject({ state: "changed", left: "Ada", right: "Grace" });
      expect(byKey["$.age"]).toBeUndefined();
      expect(byKey["$.tags[1]"]).toMatchObject({ state: "removed", left: "b" });
    }
  });

  it("falls back to a line-based text diff when a body isn't JSON", () => {
    const left = makeEntry({
      snapshot: makeSnapshot({ bodyType: "raw", body: "line one\nline two" }),
    });
    const right = makeEntry({
      snapshot: makeSnapshot({ bodyType: "raw", body: "line one\nline three" }),
    });
    const sections = buildHistoryCompareSections(left, right);

    const bodySection = sections.find((s) => s.title === "Request body");
    expect(bodySection?.kind).toBe("text");
    if (bodySection?.kind === "text") {
      // Matching lines (the shared "line one") aren't emitted at all — only
      // the differing lines show up as entries, each marked changed.
      expect(bodySection.entries.every((e) => e.changed)).toBe(true);
      expect(bodySection.entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ left: "line two", right: "" }),
          expect.objectContaining({ left: "", right: "line three" }),
        ]),
      );
    }
  });

  it("collapses an empty-vs-empty body into a single unchanged row", () => {
    const left = makeEntry({ snapshot: makeSnapshot({ body: "   " }) });
    const right = makeEntry({ snapshot: makeSnapshot({ body: "" }) });
    const sections = buildHistoryCompareSections(left, right);

    // A body section with only "—"/"—" rows has no differences and gets
    // filtered out of the final section list entirely.
    const bodySection = sections.find((s) => s.title === "Request body");
    expect(bodySection).toBeUndefined();
  });

  it("diffs response headers independently of request headers", () => {
    const left = makeEntry({ responseHeaders: { "x-request-id": "abc" } });
    const right = makeEntry({ responseHeaders: { "x-request-id": "xyz" } });
    const sections = buildHistoryCompareSections(left, right);

    const section = sections.find((s) => s.title === "Response headers");
    expect(section?.kind).toBe("diff-list");
    if (section?.kind === "diff-list") {
      expect(section.entries).toEqual([
        { key: "x-request-id", left: "abc", right: "xyz", state: "changed" },
      ]);
    }
  });

  it("keeps a diff-list section with no entries when both sides match", () => {
    // Unlike a "rows" section, a diff-list section always carries an
    // emptyLabel for its no-differences state, so it stays in the result
    // (with zero entries) rather than being dropped.
    const left = makeEntry();
    const right = makeEntry({ id: "hist-2" });
    const sections = buildHistoryCompareSections(left, right);

    const section = sections.find((s) => s.title === "Response headers");
    expect(section?.kind).toBe("diff-list");
    if (section?.kind === "diff-list") {
      expect(section.entries).toEqual([]);
      expect(section.emptyLabel).toBe("No response header differences.");
    }
  });
});
