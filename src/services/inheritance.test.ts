import { describe, expect, it } from "vitest";
import {
  applyInheritedDefaults,
  collectInheritedVariables,
  inheritedContributions,
  resolveAncestors,
  resolveInheritedAuth,
  NO_ANCESTORS,
  type RequestAncestors,
} from "@/services/inheritance";
import {
  createDefaultRequestDefaults,
  normalizeApiRequest,
  uid,
  type ApiRequest,
  type Collection,
  type Folder,
  type KV,
  type RequestAuth,
  type RequestDefaults,
} from "@/services/db";

function kv(key: string, value: string, enabled = true): KV {
  return { id: uid(), key, value, enabled };
}

function defaults(overrides: Partial<RequestDefaults> = {}): RequestDefaults {
  return { ...createDefaultRequestDefaults(), ...overrides };
}

function makeCollection(overrides: Partial<Collection> = {}): Collection {
  return {
    id: "col-1",
    workspaceId: "ws-1",
    name: "Collection",
    position: 0,
    defaults: createDefaultRequestDefaults(),
    createdAt: 0,
    ...overrides,
  };
}

function makeFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: uid(),
    workspaceId: "ws-1",
    collectionId: "col-1",
    parentFolderId: null,
    name: "Folder",
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
    name: "Req",
    method: "GET",
    url: "https://api.example.com",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  });
}

describe("resolveAncestors", () => {
  it("returns the folder path root-first, then the collection", () => {
    const outer = makeFolder({ id: "f-outer", name: "Outer" });
    const inner = makeFolder({ id: "f-inner", name: "Inner", parentFolderId: "f-outer" });
    const collection = makeCollection();

    const ancestors = resolveAncestors(
      { collectionId: "col-1", folderId: "f-inner" },
      [collection],
      [inner, outer],
    );

    expect(ancestors.collection?.id).toBe("col-1");
    expect(ancestors.folders.map((f) => f.id)).toEqual(["f-outer", "f-inner"]);
  });

  it("stops instead of looping forever on a cyclic parent chain", () => {
    const a = makeFolder({ id: "a", parentFolderId: "b" });
    const b = makeFolder({ id: "b", parentFolderId: "a" });

    const ancestors = resolveAncestors({ collectionId: null, folderId: "a" }, [], [a, b]);

    expect(ancestors.folders.map((f) => f.id)).toEqual(["b", "a"]);
  });

  it("ignores a folderId pointing at a folder that no longer exists", () => {
    const ancestors = resolveAncestors({ collectionId: null, folderId: "gone" }, [], []);
    expect(ancestors.folders).toEqual([]);
  });
});

describe("resolveInheritedAuth", () => {
  const bearer: RequestAuth = { type: "bearer", token: "collection-token" };
  const basic: RequestAuth = { type: "basic", username: "u", password: "p" };

  it("takes the nearest ancestor that configures auth, walking leaf to root", () => {
    const ancestors: RequestAncestors = {
      collection: makeCollection({ name: "API", defaults: defaults({ auth: bearer }) }),
      folders: [makeFolder({ name: "Admin", defaults: defaults({ auth: basic }) })],
    };

    const resolved = resolveInheritedAuth({ type: "inherit" }, ancestors);

    expect(resolved.auth).toEqual(basic);
    expect(resolved.inheritedFrom).toBe("Admin");
  });

  it("falls through a folder that configures nothing to the collection", () => {
    const ancestors: RequestAncestors = {
      collection: makeCollection({ name: "API", defaults: defaults({ auth: bearer }) }),
      folders: [makeFolder({ name: "Admin" })],
    };

    const resolved = resolveInheritedAuth({ type: "inherit" }, ancestors);

    expect(resolved.auth).toEqual(bearer);
    expect(resolved.inheritedFrom).toBe("API");
  });

  // The distinction the migration depends on: every pre-existing request was
  // left on "none", so adding collection auth must not change what they send.
  it("does not inherit into a request that explicitly says none", () => {
    const ancestors: RequestAncestors = {
      collection: makeCollection({ defaults: defaults({ auth: bearer }) }),
      folders: [],
    };

    const resolved = resolveInheritedAuth({ type: "none" }, ancestors);

    expect(resolved.auth).toEqual({ type: "none" });
    expect(resolved.inheritedFrom).toBeNull();
  });

  it("lets the request's own auth win over any ancestor", () => {
    const own: RequestAuth = { type: "bearer", token: "request-token" };
    const ancestors: RequestAncestors = {
      collection: makeCollection({ defaults: defaults({ auth: basic }) }),
      folders: [],
    };

    expect(resolveInheritedAuth(own, ancestors).auth).toEqual(own);
  });

  it("resolves to none when nothing up the chain configures auth", () => {
    expect(resolveInheritedAuth({ type: "inherit" }, NO_ANCESTORS)).toEqual({
      auth: { type: "none" },
      inheritedFrom: null,
    });
  });
});

