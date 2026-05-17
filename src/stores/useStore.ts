import { create } from "zustand";
import { db, uid, type ApiRequest, type Collection, type HistoryEntry, type Workspace, type HttpMethod, ensureSeed } from "@/services/db";

interface Tab { id: string; requestId: string; dirty: boolean }

interface State {
  ready: boolean;
  workspace: Workspace | null;
  collections: Collection[];
  requests: ApiRequest[];
  history: HistoryEntry[];

  tabs: Tab[];
  activeTabId: string | null;

  paletteOpen: boolean;

  init: () => Promise<void>;

  openRequest: (requestId: string) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  markDirty: (requestId: string, dirty: boolean) => void;

  updateRequest: (id: string, patch: Partial<ApiRequest>) => Promise<void>;
  createRequest: (collectionId: string | null) => Promise<ApiRequest>;
  deleteRequest: (id: string) => Promise<void>;
  renameRequest: (id: string, name: string) => Promise<void>;

  createCollection: (name: string) => Promise<Collection>;

  setPalette: (open: boolean) => void;

  addHistory: (entry: HistoryEntry) => Promise<void>;
}

export const useStore = create<State>((set, get) => ({
  ready: false,
  workspace: null,
  collections: [],
  requests: [],
  history: [],
  tabs: [],
  activeTabId: null,
  paletteOpen: false,

  init: async () => {
    const ws = await ensureSeed();
    const [collections, requests, history] = await Promise.all([
      db.collections.where("workspaceId").equals(ws.id).toArray(),
      db.requests.where("workspaceId").equals(ws.id).toArray(),
      db.history.where("workspaceId").equals(ws.id).reverse().sortBy("executedAt"),
    ]);
    collections.sort((a, b) => a.position - b.position);
    requests.sort((a, b) => a.createdAt - b.createdAt);

    // Restore session tabs
    let tabs: Tab[] = [];
    let activeTabId: string | null = null;
    try {
      const raw = localStorage.getItem("reqlo:session");
      if (raw) {
        const parsed = JSON.parse(raw) as { tabs: Tab[]; activeTabId: string | null };
        const validIds = new Set(requests.map(r => r.id));
        tabs = (parsed.tabs ?? []).filter(t => validIds.has(t.requestId));
        activeTabId = parsed.activeTabId && tabs.find(t => t.id === parsed.activeTabId) ? parsed.activeTabId : tabs[0]?.id ?? null;
      }
    } catch {}

    if (tabs.length === 0 && requests[0]) {
      const t: Tab = { id: uid(), requestId: requests[0].id, dirty: false };
      tabs = [t];
      activeTabId = t.id;
    }

    set({ ready: true, workspace: ws, collections, requests, history, tabs, activeTabId });
  },

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

  renameRequest: async (id, name) => {
    await get().updateRequest(id, { name });
  },

  createCollection: async (name) => {
    const ws = get().workspace!;
    const position = get().collections.length;
    const col: Collection = { id: uid(), workspaceId: ws.id, name, position, createdAt: Date.now() };
    await db.collections.add(col);
    set(s => ({ collections: [...s.collections, col] }));
    return col;
  },

  setPalette: (open) => set({ paletteOpen: open }),

  addHistory: async (entry) => {
    await db.history.add(entry);
    set(s => ({ history: [entry, ...s.history].slice(0, 200) }));
  },
}));

function persistSession(get: () => State) {
  const { tabs, activeTabId } = get();
  try { localStorage.setItem("reqlo:session", JSON.stringify({ tabs, activeTabId })); } catch {}
}
