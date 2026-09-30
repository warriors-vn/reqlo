import { describe, expect, it } from "vitest";
import { load as loadYaml } from "js-yaml";
import {
  describeRejectedSpec,
  looksLikeOpenApiDocument,
  parseOpenApiDocument,
  parseSpecText,
} from "@/services/openapi";

const WORKSPACE_ID = "ws-1";
type Doc = Parameters<typeof parseOpenApiDocument>[0];

const varsOf = (result: ReturnType<typeof parseOpenApiDocument>) =>
  Object.fromEntries(result.collectionDefaults.variables.map((v) => [v.key, v.value]));

describe("looksLikeOpenApiDocument", () => {
  it("accepts a 3.x document with a paths object", () => {
    expect(looksLikeOpenApiDocument({ openapi: "3.0.3", paths: {} })).toBe(true);
    expect(looksLikeOpenApiDocument({ openapi: "3.1.0", paths: {} })).toBe(true);
  });

  it("rejects non-3.x documents", () => {
    expect(looksLikeOpenApiDocument({ swagger: "2.0", paths: {} })).toBe(false);
    expect(looksLikeOpenApiDocument({ openapi: "2.0", paths: {} })).toBe(false);
  });

  it("rejects documents missing paths, or non-objects", () => {
    expect(looksLikeOpenApiDocument({ openapi: "3.0.0" })).toBe(false);
    expect(looksLikeOpenApiDocument(null)).toBe(false);
    expect(looksLikeOpenApiDocument("nope")).toBe(false);
  });
});

