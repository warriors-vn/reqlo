import type {
  ApiRequest,
  Collection,
  Folder,
  HistoryEntry,
  MockConfig,
  ReqloDB,
  RequestDefaults,
  ScriptConfig,
  Workspace,
  WebSocketConfig,
} from "./db";

/**
 * The factories/normalizers a migration needs live in db.ts alongside the
 * types they build. Taking them as parameters here (rather than importing
 * db.ts directly) keeps this file's only dependency on db.ts a type-only
 * one, so there is no runtime import cycle between the two.
 */
export interface MigrationHelpers {
  normalizeApiRequest: (
    request: Partial<ApiRequest> &
      Pick<
        ApiRequest,
        "id" | "workspaceId" | "name" | "method" | "url" | "createdAt" | "updatedAt"
      >,
  ) => ApiRequest;
  normalizeHistoryEntry: (
    entry: Partial<HistoryEntry> &
      Pick<
        HistoryEntry,
        "id" | "workspaceId" | "method" | "url" | "ok" | "durationMs" | "sizeBytes" | "executedAt"
      >,
  ) => HistoryEntry;
  createDefaultMock: () => MockConfig;
  createDefaultPreRequestScript: () => ScriptConfig;
  createDefaultPostResponseScript: () => ScriptConfig;
  createDefaultRequestDefaults: () => RequestDefaults;
  createDefaultWebSocketConfig: () => WebSocketConfig;
}

