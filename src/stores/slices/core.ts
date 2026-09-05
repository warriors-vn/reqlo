// The store's persistent data — everything init() hydrates from IndexedDB in
// one pass. Actions that mutate these live in the slice that owns the concept
// (requests.ts, collections.ts, …); this slice owns only the fields themselves
// and the single load that fills them.

import {
  db,
  uid,
  ensureSeed,
  normalizeApiRequest,
  requestPersistentStorage,
  type ApiRequest,
  type Collection,
  type Environment,
  type Folder,
  type HistoryEntry,
  type Workspace,
} from "@/services/db";
import {
  DEFAULT_SIDEBAR_TREE,
  HISTORY_RETENTION,
  loadRecentHistory,
  setSidebarTreeDefaults,
} from "@/stores/shared";
import type { GraphQLSchemaState, SidebarTreeState, SliceCreator, Tab } from "@/stores/types";

export interface CoreSlice {
  ready: boolean;
  workspace: Workspace | null;
  collections: Collection[];
  folders: Folder[];
  requests: ApiRequest[];
  history: HistoryEntry[];
  environments: Environment[];
  activeEnvId: string | null;
  graphqlSchemas: Record<string, GraphQLSchemaState>;

  init: () => Promise<void>;
}

export const createCoreSlice: SliceCreator<CoreSlice> = (set) => ({
  ready: false,
  workspace: null,
  collections: [],
  folders: [],
  requests: [],
  history: [],
  environments: [],
  activeEnvId: null,
  graphqlSchemas: {},

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
      loadRecentHistory(ws.id, HISTORY_RETENTION),
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
});
