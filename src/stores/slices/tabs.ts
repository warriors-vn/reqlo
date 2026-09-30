import { uid, type ApiRequest } from "@/services/db";
import { persistSession } from "@/stores/shared";
import type { SidebarSelection, SliceCreator, Tab } from "@/stores/types";

export interface TabsSlice {
  tabs: Tab[];
  activeTabId: string | null;
  sidebarSelection: SidebarSelection | null;

  openRequest: (requestId: string) => void;
  closeTab: (tabId: string) => void;
  closeOtherTabs: (tabId: string) => void;
  closeTabsToRight: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  activateAdjacentTab: (direction: "next" | "prev") => void;
  reorderTabs: (draggedId: string, targetId: string) => void;
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

  closeOtherTabs: (tabId) => {
    const { tabs } = get();
    if (!tabs.some((t) => t.id === tabId)) return;
    set({ tabs: tabs.filter((t) => t.id === tabId), activeTabId: tabId });
    persistSession(get);
  },

  closeTabsToRight: (tabId) => {
    const { tabs, activeTabId } = get();
    const idx = tabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return;
    const kept = tabs.slice(0, idx + 1);
    const nextActive = kept.some((t) => t.id === activeTabId) ? activeTabId : tabId;
    set({ tabs: kept, activeTabId: nextActive });
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

  reorderTabs: (draggedId, targetId) => {
    if (draggedId === targetId) return;
    set((s) => {
      const draggedIndex = s.tabs.findIndex((t) => t.id === draggedId);
      if (draggedIndex === -1) return s;
      const next = [...s.tabs];
      const [dragged] = next.splice(draggedIndex, 1);
      const targetIndex = next.findIndex((t) => t.id === targetId);
      if (targetIndex === -1) {
        next.splice(draggedIndex, 0, dragged);
        return s;
      }
      next.splice(targetIndex, 0, dragged);
      return { tabs: next };
    });
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