/** Registers every schema version, in order, on a freshly constructed ReqloDB instance. */
export function registerMigrations(dexie: ReqloDB, helpers: MigrationHelpers): void {
  dexie.version(1).stores({
    workspaces: "id, updatedAt",
    collections: "id, workspaceId, position",
    requests: "id, workspaceId, collectionId, updatedAt",
    history: "id, workspaceId, requestId, executedAt",
  });
  dexie.version(2).stores({
    workspaces: "id, updatedAt",
    collections: "id, workspaceId, position",
    requests: "id, workspaceId, collectionId, updatedAt",
    history: "id, workspaceId, requestId, executedAt",
    environments: "id, workspaceId",
  });
  dexie
    .version(3)
    .stores({
      workspaces: "id, updatedAt",
      collections: "id, workspaceId, position",
      requests: "id, workspaceId, collectionId, updatedAt, method, bodyType, favorite",
      history:
        "id, workspaceId, requestId, executedAt, method, status, favorite, pinned, [workspaceId+executedAt], [workspaceId+method], [workspaceId+status], [workspaceId+pinned], [workspaceId+favorite]",
      environments: "id, workspaceId",
    })
    .upgrade(async (tx) => {
      await tx
        .table<ApiRequest, string>("requests")
        .toCollection()
        .modify((request) => {
          Object.assign(request, helpers.normalizeApiRequest(request));
        });
      await tx
        .table<HistoryEntry, string>("history")
        .toCollection()
        .modify((entry) => {
          Object.assign(entry, helpers.normalizeHistoryEntry(entry));
        });
    });
  dexie
    .version(4)
    .stores({
      workspaces: "id, updatedAt",
      collections: "id, workspaceId, position",
      requests:
        "id, workspaceId, collectionId, position, updatedAt, method, bodyType, favorite, [workspaceId+collectionId+position]",
      history:
        "id, workspaceId, requestId, executedAt, method, status, favorite, pinned, [workspaceId+executedAt], [workspaceId+method], [workspaceId+status], [workspaceId+pinned], [workspaceId+favorite]",
      environments: "id, workspaceId",
    })
    .upgrade(async (tx) => {
      const requests = await tx.table<ApiRequest, string>("requests").toArray();
      const byCollection = new Map<string, ApiRequest[]>();

      requests.forEach((request) => {
        const key = request.collectionId ?? "__unfiled__";
        const items = byCollection.get(key) ?? [];
        items.push(request);
        byCollection.set(key, items);
      });

      await Promise.all(
        [...byCollection.values()].flatMap((items) =>
          items
            .sort((left, right) => left.createdAt - right.createdAt)
            .map((request, index) =>
              tx.table<ApiRequest, string>("requests").update(request.id, { position: index }),
            ),
        ),
      );
    });
  dexie
    .version(5)
    .stores({
      workspaces: "id, updatedAt",
      collections: "id, workspaceId, position",
      folders:
        "id, workspaceId, collectionId, parentFolderId, position, [collectionId+parentFolderId+position]",
      requests:
        "id, workspaceId, collectionId, folderId, position, updatedAt, method, bodyType, favorite, [workspaceId+collectionId+position]",
      history:
        "id, workspaceId, requestId, executedAt, method, status, favorite, pinned, [workspaceId+executedAt], [workspaceId+method], [workspaceId+status], [workspaceId+pinned], [workspaceId+favorite]",
      environments: "id, workspaceId",
    })
    .upgrade(async (tx) => {
      await tx
        .table<ApiRequest, string>("requests")
        .toCollection()
        .modify((request) => {
          if (request.folderId === undefined) request.folderId = null;
        });
    });
  dexie
    .version(6)
    .stores({
      workspaces: "id, updatedAt",
      collections: "id, workspaceId, position",
      folders:
        "id, workspaceId, collectionId, parentFolderId, position, [collectionId+parentFolderId+position]",
      requests:
        "id, workspaceId, collectionId, folderId, position, updatedAt, method, bodyType, favorite, [workspaceId+collectionId+position]",
      history:
        "id, workspaceId, requestId, executedAt, method, status, favorite, pinned, [workspaceId+executedAt], [workspaceId+method], [workspaceId+status], [workspaceId+pinned], [workspaceId+favorite]",
      environments: "id, workspaceId",
    })
    .upgrade(async (tx) => {
      await tx
        .table<ApiRequest, string>("requests")
        .toCollection()
        .modify((request) => {
          if (request.extracts === undefined) request.extracts = [];
        });
    });
  dexie
    .version(7)
    .stores({
      workspaces: "id, updatedAt",
      collections: "id, workspaceId, position",
      folders:
        "id, workspaceId, collectionId, parentFolderId, position, [collectionId+parentFolderId+position]",
      requests:
        "id, workspaceId, collectionId, folderId, position, updatedAt, method, bodyType, favorite, [workspaceId+collectionId+position]",
      history:
        "id, workspaceId, requestId, executedAt, method, status, favorite, pinned, [workspaceId+executedAt], [workspaceId+method], [workspaceId+status], [workspaceId+pinned], [workspaceId+favorite]",
      environments: "id, workspaceId",
    })
    .upgrade(async (tx) => {
      await tx
        .table<ApiRequest, string>("requests")
        .toCollection()
        .modify((request) => {
          if (request.assertions === undefined) request.assertions = [];
        });
    });
  dexie
    .version(8)
    .stores({
      workspaces: "id, updatedAt",
      collections: "id, workspaceId, position",
      folders:
        "id, workspaceId, collectionId, parentFolderId, position, [collectionId+parentFolderId+position]",
      requests:
        "id, workspaceId, collectionId, folderId, position, updatedAt, method, bodyType, favorite, [workspaceId+collectionId+position]",
      history:
        "id, workspaceId, requestId, executedAt, method, status, favorite, pinned, [workspaceId+executedAt], [workspaceId+method], [workspaceId+status], [workspaceId+pinned], [workspaceId+favorite]",
      environments: "id, workspaceId",
    })
    .upgrade(async (tx) => {
      await tx
        .table<ApiRequest, string>("requests")
        .toCollection()
        .modify((request) => {
          if (request.mock === undefined) request.mock = helpers.createDefaultMock();
        });
    });
  dexie
    .version(9)
    .stores({
      workspaces: "id, updatedAt",
      collections: "id, workspaceId, position",
      folders:
        "id, workspaceId, collectionId, parentFolderId, position, [collectionId+parentFolderId+position]",
      requests:
        "id, workspaceId, collectionId, folderId, position, updatedAt, method, bodyType, favorite, [workspaceId+collectionId+position]",
      history:
        "id, workspaceId, requestId, executedAt, method, status, favorite, pinned, [workspaceId+executedAt], [workspaceId+method], [workspaceId+status], [workspaceId+pinned], [workspaceId+favorite]",
      environments: "id, workspaceId",
    })
    .upgrade(async (tx) => {
      await tx
        .table<ApiRequest, string>("requests")
        .toCollection()
        .modify((request) => {
          if (request.preRequestScript === undefined) {
            request.preRequestScript = helpers.createDefaultPreRequestScript();
          }
        });
    });
  dexie
    .version(10)
    .stores({
      workspaces: "id, updatedAt",
      collections: "id, workspaceId, position",
      folders:
        "id, workspaceId, collectionId, parentFolderId, position, [collectionId+parentFolderId+position]",
      requests:
        "id, workspaceId, collectionId, folderId, position, updatedAt, method, bodyType, favorite, [workspaceId+collectionId+position]",
      history:
        "id, workspaceId, requestId, executedAt, method, status, favorite, pinned, [workspaceId+executedAt], [workspaceId+method], [workspaceId+status], [workspaceId+pinned], [workspaceId+favorite]",
      environments: "id, workspaceId",
    })
    .upgrade(async (tx) => {
      await tx
        .table<ApiRequest, string>("requests")
        .toCollection()
        .modify((request) => {
          if (request.timeoutMs === undefined) {
            request.timeoutMs = 0;
          }
        });
    });
  dexie
    .version(11)
    .stores({
      workspaces: "id, updatedAt",
      collections: "id, workspaceId, position",
      folders:
        "id, workspaceId, collectionId, parentFolderId, position, [collectionId+parentFolderId+position]",
      requests:
        "id, workspaceId, collectionId, folderId, position, updatedAt, method, bodyType, favorite, [workspaceId+collectionId+position]",
      history:
        "id, workspaceId, requestId, executedAt, method, status, favorite, pinned, [workspaceId+executedAt], [workspaceId+method], [workspaceId+status], [workspaceId+pinned], [workspaceId+favorite]",
      environments: "id, workspaceId",
    })
    .upgrade(async (tx) => {
      await tx
        .table<Workspace, string>("workspaces")
        .toCollection()
        .modify((workspace) => {
          if (workspace.globals === undefined) {
            workspace.globals = [];
          }
        });
    });
  dexie
    .version(12)
    .stores({
      workspaces: "id, updatedAt",
      collections: "id, workspaceId, position",
      folders:
        "id, workspaceId, collectionId, parentFolderId, position, [collectionId+parentFolderId+position]",
      requests:
        "id, workspaceId, collectionId, folderId, position, updatedAt, method, bodyType, favorite, [workspaceId+collectionId+position]",
      history:
        "id, workspaceId, requestId, executedAt, method, status, favorite, pinned, [workspaceId+executedAt], [workspaceId+method], [workspaceId+status], [workspaceId+pinned], [workspaceId+favorite]",
      environments: "id, workspaceId",
    })
    .upgrade(async (tx) => {
      // Collection/folder-level defaults. Existing requests are deliberately
      // left on whatever auth they already had (including "none") rather
      // than migrated to "inherit" — see RequestAuth's comment: a request
      // that sends no auth today must keep sending none after someone adds
      // a token to its collection.
      await tx
        .table<Collection, string>("collections")
        .toCollection()
        .modify((collection) => {
          if (collection.defaults === undefined) {
            collection.defaults = helpers.createDefaultRequestDefaults();
          }
        });
      await tx
        .table<Folder, string>("folders")
        .toCollection()
        .modify((folder) => {
          if (folder.defaults === undefined) {
            folder.defaults = helpers.createDefaultRequestDefaults();
          }
        });
    });
  dexie
    .version(13)
    .stores({
      workspaces: "id, updatedAt",
      collections: "id, workspaceId, position",
      folders:
        "id, workspaceId, collectionId, parentFolderId, position, [collectionId+parentFolderId+position]",
      requests:
        "id, workspaceId, collectionId, folderId, position, updatedAt, method, bodyType, favorite, [workspaceId+collectionId+position]",
      history:
        "id, workspaceId, requestId, executedAt, method, status, favorite, pinned, [workspaceId+executedAt], [workspaceId+method], [workspaceId+status], [workspaceId+pinned], [workspaceId+favorite]",
      environments: "id, workspaceId",
    })
    .upgrade(async (tx) => {
      await tx
        .table<ApiRequest, string>("requests")
        .toCollection()
        .modify((request) => {
          if (request.postResponseScript === undefined) {
            request.postResponseScript = helpers.createDefaultPostResponseScript();
          }
        });
    });
  dexie
    .version(14)
    .stores({
      workspaces: "id, updatedAt",
      collections: "id, workspaceId, position",
      folders:
        "id, workspaceId, collectionId, parentFolderId, position, [collectionId+parentFolderId+position]",
      requests:
        "id, workspaceId, collectionId, folderId, position, updatedAt, method, bodyType, favorite, [workspaceId+collectionId+position]",
      history:
        "id, workspaceId, requestId, executedAt, method, status, favorite, pinned, [workspaceId+executedAt], [workspaceId+method], [workspaceId+status], [workspaceId+pinned], [workspaceId+favorite]",
      environments: "id, workspaceId",
    })
    .upgrade(async (tx) => {
      // Every request that existed before the WebSocket client is an HTTP
      // one. Backfilling both fields here (rather than leaning on
      // normalizeApiRequest alone) keeps what's in IndexedDB a complete
      // ApiRequest, so a row read outside the store isn't half-shaped.
      await tx
        .table<ApiRequest, string>("requests")
        .toCollection()
        .modify((request) => {
          if (request.protocol === undefined) request.protocol = "http";
          if (request.websocket === undefined) {
            request.websocket = helpers.createDefaultWebSocketConfig();
          }
        });
    });
}
