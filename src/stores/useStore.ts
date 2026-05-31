import Dexie from "dexie";
import { create } from "zustand";
import {
  db,
  uid,
  type ApiRequest,
  type Collection,
  type HistoryEntry,
  type Workspace,
  type HttpMethod,
  type Environment,
  createDefaultAuth,
  createDefaultBodyDrafts,
  cloneBodyDrafts,
  ensureSeed,
  normalizeApiRequest,
  normalizeHistoryEntry,
} from "@/services/db";
import { parseCurl } from "@/services/curl";
import {
  exportCollection as buildCollectionExport,
  exportWorkspace as buildWorkspaceExport,
  downloadJSON,
  pickFile,
  validateCollectionExport,
} from "@/services/portability";

interface Tab {
  id: string;
  requestId: string;
  dirty: boolean;
}

export interface SidebarTreeState {
  collections: Record<string, boolean>;
  favorites: boolean;
  unfiled: boolean;
}

export type OverlayKey = "palette" | "import-curl" | "settings" | "history" | "ai" | "env-switcher";

interface State {
  ready: boolean;
  workspace: Workspace | null;
  collections: Collection[];
  requests: ApiRequest[];
  history: HistoryEntry[];
  environments: Environment[];
  activeEnvId: string | null;

  tabs: Tab[];
  activeTabId: string | null;

  overlays: Record<OverlayKey, boolean>;
  sidebarCollapsed: boolean;
  sidebarTree: SidebarTreeState;

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
  markDirty: (requestId: string, dirty: boolean) => void;
  getActiveRequest: () => ApiRequest | null;

  // requests
  updateRequest: (id: string, patch: Partial<ApiRequest>) => Promise<void>;
  createRequest: (collectionId: string | null) => Promise<ApiRequest>;
  deleteRequest: (id: string) => Promise<void>;
  renameRequest: (id: string, name: string) => Promise<void>;
  duplicateRequest: (id: string) => Promise<ApiRequest | null>;
  toggleFavorite: (id: string) => Promise<void>;
  requestSend: () => void; // bumps sendPing; Workspace listens

  // collections
  createCollection: (name: string) => Promise<Collection>;
  duplicateCollection: (id: string) => Promise<Collection | null>;
  deleteCollection: (id: string) => Promise<void>;

  // environments
  createEnvironment: (name: string) => Promise<Environment>;
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
  exportCollectionById: (id: string) => Promise<void>;
  exportActiveWorkspace: () => Promise<void>;

