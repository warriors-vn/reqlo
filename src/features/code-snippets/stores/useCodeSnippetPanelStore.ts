import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { SnippetLanguage } from "@/features/code-snippets/types";

const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 820;

interface CodeSnippetPanelState {
  selectedLanguage: SnippetLanguage;
  panelWidth: number;
  collapsed: boolean;
  wrapLines: boolean;
  fullscreen: boolean;
  setSelectedLanguage: (value: SnippetLanguage) => void;
  setPanelWidth: (value: number) => void;
  setCollapsed: (value: boolean) => void;
  toggleCollapsed: () => void;
  setWrapLines: (value: boolean) => void;
  setFullscreen: (value: boolean) => void;
}

export function clampPanelWidth(value: number) {
  return Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, Math.round(value)));
}

export const useCodeSnippetPanelStore = create<CodeSnippetPanelState>()(
  persist(
    (set) => ({
      selectedLanguage: "curl",
      panelWidth: 420,
      collapsed: false,
      wrapLines: true,
      fullscreen: false,
      setSelectedLanguage: (value) => set({ selectedLanguage: value }),
      setPanelWidth: (value) => set({ panelWidth: clampPanelWidth(value) }),
      setCollapsed: (value) => set({ collapsed: value }),
      toggleCollapsed: () => set((state) => ({ collapsed: !state.collapsed })),
      setWrapLines: (value) => set({ wrapLines: value }),
      setFullscreen: (value) => set({ fullscreen: value }),
    }),
    {
      name: "reqlo:code-snippet-panel",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        selectedLanguage: state.selectedLanguage,
        panelWidth: state.panelWidth,
        collapsed: state.collapsed,
        wrapLines: state.wrapLines,
      }),
    },
  ),
);
