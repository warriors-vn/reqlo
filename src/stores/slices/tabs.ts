import { uid, type ApiRequest } from "@/services/db";
import { persistSession } from "@/stores/shared";
import type { SidebarSelection, SliceCreator, Tab } from "@/stores/types";

export interface TabsSlice {
  tabs: Tab[];
  activeTabId: string | null;
  sidebarSelection: SidebarSelection | null;

  openRequest: (requestId: string) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  activateAdjacentTab: (direction: "next" | "prev") => void;
  getActiveRequest: () => ApiRequest | null;
  setSidebarSelection: (selection: SidebarSelection | null) => void;
}

export const createTabsSlice: SliceCreator<TabsSlice> = (set, get) => ({
  tabs: [],
  activeTabId: null,
  sidebarSelection: null,

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
});
