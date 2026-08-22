import Dexie from "dexie";
import { create } from "zustand";
import { toast } from "sonner";
import {
  db,
  uid,
  type ApiRequest,
  type Collection,
  type Folder,
  type HistoryEntry,
  type Workspace,
  type HttpMethod,
  type Environment,
  createDefaultAuth,
  createDefaultBodyDrafts,
  createDefaultMock,
  cloneBodyDrafts,
  ensureSeed,
  normalizeApiRequest,
  normalizeHistoryEntry,
  requestPersistentStorage,
} from "@/services/db";
import { parseCurl } from "@/services/curl";
import { looksLikePostmanCollection, parsePostmanCollection } from "@/services/postman";
import {
  exportCollection as buildCollectionExport,
  exportWorkspace as buildWorkspaceExport,
  downloadJSON,
  pickFile,
  validateCollectionExport,
  validateWorkspaceExport,
} from "@/services/portability";
import {
  buildCollectionFileTree,
  downloadZip,
  supportsDirectoryExport,
  writeFilesToDirectory,
} from "@/services/gitExport";

interface Tab {
  id: string;
  requestId: string;
}

export interface SidebarSelection {
  type: "request" | "collection";
  id: string;
}

export interface SidebarTreeState {
  collections: Record<string, boolean>;
  favorites: boolean;
  unfiled: boolean;
}

export type OverlayKey =
  | "palette"
  | "import-curl"
  | "settings"
  | "history"
  | "env-switcher"
  | "shortcuts";

interface State {
  ready: boolean;
  workspace: Workspace | null;
  collections: Collection[];
  folders: Folder[];
  requests: ApiRequest[];
  history: HistoryEntry[];
  environments: Environment[];
  activeEnvId: string | null;

  tabs: Tab[];
  activeTabId: string | null;

  overlays: Record<OverlayKey, boolean>;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  sidebarTree: SidebarTreeState;
  sidebarSelection: SidebarSelection | null;

  // last fire time, used to ping AnimatePresence-style listeners
  sendPing: number;

  init: () => Promise<void>;

  // overlays
  openOverlay: (k: OverlayKey) => void;
  closeOverlay: (k: OverlayKey) => void;
  toggleOverlay: (k: OverlayKey) => void;
  setPalette: (open: boolean) => void; // legacy alias

  // tabs / selection
  openRequest: (requestId: string) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  activateAdjacentTab: (direction: "next" | "prev") => void;
  getActiveRequest: () => ApiRequest | null;
  setSidebarSelection: (selection: SidebarSelection | null) => void;

  // requests
  updateRequest: (id: string, patch: Partial<ApiRequest>) => Promise<void>;
  createRequest: (collectionId: string | null, folderId?: string | null) => Promise<ApiRequest>;
  deleteRequest: (id: string) => Promise<void>;
  renameRequest: (id: string, name: string) => Promise<void>;
  moveRequestToCollection: (id: string, collectionId: string | null) => Promise<void>;
  moveRequestToFolder: (id: string, collectionId: string, folderId: string | null) => Promise<void>;
  reorderRequests: (
    draggedId: string,
    targetId: string | null,
    collectionId: string | null,
    folderId: string | null,
  ) => Promise<void>;
  duplicateRequest: (id: string) => Promise<ApiRequest | null>;
  toggleFavorite: (id: string) => Promise<void>;
  requestSend: () => void; // bumps sendPing; Workspace listens

  // collections
  createCollection: (name: string) => Promise<Collection>;
  renameCollection: (id: string, name: string) => Promise<void>;
  reorderCollections: (draggedId: string, targetId: string) => Promise<void>;
  duplicateCollection: (id: string) => Promise<Collection | null>;
  deleteCollection: (id: string) => Promise<void>;

  // folders
  createFolder: (
    collectionId: string,
    parentFolderId: string | null,
    name: string,
  ) => Promise<Folder>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  reorderFolders: (draggedId: string, targetId: string) => Promise<void>;
  moveFolderToParent: (folderId: string, parentFolderId: string | null) => Promise<void>;

  // environments
  createEnvironment: (name: string) => Promise<Environment>;
  updateEnvironment: (
    id: string,
    patch: Partial<Pick<Environment, "name" | "variables">>,
  ) => Promise<void>;
  duplicateEnvironment: (id: string) => Promise<Environment | null>;
  deleteEnvironment: (id: string) => Promise<void>;
  setActiveEnv: (id: string | null) => void;

  // history
  addHistory: (entry: HistoryEntry) => Promise<void>;
  restoreHistoryEntry: (
    historyId: string,
    options?: { openInNewTab?: boolean; rerun?: boolean },
  ) => Promise<void>;
  toggleHistoryFavorite: (historyId: string) => Promise<void>;
  toggleHistoryPinned: (historyId: string) => Promise<void>;
  deleteHistoryEntry: (historyId: string) => Promise<void>;
  clearHistory: () => Promise<void>;

