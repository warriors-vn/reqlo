import { describe, expect, it } from "vitest";
import { looksLikePostmanCollection, parsePostmanCollection } from "@/services/postman";

const WORKSPACE_ID = "ws-1";
type Doc = Parameters<typeof parsePostmanCollection>[0];

describe("looksLikePostmanCollection", () => {
  it("accepts a v2.1 collection with an item array", () => {
    expect(
      looksLikePostmanCollection({
        info: { schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
        item: [],
      }),
    ).toBe(true);
  });

  it("accepts a v2.0 collection too", () => {
    expect(
      looksLikePostmanCollection({
        info: { schema: "https://schema.getpostman.com/json/collection/v2.0.0/collection.json" },
        item: [],
      }),
    ).toBe(true);
  });

  it("rejects a document with no schema string, or missing item array", () => {
    expect(looksLikePostmanCollection({ info: {}, item: [] })).toBe(false);
    expect(looksLikePostmanCollection({ info: { schema: "v2.1" } })).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(looksLikePostmanCollection(null)).toBe(false);
    expect(looksLikePostmanCollection("nope")).toBe(false);
  });
});

describe("parsePostmanCollection", () => {
  it("maps a simple request and defaults the method to GET", () => {
    const doc: Doc = {
      info: { name: "My Collection" },
      item: [{ name: "List users", request: { url: "https://api.example.com/users" } }],
    };
    const result = parsePostmanCollection(doc, WORKSPACE_ID);
    expect(result.collectionName).toBe("My Collection");
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0].method).toBe("GET");
    expect(result.requests[0].name).toBe("List users");
    expect(result.requests[0].url).toBe("https://api.example.com/users");
  });

  it("falls back to placeholder names for the collection and an unnamed request", () => {
    const doc: Doc = { item: [{ request: { url: "https://api.example.com" } }] };
    const result = parsePostmanCollection(doc, WORKSPACE_ID);
    expect(result.collectionName).toBe("Imported from Postman");
    expect(result.requests[0].name).toBe("Untitled request");
  });

  it("uppercases the method", () => {
    const doc: Doc = { item: [{ request: { method: "post", url: "https://api.example.com" } }] };
    expect(parsePostmanCollection(doc, WORKSPACE_ID).requests[0].method).toBe("POST");
  });

  describe("URL forms", () => {
    it("uses the raw string URL form as-is", () => {
      const doc: Doc = { item: [{ request: { url: "https://api.example.com/x?y=1" } }] };
      const result = parsePostmanCollection(doc, WORKSPACE_ID);
      expect(result.requests[0].url).toBe("https://api.example.com/x?y=1");
      expect(result.requests[0].queryParams).toEqual([]);
    });

    it("prefers the object form's raw field when present", () => {
      const doc: Doc = {
        item: [
          {
            request: {
              url: { raw: "https://api.example.com/x?y=1", query: [{ key: "y", value: "1" }] },
            },
          },
        ],
      };
      const result = parsePostmanCollection(doc, WORKSPACE_ID);
      expect(result.requests[0].url).toBe("https://api.example.com/x?y=1");
      expect(result.requests[0].queryParams).toEqual([
        { id: expect.any(String), key: "y", value: "1", enabled: true },
      ]);
    });

    it("reassembles a URL from protocol/host/path arrays when raw is absent", () => {
      const doc: Doc = {
        item: [
          {
            request: {
              url: {
                protocol: "https",
                host: ["api", "example", "com"],
                path: ["v1", "users"],
              },
            },
          },
        ],
      };
      const result = parsePostmanCollection(doc, WORKSPACE_ID);
      expect(result.requests[0].url).toBe("https://api.example.com/v1/users");
    });

    it("reassembles a URL from string host/path when raw is absent", () => {
      const doc: Doc = {
        item: [{ request: { url: { protocol: "https", host: "api.example.com", path: "users" } } }],
      };
      const result = parsePostmanCollection(doc, WORKSPACE_ID);
      expect(result.requests[0].url).toBe("https://api.example.com/users");
    });

    it("keeps disabled query params but with 'enabled: false' rather than dropping them", () => {
      const doc: Doc = {
        item: [
          {
            request: {
              url: {
                raw: "https://api.example.com",
                query: [
                  { key: "a", value: "1" },
                  { key: "b", value: "2", disabled: true },
                ],
              },
            },
          },
        ],
      };
      const result = parsePostmanCollection(doc, WORKSPACE_ID);
      expect(result.requests[0].queryParams).toEqual([
        { id: expect.any(String), key: "a", value: "1", enabled: true },
        { id: expect.any(String), key: "b", value: "2", enabled: false },
      ]);
    });

    it("returns an empty URL and no query params when the request has no url at all", () => {
      const doc: Doc = { item: [{ request: {} }] };
      const result = parsePostmanCollection(doc, WORKSPACE_ID);
      expect(result.requests[0].url).toBe("");
      expect(result.requests[0].queryParams).toEqual([]);
    });
  });

  describe("headers", () => {
    it("maps headers and respects the disabled flag", () => {
      const doc: Doc = {
        item: [
          {
            request: {
              url: "https://api.example.com",
              header: [
                { key: "Content-Type", value: "application/json" },
                { key: "X-Off", value: "1", disabled: true },
              ],
            },
          },
        ],
      };
      const result = parsePostmanCollection(doc, WORKSPACE_ID);
      expect(result.requests[0].headers).toEqual([
        { id: expect.any(String), key: "Content-Type", value: "application/json", enabled: true },
        { id: expect.any(String), key: "X-Off", value: "1", enabled: false },
      ]);
    });

    it("skips header entries with no key", () => {
      const doc: Doc = {
        item: [{ request: { url: "https://api.example.com", header: [{ key: "", value: "x" }] } }],
      };
      expect(parsePostmanCollection(doc, WORKSPACE_ID).requests[0].headers).toEqual([]);
    });
  });

  describe("nested folders", () => {
    it("walks nested folders, assigning parentFolderId and position", () => {
      const doc: Doc = {
        item: [
          {
            name: "Outer",
            item: [
              { request: { url: "https://api.example.com/root" } },
              {
                name: "Inner",
                item: [{ name: "Nested req", request: { url: "https://api.example.com/nested" } }],
              },
            ],
          },
        ],
      };
      const result = parsePostmanCollection(doc, WORKSPACE_ID);
      expect(result.folders.map((f) => f.name)).toEqual(["Outer", "Inner"]);

      const outer = result.folders.find((f) => f.name === "Outer")!;
      const inner = result.folders.find((f) => f.name === "Inner")!;
      expect(outer.parentFolderId).toBeNull();
      expect(inner.parentFolderId).toBe(outer.id);
      // Outer is the only top-level item; Inner is the second item inside Outer.
      expect(outer.position).toBe(0);
      expect(inner.position).toBe(1);

      const rootReq = result.requests.find((r) => r.url.endsWith("/root"))!;
      const nestedReq = result.requests.find((r) => r.name === "Nested req")!;
      expect(rootReq.folderId).toBe(outer.id);
      expect(nestedReq.folderId).toBe(inner.id);
      // rootReq is the first item inside Outer; nestedReq the first inside Inner.
      expect(rootReq.position).toBe(0);
      expect(nestedReq.position).toBe(0);
    });

    it("returns no folders or requests for an entirely empty top-level collection", () => {
      const doc: Doc = { item: [] };
      const result = parsePostmanCollection(doc, WORKSPACE_ID);
      expect(result.folders).toEqual([]);
      expect(result.requests).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it("treats an item with an empty item array as a folder, not a request", () => {
      const doc: Doc = { item: [{ name: "Empty folder", item: [] }] };
      const result = parsePostmanCollection(doc, WORKSPACE_ID);
      expect(result.folders).toHaveLength(1);
      expect(result.folders[0].name).toBe("Empty folder");
      expect(result.requests).toHaveLength(0);
    });

    it("defaults an unnamed folder's name and puts top-level requests at the root", () => {
      const doc: Doc = {
        item: [{ item: [] }, { request: { url: "https://api.example.com/root" } }],
      };
      const result = parsePostmanCollection(doc, WORKSPACE_ID);
      expect(result.folders[0].name).toBe("Untitled folder");
      expect(result.requests[0].folderId).toBeNull();
    });
  });

  describe("body modes", () => {
    it("infers bodyType json for a JSON-looking raw body", () => {
      const doc: Doc = {
        item: [
          {
            request: {
              url: "https://api.example.com",
              body: { mode: "raw", raw: '{"a":1}' },
            },
          },
        ],
      };
      const result = parsePostmanCollection(doc, WORKSPACE_ID);
      expect(result.requests[0].bodyType).toBe("json");
      expect(result.requests[0].body).toBe('{"a":1}');
      expect(result.requests[0].bodyDrafts.json).toBe('{"a":1}');
    });

    it("honors options.raw.language to force xml even for non-JSON-looking text", () => {
      const doc: Doc = {
        item: [
          {
            request: {
              url: "https://api.example.com",
              body: { mode: "raw", raw: "<a/>", options: { raw: { language: "xml" } } },
            },
          },
        ],
      };
      const result = parsePostmanCollection(doc, WORKSPACE_ID);
      expect(result.requests[0].bodyType).toBe("xml");
      expect(result.requests[0].bodyDrafts.xml).toBe("<a/>");
    });

    it("honors options.raw.language to force json even for non-JSON-looking text", () => {
      const doc: Doc = {
        item: [
          {
            request: {
              url: "https://api.example.com",
              body: {
                mode: "raw",
                raw: "not actually json",
                options: { raw: { language: "json" } },
              },
            },
          },
        ],
      };
      const result = parsePostmanCollection(doc, WORKSPACE_ID);
      expect(result.requests[0].bodyType).toBe("json");
      expect(result.requests[0].bodyDrafts.json).toBe("not actually json");
    });

    it("falls back to raw for plain text with no json/xml signal", () => {
      const doc: Doc = {
        item: [{ request: { url: "https://api.example.com", body: { mode: "raw", raw: "hi" } } }],
      };
      const result = parsePostmanCollection(doc, WORKSPACE_ID);
      expect(result.requests[0].bodyType).toBe("raw");
      expect(result.requests[0].bodyDrafts.raw).toBe("hi");
    });

    it("maps urlencoded bodies into bodyDrafts.urlEncoded", () => {
      const doc: Doc = {
        item: [
          {
            request: {
              url: "https://api.example.com",
              body: {
                mode: "urlencoded",
                urlencoded: [
                  { key: "a", value: "1" },
                  { key: "b", value: "2", disabled: true },
                ],
              },
            },
          },
        ],
      };
      const result = parsePostmanCollection(doc, WORKSPACE_ID);
      const req = result.requests[0];
      expect(req.bodyType).toBe("x-www-form-urlencoded");
      expect(req.bodyDrafts.urlEncoded).toEqual([
        { id: expect.any(String), key: "a", value: "1", enabled: true },
        { id: expect.any(String), key: "b", value: "2", enabled: false },
      ]);
    });

    it("maps formdata text fields into bodyDrafts.formData", () => {
      const doc: Doc = {
        item: [
          {
            request: {
              url: "https://api.example.com",
              body: { mode: "formdata", formdata: [{ key: "name", value: "Reqlo" }] },
            },
          },
        ],
      };
      const result = parsePostmanCollection(doc, WORKSPACE_ID);
      const req = result.requests[0];
      expect(req.bodyType).toBe("form-data");
      expect(req.bodyDrafts.formData).toEqual([
        {
          id: expect.any(String),
          key: "name",
          enabled: true,
          kind: "text",
          value: "Reqlo",
          files: [],
        },
      ]);
    });

    it("carries a disabled formdata field's disabled state into bodyDrafts.formData", () => {
      const doc: Doc = {
        item: [
          {
            request: {
              url: "https://api.example.com",
              body: {
                mode: "formdata",
                formdata: [{ key: "name", value: "Reqlo", disabled: true }],
              },
            },
          },
        ],
      };
      const result = parsePostmanCollection(doc, WORKSPACE_ID);
      expect(result.requests[0].bodyDrafts.formData).toEqual([
        {
          id: expect.any(String),
          key: "name",
          enabled: false,
          kind: "text",
          value: "Reqlo",
          files: [],
        },
      ]);
    });

    it("maps formdata file fields to empty values and warns they need reattachment", () => {
      const doc: Doc = {
        item: [
          {
            name: "Upload",
            request: {
              url: "https://api.example.com",
              body: {
                mode: "formdata",
                formdata: [
                  { key: "avatar", type: "file" },
                  { key: "other", type: "file" },
                ],
              },
            },
          },
        ],
      };
      const result = parsePostmanCollection(doc, WORKSPACE_ID);
      const req = result.requests[0];
      expect(req.bodyDrafts.formData).toEqual([
        {
          id: expect.any(String),
          key: "avatar",
          enabled: true,
          kind: "file",
          value: "",
          files: [],
        },
        { id: expect.any(String), key: "other", enabled: true, kind: "file", value: "", files: [] },
      ]);
      expect(result.warnings).toEqual([
        `"Upload": 2 form-data file field(s) need to be re-attached — Postman exports don't include the file contents.`,
      ]);
    });

    it("maps graphql bodies into bodyDrafts.graphql", () => {
      const doc: Doc = {
        item: [
          {
            request: {
              url: "https://api.example.com",
              body: { mode: "graphql", graphql: { query: "{ x }", variables: '{"a":1}' } },
            },
          },
        ],
      };
      const result = parsePostmanCollection(doc, WORKSPACE_ID);
      const req = result.requests[0];
      expect(req.bodyType).toBe("graphql");
      expect(req.bodyDrafts.graphql).toEqual({
        query: "{ x }",
        variables: '{"a":1}',
        operationName: "",
      });
    });

    it("defaults graphql variables to an empty object literal when absent", () => {
      const doc: Doc = {
        item: [
          {
            request: {
              url: "https://api.example.com",
              body: { mode: "graphql", graphql: { query: "{ x }" } },
            },
          },
        ],
      };
      const result = parsePostmanCollection(doc, WORKSPACE_ID);
      expect(result.requests[0].bodyDrafts.graphql.variables).toBe("{\n  \n}");
    });

    it("defaults to no body when the request has no body at all", () => {
      const doc: Doc = { item: [{ request: { url: "https://api.example.com" } }] };
      const result = parsePostmanCollection(doc, WORKSPACE_ID);
      expect(result.requests[0].bodyType).toBe("none");
      expect(result.requests[0].body).toBe("");
    });

    it("drops a raw file body and warns it needs to be re-attached", () => {
      const doc: Doc = {
        item: [
          {
            name: "Upload raw file",
            request: { url: "https://api.example.com", body: { mode: "file" } },
          },
        ],
      };
      const result = parsePostmanCollection(doc, WORKSPACE_ID);
      expect(result.requests[0].bodyType).toBe("none");
      expect(result.warnings).toEqual([
        `"Upload raw file": this request has a raw file body — Postman exports don't include the file contents, so it was dropped.`,
      ]);
    });
  });

  describe("auth types", () => {
    it("maps basic auth", () => {
      const doc: Doc = {
        item: [
          {
            request: {
              url: "https://api.example.com",
              auth: {
                type: "basic",
                basic: [
                  { key: "username", value: "alice" },
                  { key: "password", value: "secret" },
                ],
              },
            },
          },
        ],
      };
      const result = parsePostmanCollection(doc, WORKSPACE_ID);
      expect(result.requests[0].auth).toEqual({
        type: "basic",
        username: "alice",
        password: "secret",
      });
    });

    it("maps bearer auth", () => {
      const doc: Doc = {
        item: [
          {
            request: {
              url: "https://api.example.com",
              auth: { type: "bearer", bearer: [{ key: "token", value: "abc123" }] },
            },
          },
        ],
      };
      const result = parsePostmanCollection(doc, WORKSPACE_ID);
      expect(result.requests[0].auth).toEqual({ type: "bearer", token: "abc123" });
    });

    it("maps apikey auth in header by default", () => {
      const doc: Doc = {
        item: [
          {
            request: {
              url: "https://api.example.com",
              auth: {
                type: "apikey",
                apikey: [
                  { key: "key", value: "X-Api-Key" },
                  { key: "value", value: "secret" },
                ],
              },
            },
          },
        ],
      };
      const result = parsePostmanCollection(doc, WORKSPACE_ID);
      expect(result.requests[0].auth).toEqual({
        type: "api-key",
        key: "X-Api-Key",
        value: "secret",
        addTo: "header",
      });
    });

    it("maps apikey auth targeting the query string when 'in' is 'query'", () => {
      const doc: Doc = {
        item: [
          {
            request: {
              url: "https://api.example.com",
              auth: {
                type: "apikey",
                apikey: [
                  { key: "key", value: "api_key" },
                  { key: "value", value: "secret" },
                  { key: "in", value: "query" },
                ],
              },
            },
          },
        ],
      };
      const result = parsePostmanCollection(doc, WORKSPACE_ID);
      expect(result.requests[0].auth).toEqual({
        type: "api-key",
        key: "api_key",
        value: "secret",
        addTo: "query",
      });
    });

    it("defaults to no auth when auth is absent or type is noauth", () => {
      const noAuthDoc: Doc = { item: [{ request: { url: "https://api.example.com" } }] };
      expect(parsePostmanCollection(noAuthDoc, WORKSPACE_ID).requests[0].auth).toEqual({
        type: "none",
      });

      const explicitNoAuthDoc: Doc = {
        item: [{ request: { url: "https://api.example.com", auth: { type: "noauth" } } }],
      };
      expect(parsePostmanCollection(explicitNoAuthDoc, WORKSPACE_ID).requests[0].auth).toEqual({
        type: "none",
      });
    });

    it("warns and resets to none for an unsupported auth type", () => {
      const doc: Doc = {
        item: [
          {
            name: "OAuth req",
            request: { url: "https://api.example.com", auth: { type: "oauth2" } },
          },
        ],
      };
      const result = parsePostmanCollection(doc, WORKSPACE_ID);
      expect(result.requests[0].auth).toEqual({ type: "none" });
      expect(result.warnings).toEqual([
        `"OAuth req": auth type "oauth2" isn't supported yet — reset to no auth.`,
      ]);
    });
  });
});