describe("applyInheritedDefaults — headers", () => {
  it("merges collection, folder and request headers with the most specific winning", () => {
    const request = makeRequest({ headers: [kv("X-Own", "request")] });
    const ancestors: RequestAncestors = {
      collection: makeCollection({
        defaults: defaults({ headers: [kv("X-Col", "collection"), kv("X-Both", "collection")] }),
      }),
      folders: [makeFolder({ defaults: defaults({ headers: [kv("X-Both", "folder")] }) })],
    };

    const merged = applyInheritedDefaults(request, ancestors).headers;

    expect(merged.map((h) => [h.key, h.value])).toEqual([
      ["X-Col", "collection"],
      ["X-Both", "folder"],
      ["X-Own", "request"],
    ]);
  });

  it("overrides an inherited header case-insensitively, as HTTP treats them", () => {
    const request = makeRequest({ headers: [kv("authorization", "Bearer request")] });
    const ancestors: RequestAncestors = {
      collection: makeCollection({
        defaults: defaults({ headers: [kv("Authorization", "Bearer collection")] }),
      }),
      folders: [],
    };

    const merged = applyInheritedDefaults(request, ancestors).headers;

    expect(merged).toHaveLength(1);
    expect(merged[0].value).toBe("Bearer request");
  });

  // Unchecking a row has to mean "off", not "hand control back to the
  // collection" — the latter looks identical in the UI and does the opposite.
  it("lets a disabled request header switch off the inherited one", () => {
    const request = makeRequest({ headers: [kv("X-Trace", "", false)] });
    const ancestors: RequestAncestors = {
      collection: makeCollection({ defaults: defaults({ headers: [kv("X-Trace", "on")] }) }),
      folders: [],
    };

    expect(applyInheritedDefaults(request, ancestors).headers).toEqual([]);
  });

  it("keeps query params case-sensitive, unlike headers", () => {
    const request = makeRequest({ queryParams: [kv("Page", "2")] });
    const ancestors: RequestAncestors = {
      collection: makeCollection({ defaults: defaults({ queryParams: [kv("page", "1")] }) }),
      folders: [],
    };

    const merged = applyInheritedDefaults(request, ancestors).queryParams;

    expect(merged.map((p) => [p.key, p.value])).toEqual([
      ["page", "1"],
      ["Page", "2"],
    ]);
  });

  it("leaves a request with no ancestors completely untouched", () => {
    const request = makeRequest({ headers: [kv("X-Own", "v")], auth: { type: "none" } });
    expect(applyInheritedDefaults(request, NO_ANCESTORS)).toBe(request);
  });
});

describe("variables", () => {
  it("orders collection before folders, outermost folder first", () => {
    const ancestors: RequestAncestors = {
      collection: makeCollection({ defaults: defaults({ variables: [kv("A", "collection")] }) }),
      folders: [
        makeFolder({ id: "outer", defaults: defaults({ variables: [kv("B", "outer")] }) }),
        makeFolder({ id: "inner", defaults: defaults({ variables: [kv("C", "inner")] }) }),
      ],
    };

    expect(collectInheritedVariables(ancestors).map((v) => v.value)).toEqual([
      "collection",
      "outer",
      "inner",
    ]);
  });
});

describe("inheritedContributions", () => {
  it("reports what a request will pick up, excluding its own rows", () => {
    const ancestors: RequestAncestors = {
      collection: makeCollection({
        defaults: defaults({ headers: [kv("X-Col", "c")], queryParams: [kv("q", "1")] }),
      }),
      folders: [makeFolder({ defaults: defaults({ headers: [kv("X-Folder", "f")] }) })],
    };

    const contributions = inheritedContributions(ancestors);

    expect(contributions.headers.map((h) => h.key)).toEqual(["X-Col", "X-Folder"]);
    expect(contributions.queryParams.map((p) => p.key)).toEqual(["q"]);
  });

  it("is empty for a request with no ancestors", () => {
    expect(inheritedContributions(NO_ANCESTORS)).toEqual({ headers: [], queryParams: [] });
  });
});