describe("parseOpenApiDocument", () => {
  it("maps a simple GET operation into a request", () => {
    const doc: Doc = {
      openapi: "3.0.3",
      info: { title: "Pet Store" },
      servers: [{ url: "https://api.example.com" }],
      paths: {
        "/pets": {
          get: { summary: "List pets", operationId: "listPets" },
        },
      },
    };
    const result = parseOpenApiDocument(doc, WORKSPACE_ID);
    expect(result.collectionName).toBe("Pet Store");
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0].method).toBe("GET");
    expect(result.requests[0].url).toBe("{{baseUrl}}/pets");
    expect(varsOf(result)).toEqual({ baseUrl: "https://api.example.com" });
    expect(result.requests[0].name).toBe("List pets");
  });

  it("falls back to operationId, then METHOD path, for the request name", () => {
    const doc: Doc = {
      openapi: "3.0.3",
      paths: {
        "/pets": { get: { operationId: "listPets" } },
        "/pets/{id}": { delete: {} },
      },
    };
    const result = parseOpenApiDocument(doc, WORKSPACE_ID);
    const names = result.requests.map((r) => r.name);
    expect(names).toContain("listPets");
    expect(names).toContain("DELETE /pets/{id}");
  });

  it("converts {param} path params to {{param}} env-var syntax", () => {
    const doc: Doc = {
      openapi: "3.0.3",
      servers: [{ url: "https://api.example.com/{version}" }],
      paths: {
        "/pets/{petId}": { get: {} },
      },
    };
    const result = parseOpenApiDocument(doc, WORKSPACE_ID);
    expect(result.requests[0].url).toBe("{{baseUrl}}/pets/{{petId}}");
    // No default for {version}, so it stays a reference the user can define.
    expect(varsOf(result).baseUrl).toBe("https://api.example.com/{{version}}");
  });

  it("converts query and header parameters into KV rows, required ones enabled", () => {
    const doc: Doc = {
      openapi: "3.0.3",
      paths: {
        "/pets": {
          get: {
            parameters: [
              { name: "limit", in: "query", required: true, schema: { type: "integer" } },
              { name: "tag", in: "query", example: "cat" },
              { name: "X-Request-Id", in: "header", schema: { type: "string" } },
              { name: "petId", in: "path", schema: { type: "string" } },
            ],
          },
        },
      },
    };
    const result = parseOpenApiDocument(doc, WORKSPACE_ID);
    const req = result.requests[0];
    expect(req.queryParams).toEqual([
      { id: expect.any(String), key: "limit", value: "0", enabled: true },
      { id: expect.any(String), key: "tag", value: "cat", enabled: false },
    ]);
    expect(req.headers).toEqual([
      { id: expect.any(String), key: "X-Request-Id", value: "", enabled: false },
    ]);
  });

  it("merges shared path-level parameters with operation-level ones, operation wins", () => {
    const doc: Doc = {
      openapi: "3.0.3",
      paths: {
        "/pets": {
          parameters: [{ name: "limit", in: "query", example: "10" }],
          get: {
            parameters: [{ name: "limit", in: "query", example: "20" }],
          },
        },
      },
    };
    const result = parseOpenApiDocument(doc, WORKSPACE_ID);
    expect(result.requests[0].queryParams).toEqual([
      { id: expect.any(String), key: "limit", value: "20", enabled: false },
    ]);
  });

  it("generates a JSON body from a requestBody schema, honoring $ref and example", () => {
    const doc: Doc = {
      openapi: "3.0.3",
      paths: {
        "/pets": {
          post: {
            requestBody: {
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Pet" },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          Pet: {
            type: "object",
            properties: {
              name: { type: "string" },
              age: { type: "integer" },
              tag: { type: "string", example: "friendly" },
            },
          },
        },
      },
    };
    const result = parseOpenApiDocument(doc, WORKSPACE_ID);
    const req = result.requests[0];
    expect(req.bodyType).toBe("json");
    expect(JSON.parse(req.body)).toEqual({ name: "", age: 0, tag: "friendly" });
  });

  it("flattens allOf by taking the first branch", () => {
    const doc: Doc = {
      openapi: "3.0.3",
      paths: {
        "/pets": {
          post: {
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    allOf: [
                      { type: "object", properties: { name: { type: "string" } } },
                      { type: "object", properties: { age: { type: "integer" } } },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    };
    const result = parseOpenApiDocument(doc, WORKSPACE_ID);
    expect(JSON.parse(result.requests[0].body)).toEqual({ name: "" });
  });

  it("maps x-www-form-urlencoded bodies to urlEncoded KV rows", () => {
    const doc: Doc = {
      openapi: "3.0.3",
      paths: {
        "/login": {
          post: {
            requestBody: {
              content: {
                "application/x-www-form-urlencoded": {
                  schema: {
                    type: "object",
                    properties: { username: { type: "string", example: "demo" } },
                  },
                },
              },
            },
          },
        },
      },
    };
    const result = parseOpenApiDocument(doc, WORKSPACE_ID);
    const req = result.requests[0];
    expect(req.bodyType).toBe("x-www-form-urlencoded");
    expect(req.bodyDrafts.urlEncoded).toEqual([
      { id: expect.any(String), key: "username", value: "demo", enabled: true },
    ]);
  });

  it("maps multipart/form-data bodies, warning about file fields", () => {
    const doc: Doc = {
      openapi: "3.0.3",
      paths: {
        "/upload": {
          post: {
            requestBody: {
              content: {
                "multipart/form-data": {
                  schema: {
                    type: "object",
                    properties: {
                      caption: { type: "string" },
                      file: { type: "string", format: "binary" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    const result = parseOpenApiDocument(doc, WORKSPACE_ID);
    const req = result.requests[0];
    expect(req.bodyType).toBe("form-data");
    expect(req.bodyDrafts.formData.map((row) => [row.key, row.kind])).toEqual([
      ["caption", "text"],
      ["file", "file"],
    ]);
    expect(result.warnings.some((w) => w.includes("file field"))).toBe(true);
  });

  it("warns and leaves the body empty for unsupported content types", () => {
    const doc: Doc = {
      openapi: "3.0.3",
      paths: {
        "/pets": {
          post: { requestBody: { content: { "application/xml": { schema: { type: "string" } } } } },
        },
      },
    };
    const result = parseOpenApiDocument(doc, WORKSPACE_ID);
    expect(result.requests[0].bodyType).toBe("none");
    expect(result.warnings.some((w) => w.includes("application/xml"))).toBe(true);
  });

  describe("security scheme mapping", () => {
    const baseDoc: Doc = {
      openapi: "3.0.3",
      paths: { "/pets": { get: { security: [{ theScheme: [] }] } } },
    };

    it("maps http+bearer", () => {
      const doc: Doc = {
        ...baseDoc,
        components: { securitySchemes: { theScheme: { type: "http", scheme: "bearer" } } },
      };
      expect(parseOpenApiDocument(doc, WORKSPACE_ID).requests[0].auth).toEqual({
        type: "bearer",
        token: "",
      });
    });

    it("maps http+basic", () => {
      const doc: Doc = {
        ...baseDoc,
        components: { securitySchemes: { theScheme: { type: "http", scheme: "basic" } } },
      };
      expect(parseOpenApiDocument(doc, WORKSPACE_ID).requests[0].auth).toEqual({
        type: "basic",
        username: "",
        password: "",
      });
    });

    it("maps apiKey", () => {
      const doc: Doc = {
        ...baseDoc,
        components: {
          securitySchemes: { theScheme: { type: "apiKey", name: "X-API-Key", in: "header" } },
        },
      };
      expect(parseOpenApiDocument(doc, WORKSPACE_ID).requests[0].auth).toEqual({
        type: "api-key",
        key: "X-API-Key",
        value: "",
        addTo: "header",
      });
    });

    it("warns and resets to none for unsupported scheme types", () => {
      const doc: Doc = {
        ...baseDoc,
        components: { securitySchemes: { theScheme: { type: "oauth2" } } },
      };
      const result = parseOpenApiDocument(doc, WORKSPACE_ID);
      expect(result.requests[0].auth).toEqual({ type: "none" });
      expect(result.warnings.some((w) => w.includes("oauth2"))).toBe(true);
    });

    it("defaults to no auth when there's no security requirement", () => {
      const doc: Doc = {
        openapi: "3.0.3",
        paths: { "/pets": { get: {} } },
      };
      expect(parseOpenApiDocument(doc, WORKSPACE_ID).requests[0].auth).toEqual({ type: "none" });
    });
  });

  it("groups operations into one folder per first tag, untagged at the root", () => {
    const doc: Doc = {
      openapi: "3.0.3",
      paths: {
        "/pets": { get: { tags: ["Pets"] } },
        "/pets/{id}": { get: { tags: ["Pets", "Extra"] } },
        "/health": { get: {} },
      },
    };
    const result = parseOpenApiDocument(doc, WORKSPACE_ID);
    expect(result.folders.map((f) => f.name)).toEqual(["Pets"]);
    const petsFolderId = result.folders[0].id;
    const byPath = new Map(result.requests.map((r) => [r.url, r.folderId]));
    expect(byPath.get("{{baseUrl}}/pets")).toBe(petsFolderId);
    expect(byPath.get("{{baseUrl}}/pets/{{id}}")).toBe(petsFolderId);
    expect(byPath.get("{{baseUrl}}/health")).toBeNull();
  });

  it("warns once and leaves external $refs unresolved", () => {
    const doc: Doc = {
      openapi: "3.0.3",
      paths: {
        "/pets": {
          post: {
            requestBody: {
              content: { "application/json": { schema: { $ref: "external.yaml#/Pet" } } },
            },
          },
        },
      },
    };
    const result = parseOpenApiDocument(doc, WORKSPACE_ID);
    expect(result.requests[0].body).toBe("{}");
    expect(result.warnings.filter((w) => w.includes("external"))).toHaveLength(1);
  });

  it("parses an equivalent YAML document the same way", () => {
    const yamlText = `
openapi: 3.0.3
info:
  title: Pet Store
paths:
  /pets:
    get:
      summary: List pets
`;
    const parsed = loadYaml(yamlText);
    expect(looksLikeOpenApiDocument(parsed)).toBe(true);
    const result = parseOpenApiDocument(parsed as Doc, WORKSPACE_ID);
    expect(result.collectionName).toBe("Pet Store");
    expect(result.requests[0].name).toBe("List pets");
  });
});

describe("servers", () => {
  const doc = (servers: Doc["servers"]): Doc => ({
    openapi: "3.0.3",
    servers,
    paths: { "/users": { get: {} } },
  });

  it("fills a templated server from its variable defaults", () => {
    const result = parseOpenApiDocument(
      doc([
        {
          url: "https://{region}.api.example.com/{version}",
          variables: { region: { default: "eu" }, version: { default: "v2" } },
        },
      ]),
      WORKSPACE_ID,
    );
    expect(varsOf(result).baseUrl).toBe("https://eu.api.example.com/v2");
    expect(result.warnings).toEqual([]);
  });

  it("leaves baseUrl empty and says so when the server is relative", () => {
    const result = parseOpenApiDocument(doc([{ url: "/v1" }]), WORKSPACE_ID);
    expect(varsOf(result)).toEqual({});
    expect(result.requests[0].url).toBe("{{baseUrl}}/users");
    expect(result.warnings.join(" ")).toContain('"/v1"');
    expect(result.warnings.join(" ")).toContain("https://host/v1");
  });

  it("does the same when the spec has no servers at all", () => {
    const result = parseOpenApiDocument(doc(undefined), WORKSPACE_ID);
    expect(varsOf(result)).toEqual({});
    expect(result.warnings.join(" ")).toContain("no server");
  });
});

describe("path parameters", () => {
  it("seeds a collection variable from the parameter's example or schema default", () => {
    const result = parseOpenApiDocument(
      {
        openapi: "3.0.3",
        servers: [{ url: "https://api.example.com" }],
        paths: {
          "/users/{id}": {
            parameters: [{ name: "id", in: "path", required: true, example: 42 }],
            get: {},
          },
          "/orgs/{slug}": {
            get: {
              parameters: [
                {
                  name: "slug",
                  in: "path",
                  required: true,
                  schema: { type: "string", default: "acme" },
                },
              ],
            },
          },
        },
      },
      WORKSPACE_ID,
    );
    expect(varsOf(result)).toEqual({
      baseUrl: "https://api.example.com",
      id: "42",
      slug: "acme",
    });
  });

  it("doesn't invent a value for a parameter the spec gives none for", () => {
    const result = parseOpenApiDocument(
      {
        openapi: "3.0.3",
        servers: [{ url: "https://api.example.com" }],
        paths: { "/users/{id}": { get: { parameters: [{ name: "id", in: "path" }] } } },
      },
      WORKSPACE_ID,
    );
    expect(varsOf(result)).toEqual({ baseUrl: "https://api.example.com" });
  });
});

describe("a spec that isn't OpenAPI 3", () => {
  it("explains a Swagger 2.0 file instead of calling it unrecognized", () => {
    expect(describeRejectedSpec({ swagger: "2.0", paths: {} })).toMatch(/Swagger 2\.0/);
    expect(describeRejectedSpec({ swagger: "2.0", paths: {} })).toMatch(/convert/i);
  });

  it("distinguishes an unreadable file from a readable non-spec", () => {
    expect(describeRejectedSpec(undefined)).toMatch(/JSON or YAML/);
    expect(describeRejectedSpec({ hello: "world" })).toMatch(/Not a recognized/);
  });

  it("parseSpecText reads JSON and YAML, and gives undefined for neither", async () => {
    expect(await parseSpecText('{"swagger":"2.0"}')).toEqual({ swagger: "2.0" });
    expect(await parseSpecText("swagger: '2.0'\n")).toEqual({ swagger: "2.0" });
    expect(await parseSpecText("a: [unterminated")).toBeUndefined();
  });
});