  // import / export
  importCurl: (text: string) => Promise<ApiRequest | null>;
  importCollectionJSON: (text: string) => Promise<Collection | null>;
  importPostmanCollectionJSON: (text: string) => Promise<Collection | null>;
  importWorkspaceJSON: (text: string) => Promise<Workspace | null>;
  exportCollectionById: (id: string) => Promise<void>;
  exportCollectionAsFilesById: (id: string) => Promise<void>;
  exportActiveWorkspace: () => Promise<void>;

  // view
  toggleSidebar: () => void;
  setSidebarWidth: (px: number) => void;
  setSidebarTreeOpen: (section: keyof SidebarTreeState | string, open: boolean) => void;
}

const DEFAULT_SIDEBAR_TREE: SidebarTreeState = {
  collections: {},
  favorites: true,
  unfiled: true,
};

export const useStore = create<State>((set, get) => ({
  ready: false,
  workspace: null,
  collections: [],
  folders: [],
  requests: [],
  history: [],
  environments: [],
  activeEnvId: null,
  tabs: [],
  activeTabId: null,
  overlays: {
    palette: false,
    "import-curl": false,
    settings: false,
    history: false,
    "env-switcher": false,
    shortcuts: false,
  },
  sidebarCollapsed: false,
  sidebarWidth: 288,
  sidebarTree: { ...DEFAULT_SIDEBAR_TREE, collections: {} },
  sidebarSelection: null,
  sendPing: 0,

  init: async () => {
    void requestPersistentStorage();
    const ws = await ensureSeed();
    const [collections, folders, requests, history, environments] = await Promise.all([
      db.collections.where("workspaceId").equals(ws.id).toArray(),
      db.folders.where("workspaceId").equals(ws.id).toArray(),
      db.requests
        .where("workspaceId")
        .equals(ws.id)
        .toArray()
        .then((items) => items.map(normalizeApiRequest)),
      db.history
        .where("[workspaceId+executedAt]")
        .between([ws.id, Dexie.minKey], [ws.id, Dexie.maxKey])
        .reverse()
        .toArray()
        .then((items) => items.map(normalizeHistoryEntry)),
      db.environments.where("workspaceId").equals(ws.id).toArray(),
    ]);
    collections.sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
    folders.sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
    requests.sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);

    let tabs: Tab[] = [];
    let activeTabId: string | null = null;
    let activeEnvId: string | null = environments[0]?.id ?? null;
    let sidebarCollapsed = false;
    let sidebarWidth = 288;
    let sidebarTree = { ...DEFAULT_SIDEBAR_TREE, collections: {} };
    try {
      const raw = localStorage.getItem("reqlo:session");
      if (raw) {
        const parsed = JSON.parse(raw) as {
          tabs: Tab[];
          activeTabId: string | null;
          activeEnvId?: string | null;
          sidebarCollapsed?: boolean;
          sidebarWidth?: number;
          sidebarTree?: SidebarTreeState;
        };
        const validIds = new Set(requests.map((r) => r.id));
        tabs = (parsed.tabs ?? []).filter((t) => validIds.has(t.requestId));
        activeTabId =
          parsed.activeTabId && tabs.find((t) => t.id === parsed.activeTabId)
            ? parsed.activeTabId
            : (tabs[0]?.id ?? null);
        if (parsed.activeEnvId && environments.find((e) => e.id === parsed.activeEnvId))
          activeEnvId = parsed.activeEnvId;
        sidebarCollapsed = !!parsed.sidebarCollapsed;
        if (typeof parsed.sidebarWidth === "number")
          sidebarWidth = Math.min(480, Math.max(220, Math.round(parsed.sidebarWidth)));
        sidebarTree = setSidebarTreeDefaults(parsed.sidebarTree);
      }
    } catch {
      // Ignore invalid persisted session state and fall back to defaults.
    }

    if (tabs.length === 0 && requests[0]) {
      const t: Tab = { id: uid(), requestId: requests[0].id };
      tabs = [t];
      activeTabId = t.id;
    }

    set({
      ready: true,
      workspace: ws,
      collections,
      folders,
      requests,
      history,
      environments,
      activeEnvId,
      tabs,
      activeTabId,
      sidebarCollapsed,
      sidebarWidth,
      sidebarTree,
    });
  },

  openOverlay: (k) => set((s) => ({ overlays: { ...s.overlays, [k]: true } })),
  closeOverlay: (k) => set((s) => ({ overlays: { ...s.overlays, [k]: false } })),
  toggleOverlay: (k) => set((s) => ({ overlays: { ...s.overlays, [k]: !s.overlays[k] } })),
  setPalette: (open) => set((s) => ({ overlays: { ...s.overlays, palette: open } })),

  openRequest: (requestId) => {
    const existing = get().tabs.find((t) => t.requestId === requestId);
    if (existing) {
      set({ activeTabId: existing.id });
    } else {
      const t: Tab = { id: uid(), requestId };
      set((s) => ({ tabs: [...s.tabs, t], activeTabId: t.id }));
    }
    persistSession(get);
  },

  closeTab: (tabId) => {
    const { tabs, activeTabId } = get();
    const idx = tabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return;
    const next = tabs.filter((t) => t.id !== tabId);
    let nextActive = activeTabId;
    if (activeTabId === tabId) nextActive = next[Math.max(0, idx - 1)]?.id ?? null;
    set({ tabs: next, activeTabId: nextActive });
    persistSession(get);
  },

  setActiveTab: (tabId) => {
    set({ activeTabId: tabId });
    persistSession(get);
  },

  activateAdjacentTab: (direction) => {
    const { tabs, activeTabId } = get();
    if (!tabs.length) return;
    const currentIndex = tabs.findIndex((tab) => tab.id === activeTabId);
    if (currentIndex === -1) {
      set({ activeTabId: tabs[0].id });
      persistSession(get);
      return;
    }
    const nextIndex =
      direction === "next"
        ? (currentIndex + 1) % tabs.length
        : (currentIndex - 1 + tabs.length) % tabs.length;
    set({ activeTabId: tabs[nextIndex].id });
    persistSession(get);
  },

  setSidebarSelection: (selection) => {
    set({ sidebarSelection: selection });
  },

  getActiveRequest: () => {
    const { tabs, activeTabId, requests } = get();
    const t = tabs.find((x) => x.id === activeTabId);
    return t ? (requests.find((r) => r.id === t.requestId) ?? null) : null;
  },

  updateRequest: async (id, patch) => {
    const updatedAt = Date.now();
    set((s) => ({
      requests: s.requests.map((r) => (r.id === id ? { ...r, ...patch, updatedAt } : r)),
    }));
    await reportDbWriteFailure(db.requests.update(id, { ...patch, updatedAt }));
  },

  createRequest: async (collectionId, folderId = null) => {
    const ws = get().workspace!;
    const now = Date.now();
    const req: ApiRequest = {
      id: uid(),
      workspaceId: ws.id,
      collectionId,
      folderId,
      position: getNextRequestPosition(get().requests, collectionId, folderId),
      name: "Untitled request",
      method: "GET" as HttpMethod,
      url: "",
      headers: [],
      queryParams: [],
      body: "",
      bodyType: "none",
      bodyDrafts: createDefaultBodyDrafts(),
      auth: createDefaultAuth(),
      extracts: [],
      assertions: [],
      mock: createDefaultMock(),
      createdAt: now,
      updatedAt: now,
    };
    await reportDbWriteFailure(db.requests.add(req));
    set((s) => ({ requests: [...s.requests, req] }));
    get().openRequest(req.id);
    return req;
  },

  deleteRequest: async (id) => {
    await reportDbWriteFailure(db.requests.delete(id));
    set((s) => {
      const nextTabs = s.tabs.filter((t) => t.requestId !== id);
      const activeTabStillExists = !!nextTabs.find((tab) => tab.id === s.activeTabId);
      return {
        requests: s.requests.filter((r) => r.id !== id),
        tabs: nextTabs,
        activeTabId: activeTabStillExists ? s.activeTabId : (nextTabs[0]?.id ?? null),
        sidebarSelection:
          s.sidebarSelection?.type === "request" && s.sidebarSelection.id === id
            ? null
            : s.sidebarSelection,
      };
    });
    persistSession(get);
  },

  renameRequest: async (id, name) => {
    await get().updateRequest(id, { name });
  },

  moveRequestToCollection: async (id, collectionId) => {
    // Explicitly zero folderId: a request dropped onto a bare collection row must leave
    // whatever folder it was in, or it keeps a stale folderId pointing at a folder that may
    // not even belong to the destination collection.
    await get().reorderRequests(id, null, collectionId, null);
  },

  moveRequestToFolder: async (id, collectionId, folderId) => {
    await get().reorderRequests(id, null, collectionId, folderId);
  },

  reorderRequests: async (draggedId, targetId, collectionId, folderId) => {
    if (draggedId === targetId) return;
    const allRequests = get().requests;
    const dragged = allRequests.find((request) => request.id === draggedId);
    if (!dragged) return;

    const sourceCollectionId = dragged.collectionId ?? null;
    const sourceFolderId = dragged.folderId ?? null;
    const sourceSiblings = sortRequestsForCollection(
      allRequests.filter(
        (request) =>
          request.collectionId === sourceCollectionId &&
          request.folderId === sourceFolderId &&
          request.id !== draggedId,
      ),
    );
    const sameContainer = sourceCollectionId === collectionId && sourceFolderId === folderId;
    const targetSiblingsBase = sameContainer
      ? sourceSiblings
      : sortRequestsForCollection(
          allRequests.filter(
            (request) =>
              request.collectionId === collectionId &&
              request.folderId === folderId &&
              request.id !== draggedId,
          ),
        );

    const nextDragged: ApiRequest = { ...dragged, collectionId, folderId };
    const targetIndex =
      targetId === null
        ? targetSiblingsBase.length
        : targetSiblingsBase.findIndex((request) => request.id === targetId);
    if (targetIndex === -1) return;

    const targetSiblings = targetSiblingsBase.slice();
    targetSiblings.splice(targetIndex, 0, nextDragged);

    const sourceUpdated = resequenceRequests(sourceSiblings);
    const targetUpdated = resequenceRequests(targetSiblings);
    const changed = [...sourceUpdated, ...targetUpdated];
    const changedMap = new Map(changed.map((request) => [request.id, request]));

    set((state) => ({
      requests: state.requests
        .map((request) => changedMap.get(request.id) ?? request)
        .sort(compareRequestsByPosition),
    }));
    await reportDbWriteFailure(db.requests.bulkPut([...changedMap.values()]));
  },

  duplicateRequest: async (id) => {
    const src = get().requests.find((r) => r.id === id);
    if (!src) return null;
    const now = Date.now();
    const copy: ApiRequest = {
      ...src,
      id: uid(),
      position: getNextRequestPosition(get().requests, src.collectionId, src.folderId),
      name: `${src.name} (copy)`,
      headers: src.headers.map((h) => ({ ...h, id: uid() })),
      queryParams: src.queryParams.map((p) => ({ ...p, id: uid() })),
      bodyDrafts: cloneBodyDrafts(src.bodyDrafts),
      auth: { ...src.auth },
      extracts: src.extracts.map((rule) => ({ ...rule, id: uid() })),
      assertions: src.assertions.map((rule) => ({ ...rule, id: uid() })),
      mock: { ...src.mock },
      createdAt: now,
      updatedAt: now,
    };
    await reportDbWriteFailure(db.requests.add(copy));
    set((s) => ({ requests: [...s.requests, copy] }));
    get().openRequest(copy.id);
    return copy;
  },

  toggleFavorite: async (id) => {
    const r = get().requests.find((x) => x.id === id);
    if (!r) return;
    await get().updateRequest(id, { favorite: !r.favorite });
  },

  requestSend: () => set({ sendPing: Date.now() }),

  createCollection: async (name) => {
    const ws = get().workspace!;
    const position = getNextCollectionPosition(get().collections);
    const finalName = name.trim() || `Collection ${get().collections.length + 1}`;
    const col: Collection = {
      id: uid(),
      workspaceId: ws.id,
      name: finalName,
      position,
      createdAt: Date.now(),
    };
    await reportDbWriteFailure(db.collections.add(col));
    set((s) => ({ collections: [...s.collections, col] }));
    return col;
  },

  renameCollection: async (id, name) => {
    const nextName = name.trim();
    if (!nextName) return;
    await reportDbWriteFailure(db.collections.update(id, { name: nextName }));
    set((state) => ({
      collections: state.collections.map((collection) =>
        collection.id === id ? { ...collection, name: nextName } : collection,
      ),
    }));
  },

  reorderCollections: async (draggedId, targetId) => {
    if (draggedId === targetId) return;
    const collections = [...get().collections].sort(
      (left, right) => left.position - right.position,
    );
    const draggedIndex = collections.findIndex((collection) => collection.id === draggedId);
    const targetIndex = collections.findIndex((collection) => collection.id === targetId);
    if (draggedIndex === -1 || targetIndex === -1) return;

    const reordered = reorderByIndex(collections, draggedIndex, targetIndex).map(
      (collection, index) => ({
        ...collection,
        position: index,
      }),
    );

    set({ collections: reordered });
    await reportDbWriteFailure(db.collections.bulkPut(reordered));
  },

  duplicateCollection: async (id) => {
    const src = get().collections.find((c) => c.id === id);
    if (!src) return null;
    const ws = get().workspace!;
    const now = Date.now();
    const position = getNextCollectionPosition(get().collections);
    const copy: Collection = {
      id: uid(),
      workspaceId: ws.id,
      name: `${src.name} (copy)`,
      position,
      createdAt: now,
    };

    const srcFolders = get().folders.filter((f) => f.collectionId === id);
    const folderIdMap = new Map<string, string>();
    srcFolders.forEach((folder) => folderIdMap.set(folder.id, uid()));
    const newFolders: Folder[] = srcFolders.map((folder) => ({
      id: folderIdMap.get(folder.id)!,
      workspaceId: ws.id,
      collectionId: copy.id,
      parentFolderId: folder.parentFolderId
        ? (folderIdMap.get(folder.parentFolderId) ?? null)
        : null,
      name: folder.name,
      position: folder.position,
      createdAt: now,
    }));

    const srcReqs = get().requests.filter((r) => r.collectionId === id);
    const copies: ApiRequest[] = srcReqs.map((r) => ({
      ...r,
      id: uid(),
      collectionId: copy.id,
      folderId: r.folderId ? (folderIdMap.get(r.folderId) ?? null) : null,
      position: r.position,
      headers: r.headers.map((h) => ({ ...h, id: uid() })),
      queryParams: r.queryParams.map((p) => ({ ...p, id: uid() })),
      bodyDrafts: cloneBodyDrafts(r.bodyDrafts),
      auth: { ...r.auth },
      extracts: r.extracts.map((rule) => ({ ...rule, id: uid() })),
      assertions: r.assertions.map((rule) => ({ ...rule, id: uid() })),
      mock: { ...r.mock },
      createdAt: now,
      updatedAt: now,
    }));

    await reportDbWriteFailure(
      db.transaction("rw", db.collections, db.folders, db.requests, async () => {
        await db.collections.add(copy);
        if (newFolders.length) await db.folders.bulkAdd(newFolders);
        if (copies.length) await db.requests.bulkAdd(copies);
      }),
    );
    set((s) => ({
      collections: [...s.collections, copy],
      folders: [...s.folders, ...newFolders],
      requests: [...s.requests, ...copies],
    }));
    return copy;
  },

  deleteCollection: async (id) => {
    const reqs = get().requests.filter((r) => r.collectionId === id);
    const folders = get().folders.filter((f) => f.collectionId === id);
    await reportDbWriteFailure(
      db.transaction("rw", db.collections, db.folders, db.requests, async () => {
        await db.requests.bulkDelete(reqs.map((r) => r.id));
        await db.folders.bulkDelete(folders.map((f) => f.id));
        await db.collections.delete(id);
      }),
    );
    set((s) => ({
      collections: s.collections.filter((c) => c.id !== id),
      folders: s.folders.filter((f) => f.collectionId !== id),
      requests: s.requests.filter((r) => r.collectionId !== id),
      tabs: s.tabs.filter((t) => !reqs.find((r) => r.id === t.requestId)),
      sidebarSelection:
        s.sidebarSelection?.type === "collection" && s.sidebarSelection.id === id
          ? null
          : s.sidebarSelection,
    }));
    persistSession(get);
  },

  createFolder: async (collectionId, parentFolderId, name) => {
    const ws = get().workspace!;
    const position = getNextFolderPosition(get().folders, collectionId, parentFolderId);
    const folder: Folder = {
      id: uid(),
      workspaceId: ws.id,
      collectionId,
      parentFolderId,
      name: name.trim() || "New folder",
      position,
      createdAt: Date.now(),
    };
    await reportDbWriteFailure(db.folders.add(folder));
    set((s) => ({ folders: [...s.folders, folder] }));
    return folder;
  },

  renameFolder: async (id, name) => {
    const nextName = name.trim();
    if (!nextName) return;
    await reportDbWriteFailure(db.folders.update(id, { name: nextName }));
    set((state) => ({
      folders: state.folders.map((folder) =>
        folder.id === id ? { ...folder, name: nextName } : folder,
      ),
    }));
  },

  deleteFolder: async (id) => {
    const allFolders = get().folders;
    const descendantFolderIds = collectDescendantFolderIds(allFolders, id);
    const doomedFolderIds = new Set([id, ...descendantFolderIds]);
    const doomedRequestIds = get()
      .requests.filter((request) => !!request.folderId && doomedFolderIds.has(request.folderId))
      .map((request) => request.id);

    await reportDbWriteFailure(
      db.transaction("rw", db.folders, db.requests, async () => {
        await db.requests.bulkDelete(doomedRequestIds);
        await db.folders.bulkDelete([...doomedFolderIds]);
      }),
    );
    set((s) => ({
      folders: s.folders.filter((folder) => !doomedFolderIds.has(folder.id)),
      requests: s.requests.filter((request) => !doomedRequestIds.includes(request.id)),
      tabs: s.tabs.filter((tab) => !doomedRequestIds.includes(tab.requestId)),
      sidebarSelection:
        s.sidebarSelection?.type === "collection" && doomedFolderIds.has(s.sidebarSelection.id)
          ? null
          : s.sidebarSelection,
    }));
    persistSession(get);
  },

  reorderFolders: async (draggedId, targetId) => {
    if (draggedId === targetId) return;
    const dragged = get().folders.find((folder) => folder.id === draggedId);
    if (!dragged) return;

    const siblings = get()
      .folders.filter(
        (folder) =>
          folder.collectionId === dragged.collectionId &&
          folder.parentFolderId === dragged.parentFolderId,
      )
      .sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
    const draggedIndex = siblings.findIndex((folder) => folder.id === draggedId);
    const targetIndex = siblings.findIndex((folder) => folder.id === targetId);
    if (draggedIndex === -1 || targetIndex === -1) return;

    const reordered = reorderByIndex(siblings, draggedIndex, targetIndex).map((folder, index) => ({
      ...folder,
      position: index,
    }));
    const reorderedMap = new Map(reordered.map((folder) => [folder.id, folder]));
    set((state) => ({
      folders: state.folders.map((folder) => reorderedMap.get(folder.id) ?? folder),
    }));
    await reportDbWriteFailure(db.folders.bulkPut(reordered));
  },

  moveFolderToParent: async (folderId, parentFolderId) => {
    const folder = get().folders.find((item) => item.id === folderId);
    if (!folder) return;
    if (folder.parentFolderId === parentFolderId) return;
    if (wouldCreateCycle(get().folders, folderId, parentFolderId)) return;

    const position = getNextFolderPosition(get().folders, folder.collectionId, parentFolderId);
    set((state) => ({
      folders: state.folders.map((item) =>
        item.id === folderId ? { ...item, parentFolderId, position } : item,
      ),
    }));
    await reportDbWriteFailure(db.folders.update(folderId, { parentFolderId, position }));
  },

  createEnvironment: async (name) => {
    const ws = get().workspace!;
    const finalName =
      name.trim() || suggestEnvironmentName(get().environments.map((env) => env.name));
    const env: Environment = {
      id: uid(),
      workspaceId: ws.id,
      name: finalName,
      variables: [],
      createdAt: Date.now(),
    };
    await db.environments.add(env);
    set((s) => ({ environments: [...s.environments, env], activeEnvId: s.activeEnvId ?? env.id }));
    persistSession(get);
    return env;
  },

  updateEnvironment: async (id, patch) => {
    const current = get().environments.find((environment) => environment.id === id);
    if (!current) return;

    const payload: Partial<Pick<Environment, "name" | "variables">> = {
      ...patch,
      ...(patch.name !== undefined ? { name: patch.name.trim() || current.name } : {}),
      ...(patch.variables ? { variables: patch.variables.map((item) => ({ ...item })) } : {}),
    };

    set((state) => ({
      environments: state.environments.map((environment) =>
        environment.id === id ? { ...environment, ...payload } : environment,
      ),
    }));
    await db.environments.update(id, payload);
  },

  duplicateEnvironment: async (id) => {
    const source = get().environments.find((environment) => environment.id === id);
    const workspace = get().workspace;
    if (!source || !workspace) return null;

    const copy: Environment = {
      ...source,
      id: uid(),
      workspaceId: workspace.id,
      name: suggestCopyName(
        source.name,
        get().environments.map((environment) => environment.name),
      ),
      variables: source.variables.map((item) => ({ ...item })),
      createdAt: Date.now(),
    };

    await db.environments.add(copy);
    set((state) => ({ environments: [...state.environments, copy] }));
    persistSession(get);
    return copy;
  },

  deleteEnvironment: async (id) => {
    await db.environments.delete(id);
    set((state) => {
      const environments = state.environments.filter((environment) => environment.id !== id);
      return {
        environments,
        activeEnvId: state.activeEnvId === id ? (environments[0]?.id ?? null) : state.activeEnvId,
      };
    });
    persistSession(get);
  },

  setActiveEnv: (id) => {
    if (id && !get().environments.some((environment) => environment.id === id)) return;
    set({ activeEnvId: id });
    persistSession(get);
  },

  addHistory: async (entry) => {
    const normalized = normalizeHistoryEntry(entry);
    await db.history.put(normalized);
    set((s) => ({
      history: [normalized, ...s.history.filter((h) => h.id !== normalized.id)].slice(0, 2500),
    }));
  },

  restoreHistoryEntry: async (historyId, options) => {
    const entry = get().history.find((item) => item.id === historyId);
    const workspace = get().workspace;
    if (!entry || !workspace) return;

    const now = Date.now();
    const snapshot = entry.snapshot;
    const existing = snapshot.requestId
      ? get().requests.find((request) => request.id === snapshot.requestId)
      : null;
    let targetRequestId: string | null;

    if (options?.openInNewTab || !existing) {
      const restored: ApiRequest = normalizeApiRequest({
        id: uid(),
        workspaceId: workspace.id,
        collectionId: snapshot.collectionId,
        folderId: null,
        position: getNextRequestPosition(get().requests, snapshot.collectionId, null),
        name: options?.openInNewTab ? `${snapshot.requestName} · restored` : snapshot.requestName,
        method: snapshot.method,
        url: snapshot.url,
        headers: snapshot.headers.map((header) => ({ ...header, id: uid() })),
        queryParams: snapshot.queryParams.map((param) => ({ ...param, id: uid() })),
        body: snapshot.body,
        bodyType: snapshot.bodyType,
        bodyDrafts: cloneBodyDrafts(snapshot.bodyDrafts),
        auth: { ...snapshot.auth },
        favorite: false,
        createdAt: now,
        updatedAt: now,
      });
      await db.requests.add(restored);
      set((s) => ({ requests: [...s.requests, restored] }));
      targetRequestId = restored.id;
      const tab = { id: uid(), requestId: restored.id };
      set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
    } else {
      const confirmed = window.confirm(
        `Restore this snapshot into "${existing.name}"? Its current contents will be overwritten.`,
      );
      if (!confirmed) return;

      const nextCollectionId = snapshot.collectionId;
      const collectionChanged = existing.collectionId !== nextCollectionId;
      const patch = {
        collectionId: nextCollectionId,
        // Only reset folderId when the collection actually changes — the snapshot carries no
        // folder info, and a same-collection restore shouldn't silently relocate the request
        // out of whatever folder it's currently filed in.
        ...(collectionChanged
          ? {
              folderId: null,
              position: getNextRequestPosition(
                get().requests.filter((request) => request.id !== existing.id),
                nextCollectionId,
                null,
              ),
            }
          : {}),
        name: snapshot.requestName,
        method: snapshot.method,
        url: snapshot.url,
        headers: snapshot.headers.map((header) => ({ ...header })),
        queryParams: snapshot.queryParams.map((param) => ({ ...param })),
        body: snapshot.body,
        bodyType: snapshot.bodyType,
        bodyDrafts: cloneBodyDrafts(snapshot.bodyDrafts),
        auth: { ...snapshot.auth },
      } satisfies Partial<ApiRequest>;
      await get().updateRequest(existing.id, patch);
      get().openRequest(existing.id);
      targetRequestId = existing.id;
    }

    persistSession(get);
    if (options?.rerun && targetRequestId) {
      get().requestSend();
    }
  },

  toggleHistoryFavorite: async (historyId) => {
    const entry = get().history.find((item) => item.id === historyId);
    if (!entry) return;
    const favorite = !entry.favorite;
    await db.history.update(historyId, { favorite });
    set((s) => ({
      history: s.history.map((item) => (item.id === historyId ? { ...item, favorite } : item)),
    }));
  },

  toggleHistoryPinned: async (historyId) => {
    const entry = get().history.find((item) => item.id === historyId);
    if (!entry) return;
    const pinned = !entry.pinned;
    await db.history.update(historyId, { pinned });
    set((s) => ({
      history: s.history.map((item) => (item.id === historyId ? { ...item, pinned } : item)),
    }));
  },

  deleteHistoryEntry: async (historyId) => {
    await db.history.delete(historyId);
    set((s) => ({ history: s.history.filter((item) => item.id !== historyId) }));
  },

  clearHistory: async () => {
    const workspace = get().workspace;
    if (!workspace) return;
    const ids = await db.history.where("workspaceId").equals(workspace.id).primaryKeys();
    await db.history.bulkDelete(ids as string[]);
    set({ history: [] });
  },

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
    return req;
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
    const newCol: Collection = {
      id: uid(),
      workspaceId: ws.id,
      name: parsed.collection.name || "Imported",
      position,
      createdAt: Date.now(),
    };
    const now = Date.now();

    const srcFolders = parsed.folders ?? [];
    const folderIdMap = new Map<string, string>();
    srcFolders.forEach((folder) => folderIdMap.set(folder.id, uid()));
    const newFolders: Folder[] = srcFolders.map((folder) => ({
      id: folderIdMap.get(folder.id)!,
      workspaceId: ws.id,
      collectionId: newCol.id,
      parentFolderId: folder.parentFolderId
        ? (folderIdMap.get(folder.parentFolderId) ?? null)
        : null,
      name: folder.name,
      position: folder.position ?? 0,
      createdAt: folder.createdAt ?? now,
    }));

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

    const result = parsePostmanCollection(parsed, ws.id);
    const position = getNextCollectionPosition(get().collections);
    const newCol: Collection = {
      id: uid(),
      workspaceId: ws.id,
      name: result.collectionName,
      position,
      createdAt: Date.now(),
    };
    const newFolders: Folder[] = result.folders.map((folder) => ({
      ...folder,
      workspaceId: ws.id,
      collectionId: newCol.id,
    }));
    const newReqs: ApiRequest[] = result.requests.map((request) => ({
      ...request,
      workspaceId: ws.id,
      collectionId: newCol.id,
    }));

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

    if (result.warnings.length) {
      toast.warning(`Imported with ${result.warnings.length} note(s)`, {
        description: result.warnings.slice(0, 3).join(" · "),
      });
    }
    return newCol;
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
      createdAt: parsed.workspace.createdAt ?? now,
      updatedAt: now,
    };

    const collectionIdMap = new Map<string, string>();
    const collections: Collection[] = parsed.collections.map((collection, index) => {
      const id = uid();
      collectionIdMap.set(collection.id, id);
      return {
        ...collection,
        id,
        workspaceId,
        position: index,
        createdAt: collection.createdAt ?? now,
      };
    });

    const srcFolders = parsed.folders ?? [];
    const folderIdMap = new Map<string, string>();
    srcFolders.forEach((folder) => folderIdMap.set(folder.id, uid()));
    const folders: Folder[] = srcFolders.map((folder) => ({
      ...folder,
      id: folderIdMap.get(folder.id)!,
      workspaceId,
      collectionId: collectionIdMap.get(folder.collectionId) ?? folder.collectionId,
      parentFolderId: folder.parentFolderId
        ? (folderIdMap.get(folder.parentFolderId) ?? null)
        : null,
      createdAt: folder.createdAt ?? now,
    }));

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
      .sort((left, right) => right.executedAt - left.executedAt);

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
  },

  toggleSidebar: () => {
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed }));
    persistSession(get);
  },

  setSidebarWidth: (px) => {
    set({ sidebarWidth: Math.min(480, Math.max(220, Math.round(px))) });
    persistSession(get);
  },

  setSidebarTreeOpen: (section, open) => {
    set((state) => ({
      sidebarTree:
        section === "favorites" || section === "unfiled"
          ? { ...state.sidebarTree, [section]: open }
          : {
              ...state.sidebarTree,
              collections: { ...state.sidebarTree.collections, [section]: open },
            },
    }));
    persistSession(get);
  },
}));

