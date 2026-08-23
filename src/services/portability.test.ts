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
} from "@/services/db";
import {
  exportCollection,
  exportWorkspace,
  sanitizeRequestForExport,
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
    collection: { id: "c1", workspaceId: "ws1", name: "C", position: 0, createdAt: Date.now() },
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
    workspace: { id: "w1", name: "W", createdAt: Date.now(), updatedAt: Date.now() },
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

describe("exportCollection / exportWorkspace round-trips", () => {
  it("exports a collection's requests and folders sorted by position", async () => {
    const workspaceId = uid();
    const collection: Collection = {
      id: uid(),
      workspaceId,
      name: "My Collection",
      position: 0,
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
  });

  it("exports a full workspace with sorted requests, environments, and history", async () => {
    const workspace: Workspace = {
      id: uid(),
      name: "My Workspace",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.workspaces.add(workspace);

    const collection: Collection = {
      id: uid(),
      workspaceId: workspace.id,
      name: "C",
      position: 0,
      createdAt: Date.now(),
    };
    await db.collections.add(collection);

    const environment: Environment = {
      id: uid(),
      workspaceId: workspace.id,
      name: "Local",
      variables: [],
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

    // validateWorkspaceExport should accept its own output.
    expect(validateWorkspaceExport(result)).toBe(true);
  });
});
