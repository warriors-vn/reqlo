import { toast } from "sonner";
import {
  db,
  uid,
  normalizeApiRequest,
  normalizeCollection,
  normalizeFolder,
  normalizeHistoryEntry,
  type ApiRequest,
  type Collection,
  type Environment,
  type Folder,
  type HistoryEntry,
  type Workspace,
} from "@/services/db";
import { parseCurl } from "@/services/curl";
import { looksLikePostmanCollection, parsePostmanCollection } from "@/services/postman";
import { looksLikeInsomniaExport, parseInsomniaExport } from "@/services/insomnia";
import { looksLikeHarLog, parseHarLog } from "@/services/har";
import { looksLikeOpenApiDocument, parseOpenApiDocument } from "@/services/openapi";
import {
  exportCollection as buildCollectionExport,
  exportWorkspace as buildWorkspaceExport,
  downloadJSON,
  validateCollectionExport,
  validateWorkspaceExport,
} from "@/services/portability";
import {
  buildCollectionFileTree,
  downloadZip,
  supportsDirectoryExport,
  writeFilesToDirectory,
} from "@/services/gitExport";
import { getNextCollectionPosition, getNextRequestPosition } from "@/services/tree-move";
import {
  commitImportedCollection,
  HISTORY_RETENTION,
  persistSession,
  remapBodyDraftIds,
  remapKvIds,
  resetPersistedSession,
  slugify,
  UNDO_GRACE_MS,
} from "@/stores/shared";
import type { SliceCreator } from "@/stores/types";

export interface ImportExportSlice {
  importCurl: (text: string) => Promise<ApiRequest | null>;
  applyCurlToRequest: (id: string, curlText: string) => Promise<boolean>;
  importCollectionJSON: (text: string) => Promise<Collection | null>;
  importPostmanCollectionJSON: (text: string) => Promise<Collection | null>;
  importInsomniaExportJSON: (text: string) => Promise<Collection | null>;
  importHarLogJSON: (text: string) => Promise<Collection | null>;
  importOpenApiText: (text: string) => Promise<Collection | null>;
  importWorkspaceJSON: (text: string) => Promise<Workspace | null>;
  exportCollectionById: (id: string) => Promise<void>;
  exportCollectionAsFilesById: (id: string) => Promise<void>;
  exportActiveWorkspace: () => Promise<void>;
}