// Re-export so consumers can `import { pickFile }` cleanly
export { pickFile };

function persistSession(get: () => State) {
  const { tabs, activeTabId, activeEnvId, sidebarCollapsed, sidebarWidth, sidebarTree } = get();
  try {
    localStorage.setItem(
      "reqlo:session",
      JSON.stringify({
        tabs,
        activeTabId,
        activeEnvId,
        sidebarCollapsed,
        sidebarWidth,
        sidebarTree,
      }),
    );
  } catch {
    // Ignore storage write failures in private mode or quota-constrained environments.
  }
}

function setSidebarTreeDefaults(value?: SidebarTreeState | null): SidebarTreeState {
  return {
    collections: value?.collections ?? {},
    favorites: value?.favorites ?? true,
    unfiled: value?.unfiled ?? true,
  };
}

function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "reqlo"
  );
}

function suggestEnvironmentName(existingNames: string[]) {
  const taken = new Set(existingNames.map((name) => name.toLowerCase()));
  let index = 1;
  let candidate = "Environment";

  while (taken.has(candidate.toLowerCase())) {
    index += 1;
    candidate = `Environment ${index}`;
  }

  return candidate;
}

function suggestCopyName(name: string, existingNames: string[]) {
  const base = name.trim() || "Environment";
  const taken = new Set(existingNames.map((item) => item.toLowerCase()));
  let candidate = `${base} (copy)`;
  let index = 2;

  while (taken.has(candidate.toLowerCase())) {
    candidate = `${base} (copy ${index})`;
    index += 1;
  }

  return candidate;
}

