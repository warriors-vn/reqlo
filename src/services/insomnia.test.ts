import { describe, expect, it } from "vitest";
import { looksLikeInsomniaExport, parseInsomniaExport } from "@/services/insomnia";

const WORKSPACE_ID = "ws-1";
type Doc = Parameters<typeof parseInsomniaExport>[0];

function workspace(id = "wrk_1", name = "My Workspace") {
  return { _id: id, _type: "workspace", name };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    _id: `req_${Math.random()}`,
    _type: "request",
    parentId: "wrk_1",
    name: "Untitled request",
    method: "GET",
    url: "",
    ...overrides,
  };
}

describe("looksLikeInsomniaExport", () => {
  it("accepts an export document with a resources array", () => {
    expect(looksLikeInsomniaExport({ _type: "export", resources: [] })).toBe(true);
  });

  it("rejects a document missing _type: export, or missing resources", () => {
    expect(looksLikeInsomniaExport({ resources: [] })).toBe(false);
    expect(looksLikeInsomniaExport({ _type: "export" })).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(looksLikeInsomniaExport(null)).toBe(false);
    expect(looksLikeInsomniaExport("nope")).toBe(false);
  });
});

describe("parseInsomniaExport", () => {
  it("maps a simple request and defaults the method to GET", () => {
    const doc: Doc = {
      _type: "export",
      resources: [
        workspace(),
        {
          _id: "req_1",
          _type: "request",
          parentId: "wrk_1",
          name: "List users",
          url: "https://api.example.com/users",
        },
      ],
    };
    const result = parseInsomniaExport(doc, WORKSPACE_ID);
    expect(result.collectionName).toBe("My Workspace");
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0].method).toBe("GET");
    expect(result.requests[0].name).toBe("List users");
    expect(result.requests[0].url).toBe("https://api.example.com/users");
  });

  it("falls back to placeholder names for the collection and an unnamed request", () => {
    const doc: Doc = {
      _type: "export",
      resources: [
        { _id: "wrk_1", _type: "workspace" },
        { _id: "req_1", _type: "request", parentId: "wrk_1", url: "https://api.example.com" },
      ],
    };
    const result = parseInsomniaExport(doc, WORKSPACE_ID);
    expect(result.collectionName).toBe("Imported from Insomnia");
    expect(result.requests[0].name).toBe("Untitled request");
  });

  it("uppercases the method", () => {
    const doc: Doc = { _type: "export", resources: [workspace(), request({ method: "post" })] };
    expect(parseInsomniaExport(doc, WORKSPACE_ID).requests[0].method).toBe("POST");
  });

  it("imports a request whose parentId points to a workspace that wasn't included (an 'export just this request' file)", () => {
    const doc: Doc = { _type: "export", resources: [request({ name: "Solo request" })] };
    const result = parseInsomniaExport(doc, WORKSPACE_ID);
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0].name).toBe("Solo request");
    expect(result.requests[0].folderId).toBeNull();
  });

  it("imports a whole folder export whose parent workspace wasn't included", () => {
    const doc: Doc = {
      _type: "export",
      resources: [
        { _id: "fld_1", _type: "request_group", parentId: "wrk_gone", name: "Todos" },
        request({ parentId: "fld_1", name: "Get todo" }),
      ],
    };
    const result = parseInsomniaExport(doc, WORKSPACE_ID);
    expect(result.folders).toHaveLength(1);
    expect(result.folders[0]).toMatchObject({ name: "Todos", parentFolderId: null });
    expect(result.requests[0].folderId).toBe(result.folders[0].id);
  });

  it("returns nothing for a genuinely empty resources array", () => {
    const doc: Doc = { _type: "export", resources: [] };
    const result = parseInsomniaExport(doc, WORKSPACE_ID);
    expect(result.requests).toHaveLength(0);
    expect(result.folders).toHaveLength(0);
  });

  it("imports every workspace from an 'All Workspaces' export, not just the first", () => {
    const doc: Doc = {
      _type: "export",
      resources: [
        workspace("wrk_1", "First"),
        workspace("wrk_2", "Second"),
        request({ parentId: "wrk_1", name: "Req in first" }),
        request({ parentId: "wrk_2", name: "Req in second" }),
      ],
    };
    const result = parseInsomniaExport(doc, WORKSPACE_ID);
    expect(result.requests.map((r) => r.name)).toEqual(
      expect.arrayContaining(["Req in first", "Req in second"]),
    );
    expect(result.folders.map((f) => f.name)).toEqual(expect.arrayContaining(["First", "Second"]));
    const firstFolder = result.folders.find((f) => f.name === "First")!;
    const reqInFirst = result.requests.find((r) => r.name === "Req in first")!;
    expect(reqInFirst.folderId).toBe(firstFolder.id);
    expect(result.warnings).toEqual([expect.stringContaining("2 workspaces")]);
  });

  describe("headers and params", () => {
    it("maps enabled/disabled headers and query params from name/value/disabled", () => {
      const doc: Doc = {
        _type: "export",
        resources: [
          workspace(),
          request({
            headers: [
              { name: "Accept", value: "application/json" },
              { name: "X-Off", value: "1", disabled: true },
            ],
            parameters: [
              { name: "q", value: "hello" },
              { name: "off", value: "2", disabled: true },
            ],
          }),
        ],
      };
      const [req] = parseInsomniaExport(doc, WORKSPACE_ID).requests;
      expect(req.headers).toEqual([
        expect.objectContaining({ key: "Accept", value: "application/json", enabled: true }),
        expect.objectContaining({ key: "X-Off", value: "1", enabled: false }),
      ]);
      expect(req.queryParams).toEqual([
        expect.objectContaining({ key: "q", value: "hello", enabled: true }),
        expect.objectContaining({ key: "off", value: "2", enabled: false }),
      ]);
    });

    it("skips a header/param with an empty name", () => {
      const doc: Doc = {
        _type: "export",
        resources: [workspace(), request({ headers: [{ name: "", value: "x" }] })],
      };
      expect(parseInsomniaExport(doc, WORKSPACE_ID).requests[0].headers).toHaveLength(0);
    });
  });

  describe("folders", () => {
    it("builds nested folders from request_group parentId chains, in metaSortKey order", () => {
      const doc: Doc = {
        _type: "export",
        resources: [
          workspace(),
          { _id: "fld_b", _type: "request_group", parentId: "wrk_1", name: "B", metaSortKey: 2 },
          { _id: "fld_a", _type: "request_group", parentId: "wrk_1", name: "A", metaSortKey: 1 },
          { _id: "fld_a1", _type: "request_group", parentId: "fld_a", name: "A1", metaSortKey: 1 },
          request({ parentId: "fld_a1", name: "Nested req" }),
        ],
      };
      const result = parseInsomniaExport(doc, WORKSPACE_ID);
      expect(result.folders.map((f) => f.name)).toEqual(["A", "A1", "B"]);

      const a = result.folders.find((f) => f.name === "A")!;
      const a1 = result.folders.find((f) => f.name === "A1")!;
      const b = result.folders.find((f) => f.name === "B")!;
      expect(a.parentFolderId).toBeNull();
      expect(a1.parentFolderId).toBe(a.id);
      expect(b.parentFolderId).toBeNull();
      expect(result.requests[0].folderId).toBe(a1.id);
    });

    it("falls back to 'Untitled folder' for a nameless request_group", () => {
      const doc: Doc = {
        _type: "export",
        resources: [workspace(), { _id: "fld_1", _type: "request_group", parentId: "wrk_1" }],
      };
      expect(parseInsomniaExport(doc, WORKSPACE_ID).folders[0].name).toBe("Untitled folder");
    });
  });

  describe("body", () => {
    it("maps a JSON body", () => {
      const doc: Doc = {
        _type: "export",
        resources: [
          workspace(),
          request({ body: { mimeType: "application/json", text: '{"a":1}' } }),
        ],
      };
      const req = parseInsomniaExport(doc, WORKSPACE_ID).requests[0];
      expect(req.bodyType).toBe("json");
      expect(req.bodyDrafts.json).toBe('{"a":1}');
    });

    it("maps an XML body", () => {
      const doc: Doc = {
        _type: "export",
        resources: [workspace(), request({ body: { mimeType: "application/xml", text: "<a/>" } })],
      };
      expect(parseInsomniaExport(doc, WORKSPACE_ID).requests[0].bodyType).toBe("xml");
    });

    it("falls back to raw for a plain-text body that isn't JSON-shaped", () => {
      const doc: Doc = {
        _type: "export",
        resources: [workspace(), request({ body: { mimeType: "text/plain", text: "hello" } })],
      };
      const req = parseInsomniaExport(doc, WORKSPACE_ID).requests[0];
      expect(req.bodyType).toBe("raw");
      expect(req.bodyDrafts.raw).toBe("hello");
    });

    it("maps a urlencoded body, respecting disabled rows", () => {
      const doc: Doc = {
        _type: "export",
        resources: [
          workspace(),
          request({
            body: {
              mimeType: "application/x-www-form-urlencoded",
              params: [
                { name: "a", value: "1" },
                { name: "b", value: "2", disabled: true },
              ],
            },
          }),
        ],
      };
      const req = parseInsomniaExport(doc, WORKSPACE_ID).requests[0];
      expect(req.bodyType).toBe("x-www-form-urlencoded");
      expect(req.bodyDrafts.urlEncoded).toEqual([
        expect.objectContaining({ key: "a", value: "1", enabled: true }),
        expect.objectContaining({ key: "b", value: "2", enabled: false }),
      ]);
    });

    it("maps a form-data body and warns about file fields (contents aren't exported)", () => {
      const doc: Doc = {
        _type: "export",
        resources: [
          workspace(),
          request({
            name: "Upload",
            body: {
              mimeType: "multipart/form-data",
              params: [
                { name: "note", value: "hi", type: "text" },
                { name: "avatar", type: "file", fileName: "/tmp/a.png" },
              ],
            },
          }),
        ],
      };
      const result = parseInsomniaExport(doc, WORKSPACE_ID);
      const req = result.requests[0];
      expect(req.bodyType).toBe("form-data");
      expect(req.bodyDrafts.formData).toEqual([
        expect.objectContaining({ key: "note", value: "hi", kind: "text", enabled: true }),
        expect.objectContaining({ key: "avatar", value: "", kind: "file", enabled: true }),
      ]);
      expect(result.warnings).toEqual([
        expect.stringContaining('"Upload": 1 form-data file field'),
      ]);
    });

    it("maps a GraphQL body with object variables", () => {
      const doc: Doc = {
        _type: "export",
        resources: [
          workspace(),
          request({
            body: {
              mimeType: "application/graphql",
              text: JSON.stringify({ query: "{ me }", variables: { id: 1 } }),
            },
          }),
        ],
      };
      const req = parseInsomniaExport(doc, WORKSPACE_ID).requests[0];
      expect(req.bodyType).toBe("graphql");
      expect(req.bodyDrafts.graphql.query).toBe("{ me }");
      expect(JSON.parse(req.bodyDrafts.graphql.variables)).toEqual({ id: 1 });
    });

    it("warns and empties a GraphQL body that fails to parse", () => {
      const doc: Doc = {
        _type: "export",
        resources: [
          workspace(),
          request({ name: "Bad GQL", body: { mimeType: "application/graphql", text: "not json" } }),
        ],
      };
      const result = parseInsomniaExport(doc, WORKSPACE_ID);
      expect(result.requests[0].bodyDrafts.graphql.query).toBe("");
      expect(result.warnings).toEqual([expect.stringContaining('"Bad GQL"')]);
    });

    it("warns and drops a raw file body (contents aren't exported)", () => {
      const doc: Doc = {
        _type: "export",
        resources: [
          workspace(),
          request({
            name: "Binary upload",
            body: { mimeType: "application/octet-stream", fileName: "/tmp/data.bin" },
          }),
        ],
      };
      const result = parseInsomniaExport(doc, WORKSPACE_ID);
      expect(result.requests[0].bodyType).toBe("none");
      expect(result.warnings).toEqual([expect.stringContaining('"Binary upload"')]);
    });

    it("treats a request with no body field as bodyType none", () => {
      const doc: Doc = { _type: "export", resources: [workspace(), request()] };
      expect(parseInsomniaExport(doc, WORKSPACE_ID).requests[0].bodyType).toBe("none");
    });
  });

  describe("auth", () => {
    it("maps basic auth", () => {
      const doc: Doc = {
        _type: "export",
        resources: [
          workspace(),
          request({ authentication: { type: "basic", username: "u", password: "p" } }),
        ],
      };
      expect(parseInsomniaExport(doc, WORKSPACE_ID).requests[0].auth).toEqual({
        type: "basic",
        username: "u",
        password: "p",
      });
    });

    it("maps bearer auth", () => {
      const doc: Doc = {
        _type: "export",
        resources: [workspace(), request({ authentication: { type: "bearer", token: "abc" } })],
      };
      expect(parseInsomniaExport(doc, WORKSPACE_ID).requests[0].auth).toEqual({
        type: "bearer",
        token: "abc",
      });
    });

    it("resets to no-auth and warns on an unsupported auth type", () => {
      const doc: Doc = {
        _type: "export",
        resources: [
          workspace(),
          request({ name: "OAuth req", authentication: { type: "oauth2" } }),
        ],
      };
      const result = parseInsomniaExport(doc, WORKSPACE_ID);
      expect(result.requests[0].auth.type).toBe("none");
      expect(result.warnings).toEqual([expect.stringContaining('"OAuth req": auth type "oauth2"')]);
    });

    it("treats a disabled auth block as no-auth without a warning", () => {
      const doc: Doc = {
        _type: "export",
        resources: [
          workspace(),
          request({
            authentication: { type: "basic", username: "u", password: "p", disabled: true },
          }),
        ],
      };
      const result = parseInsomniaExport(doc, WORKSPACE_ID);
      expect(result.requests[0].auth.type).toBe("none");
      expect(result.warnings).toHaveLength(0);
    });

    it("defaults to no-auth when there is no authentication field", () => {
      const doc: Doc = { _type: "export", resources: [workspace(), request()] };
      expect(parseInsomniaExport(doc, WORKSPACE_ID).requests[0].auth.type).toBe("none");
    });
  });
});
