import { DEFAULT_SIDEBAR_TREE, persistSession } from "@/stores/shared";
import type { SidebarTreeState, SliceCreator } from "@/stores/types";

export interface ViewSlice {
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  sidebarTree: SidebarTreeState;
  requestPanelCollapsed: boolean;

  toggleSidebar: () => void;
  setSidebarWidth: (px: number) => void;
  setSidebarTreeOpen: (section: keyof SidebarTreeState | string, open: boolean) => void;
  toggleRequestPanel: () => void;
  setRequestPanelCollapsed: (collapsed: boolean) => void;
}

export const createViewSlice: SliceCreator<ViewSlice> = (set, get) => ({
  sidebarCollapsed: false,
  sidebarWidth: 288,
  sidebarTree: { ...DEFAULT_SIDEBAR_TREE, collections: {} },
  requestPanelCollapsed: false,

  toggleSidebar: () => {
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed }));
    persistSession(get);
  },

  toggleRequestPanel: () => {
    set((s) => ({ requestPanelCollapsed: !s.requestPanelCollapsed }));
    persistSession(get);
  },

  setRequestPanelCollapsed: (collapsed) => {
    set({ requestPanelCollapsed: collapsed });
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
});