async function reportDbWriteFailure<T>(write: Promise<T>): Promise<T> {
  try {
    return await write;
  } catch (error) {
    console.error(error);
    toast.error("Change not saved", {
      description:
        "The last change couldn't be written to local storage. It may be lost on reload.",
    });
    throw error;
  }
}

function getNextRequestPosition(
  requests: ApiRequest[],
  collectionId: string | null,
  folderId: string | null,
) {
  const siblings = requests.filter(
    (request) => request.collectionId === collectionId && request.folderId === folderId,
  );
  if (!siblings.length) return 0;
  return Math.max(...siblings.map((request) => request.position ?? 0)) + 1;
}

function getNextCollectionPosition(collections: Collection[]) {
  if (!collections.length) return 0;
  return Math.max(...collections.map((collection) => collection.position ?? 0)) + 1;
}

function getNextFolderPosition(
  folders: Folder[],
  collectionId: string,
  parentFolderId: string | null,
) {
  const siblings = folders.filter(
    (folder) => folder.collectionId === collectionId && folder.parentFolderId === parentFolderId,
  );
  if (!siblings.length) return 0;
  return Math.max(...siblings.map((folder) => folder.position ?? 0)) + 1;
}

function collectDescendantFolderIds(folders: Folder[], rootId: string): string[] {
  const children = folders.filter((folder) => folder.parentFolderId === rootId);
  return children.flatMap((child) => [child.id, ...collectDescendantFolderIds(folders, child.id)]);
}

