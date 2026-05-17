import { create } from "zustand";
import {
  db, uid,
  type ApiRequest, type Collection, type HistoryEntry, type Workspace, type HttpMethod,
  type Environment,
  ensureSeed,
} from "@/services/db";
import { parseCurl } from "@/services/curl";
import {
  exportCollection as buildCollectionExport,
  exportWorkspace as buildWorkspaceExport,
  downloadJSON, pickFile, validateCollectionExport,
} from "@/services/portability";

interface Tab { id: string; requestId: string; dirty: boolean }

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

  // import / export
  importCurl: (text: string) => Promise<ApiRequest | null>;
  importCollectionJSON: (text: string) => Promise<Collection | null>;
  exportCollectionById: (id: string) => Promise<void>;
  exportActiveWorkspace: () => Promise<void>;

  // view
  toggleSidebar: () => void;
}

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
  overlays: { palette: false, "import-curl": false, settings: false, history: false, ai: false, "env-switcher": false },
  sidebarCollapsed: false,
  sendPing: 0,

  init: async () => {
    const ws = await ensureSeed();
    const [collections, requests, history, environments] = await Promise.all([
      db.collections.where("workspaceId").equals(ws.id).toArray(),
      db.requests.where("workspaceId").equals(ws.id).toArray(),
      db.history.where("workspaceId").equals(ws.id).reverse().sortBy("executedAt"),
      db.environments.where("workspaceId").equals(ws.id).toArray(),
    ]);
    collections.sort((a, b) => a.position - b.position);
    requests.sort((a, b) => a.createdAt - b.createdAt);

    let tabs: Tab[] = [];
    let activeTabId: string | null = null;
    let activeEnvId: string | null = environments[0]?.id ?? null;
    let sidebarCollapsed = false;
    try {
      const raw = localStorage.getItem("reqlo:session");
      if (raw) {
        const parsed = JSON.parse(raw) as { tabs: Tab[]; activeTabId: string | null; activeEnvId?: string | null; sidebarCollapsed?: boolean };
        const validIds = new Set(requests.map(r => r.id));
        tabs = (parsed.tabs ?? []).filter(t => validIds.has(t.requestId));
        activeTabId = parsed.activeTabId && tabs.find(t => t.id === parsed.activeTabId) ? parsed.activeTabId : tabs[0]?.id ?? null;
        if (parsed.activeEnvId && environments.find(e => e.id === parsed.activeEnvId)) activeEnvId = parsed.activeEnvId;
        sidebarCollapsed = !!parsed.sidebarCollapsed;
      }
    } catch {}

    if (tabs.length === 0 && requests[0]) {
      const t: Tab = { id: uid(), requestId: requests[0].id, dirty: false };
      tabs = [t];
      activeTabId = t.id;
    }

    set({ ready: true, workspace: ws, collections, requests, history, environments, activeEnvId, tabs, activeTabId, sidebarCollapsed });
  },

  openOverlay: (k) => set(s => ({ overlays: { ...s.overlays, [k]: true } })),
  closeOverlay: (k) => set(s => ({ overlays: { ...s.overlays, [k]: false } })),
  toggleOverlay: (k) => set(s => ({ overlays: { ...s.overlays, [k]: !s.overlays[k] } })),
  setPalette: (open) => set(s => ({ overlays: { ...s.overlays, palette: open } })),

  openRequest: (requestId) => {
    const existing = get().tabs.find(t => t.requestId === requestId);
    if (existing) {
      set({ activeTabId: existing.id });
    } else {
      const t: Tab = { id: uid(), requestId, dirty: false };
      set(s => ({ tabs: [...s.tabs, t], activeTabId: t.id }));
    }
    persistSession(get);
  },

  closeTab: (tabId) => {
    const { tabs, activeTabId } = get();
    const idx = tabs.findIndex(t => t.id === tabId);
    if (idx === -1) return;
    const next = tabs.filter(t => t.id !== tabId);
    let nextActive = activeTabId;
    if (activeTabId === tabId) nextActive = next[Math.max(0, idx - 1)]?.id ?? null;
    set({ tabs: next, activeTabId: nextActive });
    persistSession(get);
  },

  setActiveTab: (tabId) => { set({ activeTabId: tabId }); persistSession(get); },

  markDirty: (requestId, dirty) => {
    set(s => ({ tabs: s.tabs.map(t => t.requestId === requestId ? { ...t, dirty } : t) }));
  },

  getActiveRequest: () => {
    const { tabs, activeTabId, requests } = get();
    const t = tabs.find(x => x.id === activeTabId);
    return t ? requests.find(r => r.id === t.requestId) ?? null : null;
  },

  updateRequest: async (id, patch) => {
    const updatedAt = Date.now();
    set(s => ({ requests: s.requests.map(r => r.id === id ? { ...r, ...patch, updatedAt } : r) }));
    await db.requests.update(id, { ...patch, updatedAt });
  },

  createRequest: async (collectionId) => {
    const ws = get().workspace!;
    const now = Date.now();
    const req: ApiRequest = {
      id: uid(), workspaceId: ws.id, collectionId,
      name: "Untitled request", method: "GET" as HttpMethod, url: "",
      headers: [], queryParams: [], body: "", bodyType: "none",
      createdAt: now, updatedAt: now,
    };
    await db.requests.add(req);
    set(s => ({ requests: [...s.requests, req] }));
    get().openRequest(req.id);
    return req;
  },

  deleteRequest: async (id) => {
    await db.requests.delete(id);
    set(s => ({
      requests: s.requests.filter(r => r.id !== id),
      tabs: s.tabs.filter(t => t.requestId !== id),
    }));
    const { tabs, activeTabId } = get();
    if (activeTabId && !tabs.find(t => t.id === activeTabId)) {
      set({ activeTabId: tabs[0]?.id ?? null });
    }
    persistSession(get);
  },

  renameRequest: async (id, name) => { await get().updateRequest(id, { name }); },

  duplicateRequest: async (id) => {
    const src = get().requests.find(r => r.id === id);
    if (!src) return null;
    const now = Date.now();
    const copy: ApiRequest = {
      ...src,
      id: uid(),
      name: `${src.name} (copy)`,
      headers: src.headers.map(h => ({ ...h, id: uid() })),
      queryParams: src.queryParams.map(p => ({ ...p, id: uid() })),
      createdAt: now, updatedAt: now,
    };
    await db.requests.add(copy);
    set(s => ({ requests: [...s.requests, copy] }));
    get().openRequest(copy.id);
    return copy;
  },

  toggleFavorite: async (id) => {
    const r = get().requests.find(x => x.id === id);
    if (!r) return;
    await get().updateRequest(id, { favorite: !r.favorite });
  },

  requestSend: () => set({ sendPing: Date.now() }),

  createCollection: async (name) => {
    const ws = get().workspace!;
    const position = get().collections.length;
    const col: Collection = { id: uid(), workspaceId: ws.id, name, position, createdAt: Date.now() };
    await db.collections.add(col);
    set(s => ({ collections: [...s.collections, col] }));
    return col;
  },

  duplicateCollection: async (id) => {
    const src = get().collections.find(c => c.id === id);
    if (!src) return null;
    const ws = get().workspace!;
    const position = get().collections.length;
    const copy: Collection = { id: uid(), workspaceId: ws.id, name: `${src.name} (copy)`, position, createdAt: Date.now() };
    await db.collections.add(copy);
    const srcReqs = get().requests.filter(r => r.collectionId === id);
    const now = Date.now();
    const copies: ApiRequest[] = srcReqs.map(r => ({
      ...r, id: uid(), collectionId: copy.id,
      headers: r.headers.map(h => ({ ...h, id: uid() })),
      queryParams: r.queryParams.map(p => ({ ...p, id: uid() })),
      createdAt: now, updatedAt: now,
    }));
    if (copies.length) await db.requests.bulkAdd(copies);
    set(s => ({ collections: [...s.collections, copy], requests: [...s.requests, ...copies] }));
    return copy;
  },

  deleteCollection: async (id) => {
    const reqs = get().requests.filter(r => r.collectionId === id);
    await db.transaction("rw", db.collections, db.requests, async () => {
      await db.requests.bulkDelete(reqs.map(r => r.id));
      await db.collections.delete(id);
    });
    set(s => ({
      collections: s.collections.filter(c => c.id !== id),
      requests: s.requests.filter(r => r.collectionId !== id),
      tabs: s.tabs.filter(t => !reqs.find(r => r.id === t.requestId)),
    }));
    persistSession(get);
  },

  createEnvironment: async (name) => {
    const ws = get().workspace!;
    const env: Environment = { id: uid(), workspaceId: ws.id, name, variables: [], createdAt: Date.now() };
    await db.environments.add(env);
    set(s => ({ environments: [...s.environments, env], activeEnvId: s.activeEnvId ?? env.id }));
    persistSession(get);
    return env;
  },

  setActiveEnv: (id) => { set({ activeEnvId: id }); persistSession(get); },

  addHistory: async (entry) => {
    await db.history.add(entry);
    set(s => ({ history: [entry, ...s.history].slice(0, 200) }));
  },

  importCurl: async (text) => {
    const ws = get().workspace;
    if (!ws) return null;
    const colId = get().collections[0]?.id ?? null;
    const req = parseCurl(text, ws.id, colId);
    if (!req.url) return null;
    await db.requests.add(req);
    set(s => ({ requests: [...s.requests, req] }));
    get().openRequest(req.id);
    return req;
  },

  importCollectionJSON: async (text) => {
    const ws = get().workspace;
    if (!ws) return null;
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { return null; }
    if (!validateCollectionExport(parsed)) return null;

    const position = get().collections.length;
    const newCol: Collection = {
      id: uid(), workspaceId: ws.id,
      name: parsed.collection.name || "Imported",
      position, createdAt: Date.now(),
    };
    const now = Date.now();
    const newReqs: ApiRequest[] = parsed.requests.map(r => ({
      ...r,
      id: uid(), workspaceId: ws.id, collectionId: newCol.id,
      headers: (r.headers ?? []).map(h => ({ ...h, id: uid() })),
      queryParams: (r.queryParams ?? []).map(p => ({ ...p, id: uid() })),
      createdAt: now, updatedAt: now,
    }));
    await db.transaction("rw", db.collections, db.requests, async () => {
      await db.collections.add(newCol);
      if (newReqs.length) await db.requests.bulkAdd(newReqs);
    });
    set(s => ({ collections: [...s.collections, newCol], requests: [...s.requests, ...newReqs] }));
    return newCol;
  },

  exportCollectionById: async (id) => {
    const col = get().collections.find(c => c.id === id);
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

  toggleSidebar: () => { set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })); persistSession(get); },
}));

// Re-export so consumers can `import { pickFile }` cleanly
export { pickFile };

function persistSession(get: () => State) {
  const { tabs, activeTabId, activeEnvId, sidebarCollapsed } = get();
  try { localStorage.setItem("reqlo:session", JSON.stringify({ tabs, activeTabId, activeEnvId, sidebarCollapsed })); } catch {}
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "reqlo";
}
