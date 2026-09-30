import { describe, expect, it } from "vitest";
import {
  base64ToBlob,
  blobToBase64,
  createRequestSnapshot,
  db,
  normalizeApiRequest,
  uid,
  type ApiRequest,
  type Collection,
  type Environment,
  type Folder,
  type HistoryEntry,
  type Workspace,
  createDefaultRequestDefaults,
} from "@/services/db";
import {
  countCredentialsLeftOut,
  exportCollection,
  exportWorkspace,
  redactHistoryCredentials,
  redactRequestCredentials,
  sanitizeAuthForExport,
  sanitizeRequestDefaultsForExport,
  sanitizeEnvironmentForExport,
  sanitizeRequestForExport,
  sanitizeWorkspaceForExport,
  validateCollectionExport,
  validateWorkspaceExport,
  type CollectionExport,
  type WorkspaceExport,
} from "@/services/portability";

function makeRequest(overrides: Partial<ApiRequest> = {}): ApiRequest {
  const now = Date.now();
  return normalizeApiRequest({
    id: uid(),
    workspaceId: "ws-x",
    name: "Untitled",
    method: "GET",
    url: "https://api.example.com",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe("validateCollectionExport", () => {
  const valid: CollectionExport = {
    schema: "reqlo.collection",
    version: 1,
    exportedAt: Date.now(),
    collection: {
      id: "c1",
      workspaceId: "ws1",
      name: "C",
      position: 0,
      defaults: createDefaultRequestDefaults(),
      createdAt: Date.now(),
    },
    requests: [],
  };

  it("accepts a well-formed export", () => {
    expect(validateCollectionExport(valid)).toBe(true);
  });

  it("rejects the wrong schema", () => {
    expect(validateCollectionExport({ ...valid, schema: "reqlo.workspace" })).toBe(false);
  });

  it("rejects a version newer than the current schema", () => {
    expect(validateCollectionExport({ ...valid, version: 999 })).toBe(false);
  });

  it("rejects a missing requests array or collection", () => {
    const { requests: _requests, ...withoutRequests } = valid;
    expect(validateCollectionExport(withoutRequests)).toBe(false);
    const { collection: _collection, ...withoutCollection } = valid;
    expect(validateCollectionExport(withoutCollection)).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(validateCollectionExport(null)).toBe(false);
    expect(validateCollectionExport("nope")).toBe(false);
  });
});

describe("validateWorkspaceExport", () => {
  const valid: WorkspaceExport = {
    schema: "reqlo.workspace",
    version: 1,
    exportedAt: Date.now(),
    workspace: { id: "w1", name: "W", globals: [], createdAt: Date.now(), updatedAt: Date.now() },
    collections: [],
    requests: [],
    environments: [],
    history: [],
  };

  it("accepts a well-formed export", () => {
    expect(validateWorkspaceExport(valid)).toBe(true);
  });

  it("rejects the wrong schema", () => {
    expect(validateWorkspaceExport({ ...valid, schema: "reqlo.collection" })).toBe(false);
  });

  it("rejects a version newer than the current schema", () => {
    expect(validateWorkspaceExport({ ...valid, version: 999 })).toBe(false);
  });

  it("rejects a missing required array", () => {
    const { environments: _environments, ...withoutEnvironments } = valid;
    expect(validateWorkspaceExport(withoutEnvironments)).toBe(false);
  });
});

describe("sanitizeRequestForExport", () => {
  it("round-trips a form-data file's bytes through blobToBase64/base64ToBlob", async () => {
    const bytes = new Uint8Array([1, 2, 3, 250, 251, 252]);
    const blob = new Blob([bytes], { type: "application/octet-stream" });
    const request = makeRequest({
      bodyType: "form-data",
      bodyDrafts: {
        json: "",
        raw: "",
        xml: "",
        formData: [
          {
            id: "f1",
            key: "file",
            enabled: true,
            kind: "file",
            value: "",
            files: [
              {
                id: "file1",
                name: "test.bin",
                size: bytes.length,
                type: "application/octet-stream",
                lastModified: Date.now(),
                blob,
              },
            ],
          },
        ],
        urlEncoded: [],
        binary: { file: null },
        graphql: { query: "", variables: "", operationName: "" },
      },
    });

    const sanitized = await sanitizeRequestForExport(request);
    const exportedFile = sanitized.bodyDrafts.formData[0].files[0];
    expect(exportedFile.blobData).toBeDefined();

    const roundTripped = base64ToBlob(exportedFile.blobData!, exportedFile.type);
    const roundTrippedBytes = new Uint8Array(await roundTripped.arrayBuffer());
    expect(Array.from(roundTrippedBytes)).toEqual(Array.from(bytes));

    // Sanity check against the underlying helper directly too.
    expect(await blobToBase64(blob)).toBe(exportedFile.blobData);
  });

  it("passes through binary body files the same way", async () => {
    const blob = new Blob([new Uint8Array([9, 9, 9])], { type: "image/png" });
    const request = makeRequest({
      bodyType: "binary",
      bodyDrafts: {
        json: "",
        raw: "",
        xml: "",
        formData: [],
        urlEncoded: [],
        binary: {
          file: {
            id: "bin1",
            name: "pic.png",
            size: 3,
            type: "image/png",
            lastModified: Date.now(),
            blob,
          },
        },
        graphql: { query: "", variables: "", operationName: "" },
      },
    });

    const sanitized = await sanitizeRequestForExport(request);
    expect(sanitized.bodyDrafts.binary.file?.blobData).toBeDefined();
    expect(sanitized.bodyDrafts.binary.file?.blob).toBeUndefined();
  });
});

describe("sanitizeEnvironmentForExport", () => {
  const environment: Environment = {
    id: "env-1",
    workspaceId: "ws-1",
    name: "Local",
    variables: [
      { id: "v1", key: "API_KEY", value: "shh", enabled: true, secret: true },
      { id: "v2", key: "BASE_URL", value: "https://api.example.com", enabled: true },
      { id: "v3", key: "DISABLED_SECRET", value: "also-shh", enabled: false, secret: true },
    ],
    createdAt: Date.now(),
  };

  it("blanks the value of every secret variable, leaves the rest untouched", () => {
    const sanitized = sanitizeEnvironmentForExport(environment);
    expect(sanitized.variables).toEqual([
      { id: "v1", key: "API_KEY", value: "", enabled: true, secret: true },
      { id: "v2", key: "BASE_URL", value: "https://api.example.com", enabled: true },
      { id: "v3", key: "DISABLED_SECRET", value: "", enabled: false, secret: true },
    ]);
  });

  it("does not mutate the original environment", () => {
    sanitizeEnvironmentForExport(environment);
    expect(environment.variables[0].value).toBe("shh");
  });
});

describe("exportCollection / exportWorkspace round-trips", () => {
  it("exports a collection's requests and folders sorted by position", async () => {
    const workspaceId = uid();
    const collection: Collection = {
      id: uid(),
      workspaceId,
      name: "My Collection",
      position: 0,
      defaults: {
        ...createDefaultRequestDefaults(),
        variables: [
          {
            id: "cv1",
            key: "COLLECTION_TOKEN",
            value: "collection-secret",
            enabled: true,
            secret: true,
          },
          { id: "cv2", key: "BASE_URL", value: "https://api.example.com", enabled: true },
        ],
      },
      createdAt: Date.now(),
    };
    await db.collections.add(collection);

    const folder: Folder = {
      id: uid(),
      workspaceId,
      collectionId: collection.id,
      parentFolderId: null,
      name: "Folder A",
      position: 0,
      defaults: {
        ...createDefaultRequestDefaults(),
        variables: [
          { id: "fv1", key: "FOLDER_TOKEN", value: "folder-secret", enabled: true, secret: true },
        ],
      },
      createdAt: Date.now(),
    };
    await db.folders.add(folder);

    const second = makeRequest({
      workspaceId,
      collectionId: collection.id,
      name: "Second",
      position: 1,
    });
    const first = makeRequest({
      workspaceId,
      collectionId: collection.id,
      name: "First",
      position: 0,
    });
    await db.requests.bulkAdd([second, first]);

    const result = await exportCollection(collection);

    expect(result.schema).toBe("reqlo.collection");
    expect(result.collection.id).toBe(collection.id);
    expect(result.folders?.map((f) => f.id)).toEqual([folder.id]);
    expect(result.requests.map((r) => r.name)).toEqual(["First", "Second"]);

    // Secret variables in collection/folder defaults are blanked, same as
    // environment and workspace-global secrets.
    expect(
      result.collection.defaults.variables.find((v) => v.key === "COLLECTION_TOKEN")?.value,
    ).toBe("");
    expect(result.collection.defaults.variables.find((v) => v.key === "BASE_URL")?.value).toBe(
      "https://api.example.com",
    );
    expect(
      result.folders?.[0].defaults.variables.find((v) => v.key === "FOLDER_TOKEN")?.value,
    ).toBe("");
    // The live store/DB value itself is never mutated by exporting.
    const liveCollection = await db.collections.get(collection.id);
    expect(
      liveCollection?.defaults.variables.find((v) => v.key === "COLLECTION_TOKEN")?.value,
    ).toBe("collection-secret");
    const liveFolder = await db.folders.get(folder.id);
    expect(liveFolder?.defaults.variables.find((v) => v.key === "FOLDER_TOKEN")?.value).toBe(
      "folder-secret",
    );
  });

  it("exports a full workspace with sorted requests, environments, and history", async () => {
    const workspace: Workspace = {
      id: uid(),
      name: "My Workspace",
      globals: [
        {
          id: "g1",
          key: "GLOBAL_TOKEN",
          value: "super-secret-global",
          enabled: true,
          secret: true,
        },
        { id: "g2", key: "API_VERSION", value: "v2", enabled: true },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.workspaces.add(workspace);

    const collection: Collection = {
      id: uid(),
      workspaceId: workspace.id,
      name: "C",
      position: 0,
      defaults: {
        ...createDefaultRequestDefaults(),
        variables: [
          {
            id: "cv1",
            key: "COLLECTION_TOKEN",
            value: "collection-secret",
            enabled: true,
            secret: true,
          },
        ],
      },
      createdAt: Date.now(),
    };
    await db.collections.add(collection);

    const environment: Environment = {
      id: uid(),
      workspaceId: workspace.id,
      name: "Local",
      variables: [
        { id: "v1", key: "API_KEY", value: "super-secret-value", enabled: true, secret: true },
        { id: "v2", key: "BASE_URL", value: "https://api.example.com", enabled: true },
      ],
      createdAt: Date.now(),
    };
    await db.environments.add(environment);

    const req = makeRequest({
      workspaceId: workspace.id,
      collectionId: collection.id,
      name: "Only request",
      position: 0,
    });
    await db.requests.add(req);

    const historyEntry: HistoryEntry = {
      id: uid(),
      workspaceId: workspace.id,
      requestId: req.id,
      requestName: req.name,
      method: req.method,
      url: req.url,
      status: 200,
      ok: true,
      durationMs: 12,
      sizeBytes: 34,
      executedAt: Date.now(),
      environmentId: environment.id,
      environmentName: environment.name,
      favorite: false,
      pinned: false,
      searchText: "",
      snapshot: createRequestSnapshot(req),
      responseKind: "json",
      responseContentType: "application/json",
      responseHeaders: {},
      responseBody: "{}",
      responseBodyTruncated: false,
    };
    await db.history.add(historyEntry);

    const result = await exportWorkspace(workspace);

    expect(result.schema).toBe("reqlo.workspace");
    expect(result.workspace.id).toBe(workspace.id);
    expect(result.collections.map((c) => c.id)).toEqual([collection.id]);
    expect(result.environments.map((e) => e.id)).toEqual([environment.id]);
    expect(result.requests.map((r) => r.id)).toEqual([req.id]);
    expect(result.history).toHaveLength(1);
    expect(result.history[0].id).toBe(historyEntry.id);
    expect(result.history[0].snapshot.requestId).toBe(req.id);

    // Secret variables are blanked in the export; non-secret ones are untouched.
    const exportedVars = result.environments[0].variables;
    expect(exportedVars.find((v) => v.key === "API_KEY")?.value).toBe("");
    expect(exportedVars.find((v) => v.key === "BASE_URL")?.value).toBe("https://api.example.com");
    // The live store/DB value itself is never mutated by exporting.
    const liveEnv = await db.environments.get(environment.id);
    expect(liveEnv?.variables.find((v) => v.key === "API_KEY")?.value).toBe("super-secret-value");

    // Secret workspace globals are blanked the same way secret environment
    // variables are; non-secret globals pass through untouched.
    expect(result.workspace.globals.find((v) => v.key === "GLOBAL_TOKEN")?.value).toBe("");
    expect(result.workspace.globals.find((v) => v.key === "API_VERSION")?.value).toBe("v2");
    const liveWorkspace = await db.workspaces.get(workspace.id);
    expect(liveWorkspace?.globals.find((v) => v.key === "GLOBAL_TOKEN")?.value).toBe(
      "super-secret-global",
    );

    // Secret variables in a collection's defaults are blanked the same way.
    expect(
      result.collections[0].defaults.variables.find((v) => v.key === "COLLECTION_TOKEN")?.value,
    ).toBe("");
    const liveCollection = await db.collections.get(collection.id);
    expect(
      liveCollection?.defaults.variables.find((v) => v.key === "COLLECTION_TOKEN")?.value,
    ).toBe("collection-secret");

    // validateWorkspaceExport should accept its own output.
    expect(validateWorkspaceExport(result)).toBe(true);
  });
});

describe("sanitizeWorkspaceForExport", () => {
  it("blanks the value of every secret global, leaves the rest untouched", () => {
    const workspace: Workspace = {
      id: "ws-1",
      name: "W",
      globals: [
        { id: "g1", key: "TOKEN", value: "shh", enabled: true, secret: true },
        { id: "g2", key: "VERSION", value: "v2", enabled: true },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const sanitized = sanitizeWorkspaceForExport(workspace);

    expect(sanitized.globals).toEqual([
      { id: "g1", key: "TOKEN", value: "", enabled: true, secret: true },
      { id: "g2", key: "VERSION", value: "v2", enabled: true },
    ]);
    // Original untouched.
    expect(workspace.globals[0].value).toBe("shh");
  });
});

describe("credentials in exports", () => {
  const cachedToken = {
    accessToken: "live-access-token",
    tokenType: "Bearer",
    expiresAt: null,
    refreshToken: "live-refresh-token",
    environmentId: null,
    fetchedAt: 1,
  };

  it("blanks a literal bearer token, basic password and API key value", () => {
    expect(sanitizeAuthForExport({ type: "bearer", token: "sk-live-123" }).token).toBe("");
    expect(sanitizeAuthForExport({ type: "basic", username: "tuan", password: "hunter2" })).toEqual(
      { type: "basic", username: "tuan", password: "" },
    );
    expect(
      sanitizeAuthForExport({ type: "api-key", key: "X-Api-Key", value: "abc", addTo: "header" }),
    ).toEqual({ type: "api-key", key: "X-Api-Key", value: "", addTo: "header" });
  });

  it("keeps a credential written as a variable reference", () => {
    expect(sanitizeAuthForExport({ type: "bearer", token: "{{TOKEN}}" }).token).toBe("{{TOKEN}}");
    expect(
      sanitizeAuthForExport({ type: "basic", username: "tuan", password: "{{PASSWORD}}" }).password,
    ).toBe("{{PASSWORD}}");
  });

  it("drops the cached OAuth token and blanks a literal client secret, keeping the config", () => {
    const sanitized = sanitizeAuthForExport({
      type: "oauth2",
      oauth2: {
        grantType: "client_credentials",
        tokenUrl: "https://auth.example.com/token",
        clientId: "my-client",
        clientSecret: "shh",
        scope: "read",
        cachedToken,
      },
    });
    expect(sanitized.oauth2).toEqual({
      grantType: "client_credentials",
      tokenUrl: "https://auth.example.com/token",
      clientId: "my-client",
      clientSecret: "",
      scope: "read",
    });
    expect(JSON.stringify(sanitized)).not.toContain("live-");
  });

  it("doesn't mutate the auth it was given", () => {
    const auth = { type: "bearer" as const, token: "sk-live-123" };
    sanitizeAuthForExport(auth);
    expect(auth.token).toBe("sk-live-123");
  });

  it("blanks literal credential headers on a request, whatever their case", async () => {
    const request = makeRequest({
      auth: { type: "bearer", token: "sk-live-123" },
      headers: [
        { id: "h1", key: "Authorization", value: "Bearer abc", enabled: true },
        { id: "h2", key: "COOKIE", value: "session=xyz", enabled: true },
        { id: "h3", key: "x-api-key", value: "{{API_KEY}}", enabled: true },
        { id: "h4", key: "Accept", value: "application/json", enabled: true },
      ],
    });

    for (const sanitized of [
      redactRequestCredentials(request),
      await sanitizeRequestForExport(request),
    ]) {
      expect(sanitized.auth.token).toBe("");
      expect(sanitized.headers.map((h) => [h.key, h.value])).toEqual([
        ["Authorization", ""],
        ["COOKIE", ""],
        ["x-api-key", "{{API_KEY}}"],
        ["Accept", "application/json"],
      ]);
    }
  });

  it("blanks auth and credential headers in collection/folder defaults", () => {
    const sanitized = sanitizeRequestDefaultsForExport({
      ...createDefaultRequestDefaults(),
      auth: { type: "bearer", token: "team-token" },
      headers: [{ id: "h1", key: "X-Auth-Token", value: "abc", enabled: true }],
    });
    expect(sanitized.auth.token).toBe("");
    expect(sanitized.headers[0].value).toBe("");
  });

  it("blanks a history entry's snapshot credentials and the response's Set-Cookie", () => {
    const request = makeRequest({
      auth: { type: "bearer", token: "sk-live-123" },
      headers: [{ id: "h1", key: "Cookie", value: "session=xyz", enabled: true }],
    });
    const entry = {
      snapshot: createRequestSnapshot(request),
      responseHeaders: { "Set-Cookie": "sid=secret; HttpOnly", "content-type": "text/plain" },
    } as Partial<HistoryEntry> as HistoryEntry;

    const redacted = redactHistoryCredentials(entry);

    expect(redacted.snapshot.auth.token).toBe("");
    expect(redacted.snapshot.headers[0].value).toBe("");
    expect(redacted.responseHeaders).toEqual({ "Set-Cookie": "", "content-type": "text/plain" });
  });

  it("counts exactly what gets blanked", () => {
    expect(
      countCredentialsLeftOut([
        makeRequest({
          auth: { type: "bearer", token: "sk-live-123" },
          headers: [
            { id: "h1", key: "Cookie", value: "session=xyz", enabled: true },
            { id: "h2", key: "Accept", value: "*/*", enabled: true },
          ],
        }),
        makeRequest({ auth: { type: "bearer", token: "{{TOKEN}}" } }),
        {
          ...createDefaultRequestDefaults(),
          auth: {
            type: "oauth2",
            oauth2: {
              grantType: "client_credentials",
              tokenUrl: "https://auth.example.com/token",
              clientId: "my-client",
              clientSecret: "shh",
              cachedToken,
            },
          },
        },
      ]),
    ).toBe(4);
    expect(countCredentialsLeftOut([makeRequest()])).toBe(0);
  });

  it("keeps literal credentials out of a full workspace export", async () => {
    const now = Date.now();
    const workspace: Workspace = {
      id: uid(),
      name: "Creds",
      globals: [],
      createdAt: now,
      updatedAt: now,
    };
    await db.workspaces.add(workspace);
    const collection: Collection = {
      id: uid(),
      workspaceId: workspace.id,
      name: "C",
      position: 0,
      defaults: {
        ...createDefaultRequestDefaults(),
        auth: { type: "bearer", token: "collection-live-token" },
      },
      createdAt: Date.now(),
    };
    await db.collections.add(collection);
    const request = makeRequest({
      workspaceId: workspace.id,
      collectionId: collection.id,
      auth: { type: "basic", username: "tuan", password: "request-live-password" },
    });
    await db.requests.add(request);
    await db.history.add({
      id: uid(),
      workspaceId: workspace.id,
      requestId: request.id,
      requestName: request.name,
      method: "GET",
      url: request.url,
      status: 200,
      ok: true,
      durationMs: 1,
      sizeBytes: 0,
      executedAt: Date.now(),
      environmentId: null,
      environmentName: null,
      favorite: false,
      pinned: false,
      searchText: "",
      snapshot: createRequestSnapshot(request),
      responseKind: "text",
      responseContentType: "text/plain",
      responseHeaders: { "set-cookie": "sid=history-live-cookie" },
      responseBody: "",
      responseBodyTruncated: false,
    } as HistoryEntry);

    const exported = JSON.stringify(await exportWorkspace(workspace));

    expect(exported).not.toContain("collection-live-token");
    expect(exported).not.toContain("request-live-password");
    expect(exported).not.toContain("history-live-cookie");
    expect(exported).toContain('"username":"tuan"');
  });
});