/** Would moving `folderId` under `newParentFolderId` create a cycle (moving a folder into
 * itself or one of its own descendants)? The sole safety enforcement for folder moves — UI
 * drag state can be bypassed, so this must be checked in the store action itself. */
function wouldCreateCycle(
  folders: Folder[],
  folderId: string,
  newParentFolderId: string | null,
): boolean {
  if (newParentFolderId === null) return false;
  if (newParentFolderId === folderId) return true;
  const seen = new Set<string>();
  let cur = folders.find((folder) => folder.id === newParentFolderId);
  while (cur) {
    if (cur.id === folderId || seen.has(cur.id)) return true;
    seen.add(cur.id);
    const parentId: string | null = cur.parentFolderId;
    cur = parentId ? folders.find((folder) => folder.id === parentId) : undefined;
  }
  return false;
}

function sortRequestsForCollection(requests: ApiRequest[]) {
  return [...requests].sort(compareRequestsByPosition);
}

function resequenceRequests(requests: ApiRequest[]) {
  return sortRequestsForCollection(requests).map((request, index) => ({
    ...request,
    position: index,
  }));
}

function compareRequestsByPosition(left: ApiRequest, right: ApiRequest) {
  return left.position - right.position || left.createdAt - right.createdAt;
}

function reorderByIndex<T>(items: T[], from: number, to: number) {
  const next = items.slice();
  const [dragged] = next.splice(from, 1);
  if (!dragged) return items;
  next.splice(to, 0, dragged);
  return next;
}

function remapKvIds<T extends { id: string }>(list: T[]) {
  return list.map((item) => ({ ...item, id: uid() }));
}

function remapBodyDraftIds(
  drafts?: ApiRequest["bodyDrafts"] | HistoryEntry["snapshot"]["bodyDrafts"],
) {
  const next = cloneBodyDrafts(drafts ?? createDefaultBodyDrafts());
  return {
    ...next,
    formData: next.formData.map((row) => ({
      ...row,
      id: uid(),
      files: row.files.map((file) => ({ ...file, id: uid() })),
    })),
    urlEncoded: next.urlEncoded.map((row) => ({ ...row, id: uid() })),
    binary: {
      file: next.binary.file ? { ...next.binary.file, id: uid() } : null,
    },
  };
}

function resetPersistedSession() {
  try {
    localStorage.removeItem("reqlo:session");
  } catch {
    // Ignore storage failures during destructive restore.
  }
}
