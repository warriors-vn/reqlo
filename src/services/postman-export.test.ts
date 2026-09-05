import { describe, expect, it } from "vitest";
import { buildPostmanCollection } from "@/services/postman-export";
import {
  looksLikePostmanCollection,
  parsePostmanCollection,
  type PostmanCollection,
} from "@/services/postman";
import {
  createDefaultRequestDefaults,
  normalizeApiRequest,
  uid,
  type ApiRequest,
  type Collection,
  type Folder,
} from "@/services/db";

const COLLECTION_ID = "col-1";

function makeCollection(overrides: Partial<Collection> = {}): Collection {
  return {
    id: COLLECTION_ID,
    workspaceId: "ws-1",
    name: "My Collection",
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
    name: "Req",
    method: "GET",
    url: "https://api.example.com/users",
    position: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  });
}

function makeFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: uid(),
    workspaceId: "ws-1",
    collectionId: COLLECTION_ID,
    parentFolderId: null,
    name: "Folder",
    position: 0,
    defaults: createDefaultRequestDefaults(),
    createdAt: 0,
    ...overrides,
  };
}

/** The comparable core of a request — everything the two formats both carry.
 * Ids, timestamps and positions are regenerated on every import, so comparing
 * them would only ever prove that uid() returns different values. */
function comparable(request: ApiRequest) {
  return {
    name: request.name,
    method: request.method,
    url: request.url,
    bodyType: request.bodyType,
    auth: request.auth,
    headers: request.headers.map((h) => [h.key, h.value, h.enabled]),
    queryParams: request.queryParams.map((p) => [p.key, p.value, p.enabled]),
    json: request.bodyDrafts.json,
    xml: request.bodyDrafts.xml,
    raw: request.bodyDrafts.raw,
    urlEncoded: request.bodyDrafts.urlEncoded.map((r) => [r.key, r.value, r.enabled]),
    formData: request.bodyDrafts.formData.map((r) => [r.key, r.value, r.kind, r.enabled]),
    graphql: request.bodyDrafts.graphql,
  };
}

describe("buildPostmanCollection — the output is a collection Postman and reqlo both accept", () => {
  it("produces a document its own importer recognizes", () => {
    const { collection } = buildPostmanCollection(makeCollection(), [], [makeRequest()]);
    expect(looksLikePostmanCollection(collection)).toBe(true);
  });

  it("survives JSON serialization, which is how it actually leaves the app", () => {
    const { collection } = buildPostmanCollection(makeCollection(), [], [makeRequest()]);
    const reparsed: unknown = JSON.parse(JSON.stringify(collection));
    expect(looksLikePostmanCollection(reparsed)).toBe(true);
  });

  // An item with no `item` array is a *request* to the importer, so an empty
  // folder that omitted it would come back as a nameless request.
  it("keeps an empty folder a folder", () => {
    const folder = makeFolder({ name: "Empty" });
    const { collection } = buildPostmanCollection(makeCollection(), [folder], []);

    const roundTripped = parsePostmanCollection(collection, "ws-2");
    expect(roundTripped.folders.map((f) => f.name)).toEqual(["Empty"]);
    expect(roundTripped.requests).toEqual([]);
  });

  it("preserves nested folder structure and each request's place in it", () => {
    const outer = makeFolder({ id: "f-outer", name: "Outer", position: 0 });
    const inner = makeFolder({ id: "f-inner", name: "Inner", parentFolderId: "f-outer" });
    const requests = [
      makeRequest({ name: "At root", position: 1 }),
      makeRequest({ name: "In inner", folderId: "f-inner" }),
    ];

    const { collection } = buildPostmanCollection(makeCollection(), [outer, inner], requests);
    const back = parsePostmanCollection(collection, "ws-2");

    const folderNameById = new Map(back.folders.map((f) => [f.id, f.name]));
    const placed = back.requests.map((r) => [
      r.name,
      r.folderId ? folderNameById.get(r.folderId) : null,
    ]);
    expect(placed).toEqual([
      ["In inner", "Inner"],
      ["At root", null],
    ]);
    const innerFolder = back.folders.find((f) => f.name === "Inner");
    const outerFolder = back.folders.find((f) => f.name === "Outer");
    expect(innerFolder?.parentFolderId).toBe(outerFolder?.id);
  });
});