  // view
  toggleSidebar: () => void;
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
    ai: false,
    "env-switcher": false,
  },
  sidebarCollapsed: false,
  sidebarTree: { ...DEFAULT_SIDEBAR_TREE, collections: {} },
  sendPing: 0,

  init: async () => {
    const ws = await ensureSeed();
    const [collections, requests, history, environments] = await Promise.all([
      db.collections.where("workspaceId").equals(ws.id).toArray(),
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
    collections.sort((a, b) => a.position - b.position);
    requests.sort((a, b) => a.createdAt - b.createdAt);

    let tabs: Tab[] = [];
    let activeTabId: string | null = null;
    let activeEnvId: string | null = environments[0]?.id ?? null;
    let sidebarCollapsed = false;
    let sidebarTree = { ...DEFAULT_SIDEBAR_TREE, collections: {} };
    try {
      const raw = localStorage.getItem("reqlo:session");
      if (raw) {
        const parsed = JSON.parse(raw) as {
          tabs: Tab[];
          activeTabId: string | null;
          activeEnvId?: string | null;
          sidebarCollapsed?: boolean;
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
        sidebarTree = setSidebarTreeDefaults(parsed.sidebarTree);
      }
    } catch {
      // Ignore invalid persisted session state and fall back to defaults.
    }

    if (tabs.length === 0 && requests[0]) {
      const t: Tab = { id: uid(), requestId: requests[0].id, dirty: false };
      tabs = [t];
      activeTabId = t.id;
    }

    set({
      ready: true,
      workspace: ws,
      collections,
      requests,
      history,
      environments,
      activeEnvId,
      tabs,
      activeTabId,
      sidebarCollapsed,
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
      const t: Tab = { id: uid(), requestId, dirty: false };
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

  markDirty: (requestId, dirty) => {
    set((s) => ({ tabs: s.tabs.map((t) => (t.requestId === requestId ? { ...t, dirty } : t)) }));
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
    await db.requests.update(id, { ...patch, updatedAt });
  },

  createRequest: async (collectionId) => {
    const ws = get().workspace!;
    const now = Date.now();
    const req: ApiRequest = {
      id: uid(),
      workspaceId: ws.id,
      collectionId,
      name: "Untitled request",
      method: "GET" as HttpMethod,
      url: "",
      headers: [],
      queryParams: [],
      body: "",
      bodyType: "none",
      bodyDrafts: createDefaultBodyDrafts(),
      auth: createDefaultAuth(),
      createdAt: now,
      updatedAt: now,
    };
    await db.requests.add(req);
    set((s) => ({ requests: [...s.requests, req] }));
    get().openRequest(req.id);
    return req;
  },

  deleteRequest: async (id) => {
    await db.requests.delete(id);
    set((s) => {
      const nextTabs = s.tabs.filter((t) => t.requestId !== id);
      const activeTabStillExists = !!nextTabs.find((tab) => tab.id === s.activeTabId);
      return {
        requests: s.requests.filter((r) => r.id !== id),
        tabs: nextTabs,
        activeTabId: activeTabStillExists ? s.activeTabId : (nextTabs[0]?.id ?? null),
      };
    });
    persistSession(get);
  },

  renameRequest: async (id, name) => {
    await get().updateRequest(id, { name });
  },

  duplicateRequest: async (id) => {
    const src = get().requests.find((r) => r.id === id);
    if (!src) return null;
    const now = Date.now();
    const copy: ApiRequest = {
      ...src,
      id: uid(),
      name: `${src.name} (copy)`,
      headers: src.headers.map((h) => ({ ...h, id: uid() })),
      queryParams: src.queryParams.map((p) => ({ ...p, id: uid() })),
      bodyDrafts: cloneBodyDrafts(src.bodyDrafts),
      auth: { ...src.auth },
      createdAt: now,
      updatedAt: now,
    };
    await db.requests.add(copy);
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
    const position = get().collections.length;
    const col: Collection = {
      id: uid(),
      workspaceId: ws.id,
      name,
      position,
      createdAt: Date.now(),
    };
    await db.collections.add(col);
    set((s) => ({ collections: [...s.collections, col] }));
    return col;
  },

  duplicateCollection: async (id) => {
    const src = get().collections.find((c) => c.id === id);
    if (!src) return null;
    const ws = get().workspace!;
    const position = get().collections.length;
    const copy: Collection = {
      id: uid(),
      workspaceId: ws.id,
      name: `${src.name} (copy)`,
      position,
      createdAt: Date.now(),
    };
    await db.collections.add(copy);
    const srcReqs = get().requests.filter((r) => r.collectionId === id);
    const now = Date.now();
    const copies: ApiRequest[] = srcReqs.map((r) => ({
      ...r,
      id: uid(),
      collectionId: copy.id,
      headers: r.headers.map((h) => ({ ...h, id: uid() })),
      queryParams: r.queryParams.map((p) => ({ ...p, id: uid() })),
      bodyDrafts: cloneBodyDrafts(r.bodyDrafts),
      auth: { ...r.auth },
      createdAt: now,
      updatedAt: now,
    }));
    if (copies.length) await db.requests.bulkAdd(copies);
    set((s) => ({ collections: [...s.collections, copy], requests: [...s.requests, ...copies] }));
    return copy;
  },

  deleteCollection: async (id) => {
    const reqs = get().requests.filter((r) => r.collectionId === id);
    await db.transaction("rw", db.collections, db.requests, async () => {
      await db.requests.bulkDelete(reqs.map((r) => r.id));
      await db.collections.delete(id);
    });
    set((s) => ({
      collections: s.collections.filter((c) => c.id !== id),
      requests: s.requests.filter((r) => r.collectionId !== id),
      tabs: s.tabs.filter((t) => !reqs.find((r) => r.id === t.requestId)),
    }));
    persistSession(get);
  },

  createEnvironment: async (name) => {
    const ws = get().workspace!;
    const env: Environment = {
      id: uid(),
      workspaceId: ws.id,
      name,
      variables: [],
      createdAt: Date.now(),
    };
    await db.environments.add(env);
    set((s) => ({ environments: [...s.environments, env], activeEnvId: s.activeEnvId ?? env.id }));
    persistSession(get);
    return env;
  },

  setActiveEnv: (id) => {
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
    let targetRequestId: string | null = existing?.id ?? null;

    if (options?.openInNewTab || !existing) {
      const restored: ApiRequest = normalizeApiRequest({
        id: uid(),
        workspaceId: workspace.id,
        collectionId: snapshot.collectionId,
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
      const tab = { id: uid(), requestId: restored.id, dirty: false };
      set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
    } else {
      const patch = {
        collectionId: snapshot.collectionId,
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
    const colId = get().collections[0]?.id ?? null;
    const req = parseCurl(text, ws.id, colId);
    if (!req.url) return null;
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

    const position = get().collections.length;
    const newCol: Collection = {
      id: uid(),
      workspaceId: ws.id,
      name: parsed.collection.name || "Imported",
      position,
      createdAt: Date.now(),
    };
    const now = Date.now();
    const newReqs: ApiRequest[] = parsed.requests.map((r) =>
      normalizeApiRequest({
        ...r,
        id: uid(),
        workspaceId: ws.id,
        collectionId: newCol.id,
        headers: (r.headers ?? []).map((h) => ({ ...h, id: uid() })),
        queryParams: (r.queryParams ?? []).map((p) => ({ ...p, id: uid() })),
        createdAt: now,
        updatedAt: now,
      }),
    );
    await db.transaction("rw", db.collections, db.requests, async () => {
      await db.collections.add(newCol);
      if (newReqs.length) await db.requests.bulkAdd(newReqs);
    });
    set((s) => ({
      collections: [...s.collections, newCol],
      requests: [...s.requests, ...newReqs],
    }));
    return newCol;
  },

  exportCollectionById: async (id) => {
    const col = get().collections.find((c) => c.id === id);
    if (!col) return;
    const data = await buildCollectionExport(col);
    downloadJSON(data, `${slugify(col.name)}.reqlo.json`);
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
  const { tabs, activeTabId, activeEnvId, sidebarCollapsed, sidebarTree } = get();
  try {
    localStorage.setItem(
      "reqlo:session",
      JSON.stringify({ tabs, activeTabId, activeEnvId, sidebarCollapsed, sidebarTree }),
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
