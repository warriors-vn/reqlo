import { describe, expect, it } from "vitest";
import { looksLikeHarLog, parseHarLog } from "@/services/har";

const WORKSPACE_ID = "ws-1";
type Doc = Parameters<typeof parseHarLog>[0];

function entry(overrides: Record<string, unknown> = {}) {
  return {
    request: {
      method: "GET",
      url: "https://api.example.com/users",
      headers: [],
      queryString: [],
      ...overrides,
    },
  };
}

describe("looksLikeHarLog", () => {
  it("accepts a document with log.entries as an array", () => {
    expect(looksLikeHarLog({ log: { entries: [] } })).toBe(true);
  });

  it("rejects a document missing log, or whose log.entries isn't an array", () => {
    expect(looksLikeHarLog({})).toBe(false);
    expect(looksLikeHarLog({ log: {} })).toBe(false);
    expect(looksLikeHarLog({ log: { entries: "nope" } })).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(looksLikeHarLog(null)).toBe(false);
    expect(looksLikeHarLog("nope")).toBe(false);
  });
});

describe("parseHarLog", () => {
  it("maps a simple GET entry, naming it 'METHOD /path'", () => {
    const doc: Doc = { log: { entries: [entry()] } };
    const result = parseHarLog(doc, WORKSPACE_ID);
    expect(result.collectionName).toBe("Imported from HAR");
    expect(result.requests).toHaveLength(1);
    const [req] = result.requests;
    expect(req.method).toBe("GET");
    expect(req.name).toBe("GET /users");
    expect(req.url).toBe("https://api.example.com/users");
  });

  it("uppercases the method and defaults to GET when missing", () => {
    const doc: Doc = {
      log: { entries: [entry({ method: "post" }), entry({ method: undefined })] },
    };
    const result = parseHarLog(doc, WORKSPACE_ID);
    expect(result.requests[0].method).toBe("POST");
    expect(result.requests[1].method).toBe("GET");
  });

  it("skips an entry with no URL, warning with the count", () => {
    const doc: Doc = { log: { entries: [entry({ url: undefined }), entry()] } };
    const result = parseHarLog(doc, WORKSPACE_ID);
    expect(result.requests).toHaveLength(1);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("1 entry was skipped")]),
    );
  });

  it("skips an entry with an unparseable URL", () => {
    const doc: Doc = { log: { entries: [entry({ url: "not a url" })] } };
    const result = parseHarLog(doc, WORKSPACE_ID);
    expect(result.requests).toHaveLength(0);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("1 entry was skipped")]),
    );
  });

  it.each(["data:text/plain;base64,aGk=", "chrome-extension://abc/page.html", "about:blank"])(
    "skips a %s entry",
    (url) => {
      const doc: Doc = { log: { entries: [entry({ url })] } };
      const result = parseHarLog(doc, WORKSPACE_ID);
      expect(result.requests).toHaveLength(0);
    },
  );

  it("always warns that HAR files can contain live credentials, when anything was imported", () => {
    const doc: Doc = { log: { entries: [entry()] } };
    const result = parseHarLog(doc, WORKSPACE_ID);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("live cookies and auth headers")]),
    );
  });

  it("doesn't warn about credentials when nothing was actually imported", () => {
    const doc: Doc = { log: { entries: [entry({ url: undefined })] } };
    const result = parseHarLog(doc, WORKSPACE_ID);
    expect(result.warnings.join(" ")).not.toContain("live cookies");
  });

  describe("folders by origin", () => {
    it("groups entries into one folder per distinct origin", () => {
      const doc: Doc = {
        log: {
          entries: [
            entry({ url: "https://api.example.com/a" }),
            entry({ url: "https://other.example.com/b" }),
            entry({ url: "https://api.example.com/c" }),
          ],
        },
      };
      const result = parseHarLog(doc, WORKSPACE_ID);
      expect(result.folders.map((f) => f.name)).toEqual([
        "https://api.example.com",
        "https://other.example.com",
      ]);
      const apiFolder = result.folders.find((f) => f.name === "https://api.example.com")!;
      const otherFolder = result.folders.find((f) => f.name === "https://other.example.com")!;
      expect(result.requests[0].folderId).toBe(apiFolder.id);
      expect(result.requests[1].folderId).toBe(otherFolder.id);
      expect(result.requests[2].folderId).toBe(apiFolder.id);
    });

    it("treats http and https on the same host as different origins", () => {
      const doc: Doc = {
        log: {
          entries: [
            entry({ url: "http://api.example.com/a" }),
            entry({ url: "https://api.example.com/a" }),
          ],
        },
      };
      const result = parseHarLog(doc, WORKSPACE_ID);
      expect(result.folders).toHaveLength(2);
    });
  });

  describe("headers and query params", () => {
    it("maps headers, dropping HTTP/2 pseudo-headers", () => {
      const doc: Doc = {
        log: {
          entries: [
            entry({
              headers: [
                { name: "Accept", value: "application/json" },
                { name: ":authority", value: "api.example.com" },
              ],
            }),
          ],
        },
      };
      const req = parseHarLog(doc, WORKSPACE_ID).requests[0];
      expect(req.headers).toEqual([
        expect.objectContaining({ key: "Accept", value: "application/json", enabled: true }),
      ]);
    });

    it("strips the query string from the URL and moves it into queryParams instead", () => {
      const doc: Doc = {
        log: {
          entries: [
            entry({
              url: "https://api.example.com/users?limit=10&sort=asc",
              queryString: [
                { name: "limit", value: "10" },
                { name: "sort", value: "asc" },
              ],
            }),
          ],
        },
      };
      const req = parseHarLog(doc, WORKSPACE_ID).requests[0];
      expect(req.url).toBe("https://api.example.com/users");
      expect(req.queryParams).toEqual([
        expect.objectContaining({ key: "limit", value: "10", enabled: true }),
        expect.objectContaining({ key: "sort", value: "asc", enabled: true }),
      ]);
    });

    it("falls back to parsing the URL's own search params when queryString is absent", () => {
      const doc: Doc = {
        log: {
          entries: [entry({ url: "https://api.example.com/users?q=hi", queryString: undefined })],
        },
      };
      const req = parseHarLog(doc, WORKSPACE_ID).requests[0];
      expect(req.queryParams).toEqual([
        expect.objectContaining({ key: "q", value: "hi", enabled: true }),
      ]);
    });
  });

  describe("body", () => {
    it("maps a JSON postData body", () => {
      const doc: Doc = {
        log: {
          entries: [
            entry({
              method: "POST",
              postData: { mimeType: "application/json", text: '{"a":1}' },
            }),
          ],
        },
      };
      const req = parseHarLog(doc, WORKSPACE_ID).requests[0];
      expect(req.bodyType).toBe("json");
      expect(req.bodyDrafts.json).toBe('{"a":1}');
    });

    it("ignores a charset suffix on the mimeType", () => {
      const doc: Doc = {
        log: {
          entries: [
            entry({ postData: { mimeType: "application/json; charset=utf-8", text: "{}" } }),
          ],
        },
      };
      expect(parseHarLog(doc, WORKSPACE_ID).requests[0].bodyType).toBe("json");
    });

    it("maps a urlencoded body from postData.params", () => {
      const doc: Doc = {
        log: {
          entries: [
            entry({
              postData: {
                mimeType: "application/x-www-form-urlencoded",
                params: [{ name: "a", value: "1" }],
              },
            }),
          ],
        },
      };
      const req = parseHarLog(doc, WORKSPACE_ID).requests[0];
      expect(req.bodyType).toBe("x-www-form-urlencoded");
      expect(req.bodyDrafts.urlEncoded).toEqual([
        expect.objectContaining({ key: "a", value: "1", enabled: true }),
      ]);
    });

    it("maps a form-data body and warns about file fields", () => {
      const doc: Doc = {
        log: {
          entries: [
            entry({
              method: "POST",
              url: "https://api.example.com/upload",
              postData: {
                mimeType: "multipart/form-data",
                params: [
                  { name: "note", value: "hi" },
                  { name: "avatar", fileName: "a.png" },
                ],
              },
            }),
          ],
        },
      };
      const result = parseHarLog(doc, WORKSPACE_ID);
      const req = result.requests[0];
      expect(req.bodyType).toBe("form-data");
      expect(req.bodyDrafts.formData).toEqual([
        expect.objectContaining({ key: "note", value: "hi", kind: "text" }),
        expect.objectContaining({ key: "avatar", value: "", kind: "file" }),
      ]);
      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.stringContaining("form-data file field")]),
      );
    });

    it("falls back to raw text when postData has no recognizable structure", () => {
      const doc: Doc = {
        log: { entries: [entry({ postData: { mimeType: "text/plain", text: "hello" } })] },
      };
      const req = parseHarLog(doc, WORKSPACE_ID).requests[0];
      expect(req.bodyType).toBe("raw");
      expect(req.bodyDrafts.raw).toBe("hello");
    });

    it("treats a GET with no postData as bodyType none", () => {
      const doc: Doc = { log: { entries: [entry()] } };
      expect(parseHarLog(doc, WORKSPACE_ID).requests[0].bodyType).toBe("none");
    });
  });
});