describe("buildPostmanCollection — round trip", () => {
  // The strongest available check: whatever the importer can read, the
  // exporter has to be able to write back in a form the importer reads the
  // same way. Anything that fails here is a real asymmetry between the two.
  it.each([
    ["a plain GET", makeRequest({ name: "List users" })],
    [
      "headers, including a disabled one",
      makeRequest({
        name: "With headers",
        headers: [
          { id: "h1", key: "X-On", value: "1", enabled: true },
          { id: "h2", key: "X-Off", value: "2", enabled: false },
        ],
      }),
    ],
    [
      "query params",
      makeRequest({
        name: "With query",
        queryParams: [
          { id: "q1", key: "page", value: "2", enabled: true },
          { id: "q2", key: "off", value: "x", enabled: false },
        ],
      }),
    ],
    [
      "a JSON body",
      makeRequest({
        name: "JSON",
        method: "POST",
        bodyType: "json",
        bodyDrafts: {
          ...normalizeApiRequest({
            id: "x",
            workspaceId: "w",
            name: "n",
            method: "GET",
            url: "u",
            createdAt: 0,
            updatedAt: 0,
          }).bodyDrafts,
          json: `{"a":1}`,
        },
      }),
    ],
    [
      "basic auth",
      makeRequest({ name: "Basic", auth: { type: "basic", username: "u", password: "p" } }),
    ],
    ["bearer auth", makeRequest({ name: "Bearer", auth: { type: "bearer", token: "t-1" } })],
    [
      "an api key in the query string",
      makeRequest({
        name: "ApiKey",
        auth: { type: "api-key", key: "k", value: "v", addTo: "query" },
      }),
    ],
    ["explicit no auth", makeRequest({ name: "NoAuth", auth: { type: "none" } })],
  ])("%s survives export → import unchanged", (_label, request) => {
    const { collection } = buildPostmanCollection(makeCollection(), [], [request]);
    const back = parsePostmanCollection(collection, "ws-2");

    expect(back.requests).toHaveLength(1);
    expect(comparable(back.requests[0])).toEqual(comparable(request));
  });

  it("round-trips a whole fixture through import → export → import", () => {
    const original: PostmanCollection = {
      info: {
        name: "Fixture",
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
      },
      item: [
        {
          name: "Users",
          item: [
            {
              name: "List",
              request: {
                method: "GET",
                url: {
                  raw: "https://api.example.com/users?page=2",
                  query: [{ key: "page", value: "2" }],
                },
                header: [{ key: "Accept", value: "application/json" }],
              },
            },
            {
              name: "Create",
              request: {
                method: "POST",
                url: "https://api.example.com/users",
                body: { mode: "raw", raw: `{"name":"x"}`, options: { raw: { language: "json" } } },
                auth: { type: "bearer", bearer: [{ key: "token", value: "abc" }] },
              },
            },
          ],
        },
      ],
    };

    const first = parsePostmanCollection(original, "ws-1");
    const collection = makeCollection({ name: first.collectionName });
    const { collection: exported } = buildPostmanCollection(
      collection,
      first.folders.map((f) => ({ ...f, collectionId: COLLECTION_ID })),
      first.requests.map((r) => ({ ...r, collectionId: COLLECTION_ID })),
    );
    const second = parsePostmanCollection(exported, "ws-2");

    expect(second.collectionName).toBe(first.collectionName);
    expect(second.folders.map((f) => f.name)).toEqual(first.folders.map((f) => f.name));
    expect(second.requests.map(comparable)).toEqual(first.requests.map(comparable));
  });
});

describe("buildPostmanCollection — what it says it cannot carry", () => {
  it("writes inherited headers onto the request and says so", () => {
    const collection = makeCollection({
      defaults: {
        ...createDefaultRequestDefaults(),
        headers: [{ id: "ch", key: "X-Team", value: "platform", enabled: true }],
      },
    });
    const request = makeRequest({ name: "Inheriting" });

    const { collection: exported, warnings } = buildPostmanCollection(collection, [], [request]);
    const back = parsePostmanCollection(exported, "ws-2");

    expect(back.requests[0].headers.map((h) => [h.key, h.value])).toEqual([["X-Team", "platform"]]);
    expect(warnings.join(" ")).toContain("inherited header");
  });

  // Postman has collection- and folder-level auth of its own, so this is the
  // one part of inheritance that survives the trip intact in both directions.
  it("round-trips collection- and folder-level auth as real inheritance", () => {
    const collection = makeCollection({
      defaults: {
        ...createDefaultRequestDefaults(),
        auth: { type: "bearer", token: "collection-token" },
      },
    });
    const folder = makeFolder({
      id: "f-1",
      name: "Admin",
      defaults: {
        ...createDefaultRequestDefaults(),
        auth: { type: "basic", username: "u", password: "p" },
      },
    });
    const request = makeRequest({ name: "Inherits", folderId: "f-1", auth: { type: "inherit" } });

    const { collection: exported } = buildPostmanCollection(collection, [folder], [request]);
    expect(exported.auth).toEqual({
      type: "bearer",
      bearer: [{ key: "token", value: "collection-token" }],
    });

    const back = parsePostmanCollection(exported, "ws-2");
    expect(back.collectionDefaults.auth).toEqual({
      type: "bearer",
      token: "collection-token",
    });
    expect(back.folders[0].defaults.auth).toEqual({
      type: "basic",
      username: "u",
      password: "p",
    });
    // The request itself declared no auth, so it keeps inheriting rather than
    // carrying a stamped copy of the token.
    expect(back.requests[0].auth.type).toBe("none");
  });

  it("omits an OAuth2 config rather than exporting a machine-bound token", () => {
    const request = makeRequest({
      name: "OAuth",
      auth: {
        type: "oauth2",
        oauth2: {
          grantType: "client_credentials",
          tokenUrl: "https://auth.example.com/token",
          clientId: "id",
          cachedToken: {
            accessToken: "secret-token",
            tokenType: "Bearer",
            expiresAt: null,
            environmentId: null,
            fetchedAt: 0,
          },
        },
      },
    });

    const { collection, warnings } = buildPostmanCollection(makeCollection(), [], [request]);

    expect(JSON.stringify(collection)).not.toContain("secret-token");
    expect(warnings.join(" ")).toContain("OAuth 2.0");
  });

  it("warns that a script wasn't carried over instead of exporting one that can't run", () => {
    const request = makeRequest({
      name: "Scripted",
      postResponseScript: { enabled: true, source: `test("x", () => {});` },
    });

    const { collection, warnings } = buildPostmanCollection(makeCollection(), [], [request]);

    expect(JSON.stringify(collection)).not.toContain("test(");
    expect(warnings.join(" ")).toContain("script wasn't exported");
  });
});
