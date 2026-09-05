import { describe, expect, it } from "vitest";
import { buildOpenApiDocument } from "@/services/openapi-export";
import { looksLikeOpenApiDocument, parseOpenApiDocument } from "@/services/openapi";
import {
  createDefaultBodyDrafts,
  createDefaultRequestDefaults,
  normalizeApiRequest,
  uid,
  type ApiRequest,
  type Collection,
} from "@/services/db";

const COLLECTION_ID = "col-1";

function makeCollection(overrides: Partial<Collection> = {}): Collection {
  return {
    id: COLLECTION_ID,
    workspaceId: "ws-1",
    name: "Billing API",
    position: 0,
    defaults: createDefaultRequestDefaults(),
    createdAt: 0,
    ...overrides,
  };
}

function makeRequest(overrides: Partial<ApiRequest> = {}): ApiRequest {
  return normalizeApiRequest({
    id: uid(),
    workspaceId: "ws-1",
    collectionId: COLLECTION_ID,
    name: "List invoices",
    method: "GET",
    url: "https://api.example.com/invoices",
    position: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  });
}

const doc = (...requests: ApiRequest[]) =>
  buildOpenApiDocument(makeCollection(), [], requests).document;

describe("buildOpenApiDocument", () => {
  it("produces a document reqlo's own OpenAPI importer accepts", () => {
    const document = doc(makeRequest());
    expect(looksLikeOpenApiDocument(document)).toBe(true);
    expect(looksLikeOpenApiDocument(JSON.parse(JSON.stringify(document)))).toBe(true);
  });

  it("round-trips path, method and server back through the importer", () => {
    const back = parseOpenApiDocument(
      doc(makeRequest({ method: "POST", url: "https://api.example.com/invoices" })) as never,
      "ws-2",
    );

    expect(back.requests).toHaveLength(1);
    expect(back.requests[0].method).toBe("POST");
    expect(back.requests[0].url).toContain("/invoices");
  });

  it("puts the origin in servers and only the path in paths", () => {
    const document = doc(makeRequest({ url: "https://api.example.com/v1/invoices?page=2" }));
    expect(document.servers).toEqual([{ url: "https://api.example.com" }]);
    expect(Object.keys(document.paths as object)).toEqual(["/v1/invoices"]);
  });

  // {{VAR}} is reqlo's templating; {var} is OpenAPI's. Inside a path they mean
  // the same thing, so the export translates rather than leaving braces that
  // no OpenAPI tool understands.
  it("turns a templated path segment into a declared path parameter", () => {
    const document = doc(makeRequest({ url: "https://api.example.com/invoices/{{invoiceId}}" }));
    const paths = document.paths as Record<string, Record<string, { parameters?: unknown[] }>>;

    expect(Object.keys(paths)).toEqual(["/invoices/{invoiceId}"]);
    expect(paths["/invoices/{invoiceId}"].get.parameters).toContainEqual({
      name: "invoiceId",
      in: "path",
      required: true,
      schema: { type: "string" },
    });
  });

  // A {{VAR}} at the very start stands in for the whole base URL, not a path
  // segment — treating it as a path would produce "/{{BASE_URL}}/invoices".
  it("treats a leading {{BASE_URL}} as the server, not part of the path", () => {
    const document = doc(makeRequest({ url: "{{BASE_URL}}/invoices" }));
    expect(document.servers).toEqual([{ url: "{{BASE_URL}}" }]);
    expect(Object.keys(document.paths as object)).toEqual(["/invoices"]);
  });

  it("declares query params and headers as parameters with their values as examples", () => {
    const document = doc(
      makeRequest({
        queryParams: [{ id: "q", key: "page", value: "2", enabled: true }],
        headers: [{ id: "h", key: "X-Tenant", value: "acme", enabled: true }],
      }),
    );
    const operation = (document.paths as Record<string, Record<string, { parameters: unknown[] }>>)[
      "/invoices"
    ].get;

    expect(operation.parameters).toContainEqual({
      name: "page",
      in: "query",
      required: false,
      schema: { type: "string" },
      example: "2",
    });
    expect(operation.parameters).toContainEqual({
      name: "X-Tenant",
      in: "header",
      required: false,
      schema: { type: "string" },
      example: "acme",
    });
  });

  // Declaring Content-Type as a header parameter is invalid per the spec —
  // requestBody's content map already says what the media type is.
  it("does not declare Content-Type as a header parameter", () => {
    const document = doc(
      makeRequest({
        method: "POST",
        bodyType: "json",
        bodyDrafts: { ...createDefaultBodyDrafts(), json: `{"a":1}` },
        headers: [{ id: "h", key: "Content-Type", value: "application/json", enabled: true }],
      }),
    );
    const operation = (
      document.paths as Record<string, Record<string, { parameters?: unknown[] }>>
    )["/invoices"].post;

    const names = (operation.parameters ?? []).map((p) => (p as { name: string }).name);
    expect(names).not.toContain("Content-Type");
  });

  it("carries a JSON body through as a parsed example, not a string", () => {
    const document = doc(
      makeRequest({
        method: "POST",
        bodyType: "json",
        bodyDrafts: { ...createDefaultBodyDrafts(), json: `{"amount":10}` },
      }),
    );
    const operation = (
      document.paths as Record<
        string,
        Record<string, { requestBody: { content: Record<string, { example: unknown }> } }>
      >
    )["/invoices"].post;

    expect(operation.requestBody.content["application/json"].example).toEqual({ amount: 10 });
  });

  it("keeps a malformed JSON body as text rather than dropping the example", () => {
    const document = doc(
      makeRequest({
        method: "POST",
        bodyType: "json",
        bodyDrafts: { ...createDefaultBodyDrafts(), json: `{not json` },
      }),
    );
    const operation = (
      document.paths as Record<
        string,
        Record<string, { requestBody: { content: Record<string, { example: unknown }> } }>
      >
    )["/invoices"].post;

    expect(operation.requestBody.content["application/json"].example).toBe(`{not json`);
  });

  it("groups two methods on the same path into one path item", () => {
    const document = doc(
      makeRequest({ name: "List", method: "GET" }),
      makeRequest({ name: "Create", method: "POST" }),
    );
    const paths = document.paths as Record<string, Record<string, unknown>>;

    expect(Object.keys(paths)).toEqual(["/invoices"]);
    expect(Object.keys(paths["/invoices"]).sort()).toEqual(["get", "post"]);
  });

  // OpenAPI allows exactly one operation per method+path, so a second request
  // on the same pair can't be represented — saying so beats silently dropping.
  it("warns when two requests collide on the same method and path", () => {
    const { document, warnings } = buildOpenApiDocument(
      makeCollection(),
      [],
      [makeRequest({ name: "First" }), makeRequest({ name: "Second" })],
    );
    const paths = document.paths as Record<string, Record<string, { summary: string }>>;

    expect(paths["/invoices"].get.summary).toBe("First");
    expect(warnings.join(" ")).toContain("Second");
    expect(warnings.join(" ")).toContain("only the first was exported");
  });

  it("always says up front that response schemas aren't in a collection", () => {
    const { warnings } = buildOpenApiDocument(makeCollection(), [], [makeRequest()]);
    expect(warnings[0]).toContain("not response schemas");
  });

  it("names requests with no usable URL instead of dropping them silently", () => {
    const { warnings } = buildOpenApiDocument(
      makeCollection(),
      [],
      [makeRequest({ name: "Broken", url: "  " })],
    );
    expect(warnings.join(" ")).toContain("Broken");
  });

  it("still emits a valid document for an empty collection", () => {
    const { document } = buildOpenApiDocument(makeCollection(), [], []);
    expect(looksLikeOpenApiDocument(document)).toBe(true);
    expect(document.paths).toEqual({});
  });
});
