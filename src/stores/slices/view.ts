import { DEFAULT_SIDEBAR_TREE, persistSession } from "@/stores/shared";
import type { SidebarTreeState, SliceCreator } from "@/stores/types";

export interface ViewSlice {
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  sidebarTree: SidebarTreeState;

  toggleSidebar: () => void;
  setSidebarWidth: (px: number) => void;
  setSidebarTreeOpen: (section: keyof SidebarTreeState | string, open: boolean) => void;
}

export const createViewSlice: SliceCreator<ViewSlice> = (set, get) => ({
  sidebarCollapsed: false,
  sidebarWidth: 288,
  sidebarTree: { ...DEFAULT_SIDEBAR_TREE, collections: {} },

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
});