export const createImportExportSlice: SliceCreator<ImportExportSlice> = (set, get) => ({
  importCurl: async (text) => {
    const ws = get().workspace;
    if (!ws) return null;
    const activeRequestId = get().tabs.find((tab) => tab.id === get().activeTabId)?.requestId;
    const activeRequest = get().requests.find((request) => request.id === activeRequestId);
    const colId = activeRequest?.collectionId ?? null;
    const folderId = activeRequest?.folderId ?? null;
    const req = parseCurl(text, ws.id, colId);
    if (!req.url) return null;
    req.folderId = folderId;
    req.position = getNextRequestPosition(get().requests, colId, folderId);
    await db.requests.add(req);
    set((s) => ({ requests: [...s.requests, normalizeApiRequest(req)] }));
    get().openRequest(req.id);

    const unattachedFiles = req.bodyDrafts.formData.filter(
      (row) => row.kind === "file" && row.files.length === 0,
    ).length;
    if (unattachedFiles > 0) {
      toast.info(
        `${unattachedFiles} file field${unattachedFiles === 1 ? "" : "s"} need${unattachedFiles === 1 ? "s" : ""} to be reattached — curl file paths aren't accessible from the browser.`,
      );
    }

    return req;
  },

  // Overwrites an already-open request in place, rather than creating a new
  // one like importCurl — this is what pasting a full cURL command into the
  // URL field does, matching Postman's URL-bar paste behavior.
  applyCurlToRequest: async (id, curlText) => {
    const existing = get().requests.find((r) => r.id === id);
    if (!existing) return false;
    const parsed = parseCurl(curlText, existing.workspaceId, existing.collectionId);
    if (!parsed.url) return false;

    const previous = {
      method: existing.method,
      url: existing.url,
      headers: existing.headers,
      queryParams: existing.queryParams,
      body: existing.body,
      bodyType: existing.bodyType,
      bodyDrafts: existing.bodyDrafts,
      auth: existing.auth,
    };
    await get().updateRequest(id, {
      method: parsed.method,
      url: parsed.url,
      headers: parsed.headers,
      queryParams: parsed.queryParams,
      body: parsed.body,
      bodyType: parsed.bodyType,
      bodyDrafts: parsed.bodyDrafts,
      auth: parsed.auth,
    });

    toast(`Request replaced from pasted cURL`, {
      duration: UNDO_GRACE_MS,
      action: { label: "Undo", onClick: () => void get().updateRequest(id, previous) },
    });

    const unattachedFiles = parsed.bodyDrafts.formData.filter(
      (row) => row.kind === "file" && row.files.length === 0,
    ).length;
    if (unattachedFiles > 0) {
      toast.info(
        `${unattachedFiles} file field${unattachedFiles === 1 ? "" : "s"} need${unattachedFiles === 1 ? "s" : ""} to be reattached — curl file paths aren't accessible from the browser.`,
      );
    }

    return true;
  },

  importCollectionJSON: async (text) => {
    const ws = get().workspace;
    if (!ws) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return null;
    }
    if (!validateCollectionExport(parsed)) return null;

    const position = getNextCollectionPosition(get().collections);
    const newCol: Collection = normalizeCollection({
      id: uid(),
      workspaceId: ws.id,
      name: parsed.collection.name || "Imported",
      position,
      // Export files written before collection-level defaults existed have no
      // `defaults` at all — normalizeCollection/normalizeFolder fill them in
      // rather than letting an old file produce a row missing the field.
      defaults: parsed.collection.defaults,
      createdAt: Date.now(),
    });
    const now = Date.now();

    const srcFolders = parsed.folders ?? [];
    const folderIdMap = new Map<string, string>();
    srcFolders.forEach((folder) => folderIdMap.set(folder.id, uid()));
    const newFolders: Folder[] = srcFolders.map((folder) =>
      normalizeFolder({
        id: folderIdMap.get(folder.id)!,
        workspaceId: ws.id,
        collectionId: newCol.id,
        parentFolderId: folder.parentFolderId
          ? (folderIdMap.get(folder.parentFolderId) ?? null)
          : null,
        name: folder.name,
        position: folder.position ?? 0,
        defaults: folder.defaults,
        createdAt: folder.createdAt ?? now,
      }),
    );

    const newReqs: ApiRequest[] = parsed.requests.map((r, index) =>
      normalizeApiRequest({
        ...r,
        id: uid(),
        workspaceId: ws.id,
        collectionId: newCol.id,
        folderId: r.folderId ? (folderIdMap.get(r.folderId) ?? null) : null,
        position: r.position ?? index,
        headers: (r.headers ?? []).map((h) => ({ ...h, id: uid() })),
        queryParams: (r.queryParams ?? []).map((p) => ({ ...p, id: uid() })),
        extracts: (r.extracts ?? []).map((rule) => ({ ...rule, id: uid() })),
        assertions: (r.assertions ?? []).map((rule) => ({ ...rule, id: uid() })),
        createdAt: now,
        updatedAt: now,
      }),
    );
    await db.transaction("rw", db.collections, db.folders, db.requests, async () => {
      await db.collections.add(newCol);
      if (newFolders.length) await db.folders.bulkAdd(newFolders);
      if (newReqs.length) await db.requests.bulkAdd(newReqs);
    });
    set((s) => ({
      collections: [...s.collections, newCol],
      folders: [...s.folders, ...newFolders],
      requests: [...s.requests, ...newReqs],
    }));
    return newCol;
  },

  importPostmanCollectionJSON: async (text) => {
    const ws = get().workspace;
    if (!ws) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return null;
    }
    if (!looksLikePostmanCollection(parsed)) return null;
    return commitImportedCollection(parsePostmanCollection(parsed, ws.id), ws, set, get);
  },

  importInsomniaExportJSON: async (text) => {
    const ws = get().workspace;
    if (!ws) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return null;
    }
    if (!looksLikeInsomniaExport(parsed)) return null;
    return commitImportedCollection(parseInsomniaExport(parsed, ws.id), ws, set, get);
  },

  importHarLogJSON: async (text) => {
    const ws = get().workspace;
    if (!ws) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return null;
    }
    if (!looksLikeHarLog(parsed)) return null;
    return commitImportedCollection(parseHarLog(parsed, ws.id), ws, set, get);
  },

  importOpenApiText: async (text) => {
    const ws = get().workspace;
    if (!ws) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      try {
        const yaml = await import("js-yaml");
        parsed = yaml.load(text);
      } catch {
        return null;
      }
    }
    if (!looksLikeOpenApiDocument(parsed)) return null;
    return commitImportedCollection(parseOpenApiDocument(parsed, ws.id), ws, set, get);
  },

  importWorkspaceJSON: async (text) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return null;
    }
    if (!validateWorkspaceExport(parsed)) return null;

    const now = Date.now();
    const workspaceId = uid();
    const workspace: Workspace = {
      ...parsed.workspace,
      id: workspaceId,
      globals: parsed.workspace.globals ?? [],
      createdAt: parsed.workspace.createdAt ?? now,
      updatedAt: now,
    };

    const collectionIdMap = new Map<string, string>();
    const collections: Collection[] = parsed.collections.map((collection, index) => {
      const id = uid();
      collectionIdMap.set(collection.id, id);
      return normalizeCollection({
        ...collection,
        id,
        workspaceId,
        position: index,
        createdAt: collection.createdAt ?? now,
      });
    });

    const srcFolders = parsed.folders ?? [];
    const folderIdMap = new Map<string, string>();
    srcFolders.forEach((folder) => folderIdMap.set(folder.id, uid()));
    const folders: Folder[] = srcFolders.map((folder) =>
      normalizeFolder({
        ...folder,
        id: folderIdMap.get(folder.id)!,
        workspaceId,
        collectionId: collectionIdMap.get(folder.collectionId) ?? folder.collectionId,
        parentFolderId: folder.parentFolderId
          ? (folderIdMap.get(folder.parentFolderId) ?? null)
          : null,
        createdAt: folder.createdAt ?? now,
      }),
    );

    const requestIdMap = new Map<string, string>();
    const requests: ApiRequest[] = parsed.requests.map((request) => {
      const id = uid();
      requestIdMap.set(request.id, id);
      return normalizeApiRequest({
        ...request,
        id,
        workspaceId,
        collectionId: request.collectionId
          ? (collectionIdMap.get(request.collectionId) ?? null)
          : null,
        folderId: request.folderId ? (folderIdMap.get(request.folderId) ?? null) : null,
        position: request.position,
        headers: remapKvIds(request.headers ?? []),
        queryParams: remapKvIds(request.queryParams ?? []),
        bodyDrafts: remapBodyDraftIds(request.bodyDrafts),
        extracts: remapKvIds(request.extracts ?? []),
        assertions: remapKvIds(request.assertions ?? []),
        createdAt: request.createdAt ?? now,
        updatedAt: request.updatedAt ?? now,
      });
    });

    const environmentIdMap = new Map<string, string>();
    const environments: Environment[] = parsed.environments.map((environment) => {
      const id = uid();
      environmentIdMap.set(environment.id, id);
      return {
        ...environment,
        id,
        workspaceId,
        variables: remapKvIds(environment.variables ?? []),
        createdAt: environment.createdAt ?? now,
      };
    });

    const history: HistoryEntry[] = parsed.history
      .map((entry) =>
        normalizeHistoryEntry({
          ...entry,
          id: uid(),
          workspaceId,
          requestId: entry.requestId ? (requestIdMap.get(entry.requestId) ?? null) : null,
          environmentId: entry.environmentId
            ? (environmentIdMap.get(entry.environmentId) ?? null)
            : null,
          snapshot: {
            ...entry.snapshot,
            requestId: entry.snapshot.requestId
              ? (requestIdMap.get(entry.snapshot.requestId) ?? null)
              : null,
            workspaceId,
            collectionId: entry.snapshot.collectionId
              ? (collectionIdMap.get(entry.snapshot.collectionId) ?? null)
              : null,
            headers: remapKvIds(entry.snapshot.headers ?? []),
            queryParams: remapKvIds(entry.snapshot.queryParams ?? []),
            bodyDrafts: remapBodyDraftIds(entry.snapshot.bodyDrafts),
          },
        }),
      )
      .sort((left, right) => right.executedAt - left.executedAt)
      // A restored export is a write like any other — it must respect the
      // same retention limit addHistory enforces on every other write, or a
      // heavy export reproduces the exact unbounded-table bug this retention
      // work fixed, just via a different door.
      .slice(0, HISTORY_RETENTION);

    await db.transaction(
      "rw",
      [db.history, db.requests, db.folders, db.collections, db.environments, db.workspaces],
      async () => {
        await db.history.clear();
        await db.requests.clear();
        await db.folders.clear();
        await db.collections.clear();
        await db.environments.clear();
        await db.workspaces.clear();

        await db.workspaces.add(workspace);
        if (collections.length) await db.collections.bulkAdd(collections);
        if (folders.length) await db.folders.bulkAdd(folders);
        if (requests.length) await db.requests.bulkAdd(requests);
        if (environments.length) await db.environments.bulkAdd(environments);
        if (history.length) await db.history.bulkAdd(history);
      },
    );

    resetPersistedSession();

    const tabs = requests[0] ? [{ id: uid(), requestId: requests[0].id }] : [];
    set((state) => ({
      workspace,
      collections,
      folders,
      requests,
      environments,
      history,
      tabs,
      activeTabId: tabs[0]?.id ?? null,
      activeEnvId: environments[0]?.id ?? null,
      sendPing: 0,
      overlays: {
        ...state.overlays,
        palette: false,
        settings: false,
      },
    }));
    persistSession(get);
    return workspace;
  },

  exportCollectionById: async (id) => {
    const col = get().collections.find((c) => c.id === id);
    if (!col) return;
    const data = await buildCollectionExport(col);
    downloadJSON(data, `${slugify(col.name)}.reqlo.json`);
  },

  exportCollectionAsFilesById: async (id) => {
    const col = get().collections.find((c) => c.id === id);
    if (!col) return;
    const files = await buildCollectionFileTree(col);
    if (supportsDirectoryExport()) {
      // Returns false if the user cancels the picker — respect that instead of falling back.
      await writeFilesToDirectory(files);
      return;
    }
    downloadZip(files, `${slugify(col.name)}.zip`, slugify(col.name));
  },

  exportActiveWorkspace: async () => {
    const ws = get().workspace;
    if (!ws) return;
    const data = await buildWorkspaceExport(ws);
    downloadJSON(data, `${slugify(ws.name)}-workspace.reqlo.json`);

    const secretCount =
      get().environments.reduce(
        (sum, env) => sum + env.variables.filter((v) => v.secret).length,
        0,
      ) + ws.globals.filter((v) => v.secret).length;
    if (secretCount > 0) {
      toast.info(
        `${secretCount} secret value${secretCount > 1 ? "s were" : " was"} left out of this export`,
      );
    }
  },
});
