import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { HistoryFilterState } from "@/features/request-history/types";

interface RequestHistoryUiState {
  filters: HistoryFilterState;
  selectedId: string | null;
  setQuery: (query: string) => void;
  setMethod: (method: HistoryFilterState["method"]) => void;
  setStatus: (status: HistoryFilterState["status"]) => void;
  setSelectedId: (id: string | null) => void;
  selectNext: (ids: string[]) => void;
  selectPrevious: (ids: string[]) => void;
  resetFilters: () => void;
}

const defaultFilters: HistoryFilterState = { query: "", method: "ALL", status: "ALL" };

export const useRequestHistoryStore = create<RequestHistoryUiState>()(
  persist(
    (set, get) => ({
      filters: defaultFilters,
      selectedId: null,
      setQuery: (query) => set((state) => ({ filters: { ...state.filters, query } })),
      setMethod: (method) => set((state) => ({ filters: { ...state.filters, method } })),
      setStatus: (status) => set((state) => ({ filters: { ...state.filters, status } })),
      setSelectedId: (selectedId) => set({ selectedId }),
      selectNext: (ids) => {
        if (!ids.length) return;
        const currentIndex = ids.findIndex((id) => id === get().selectedId);
        const nextIndex = currentIndex < 0 ? 0 : Math.min(ids.length - 1, currentIndex + 1);
        set({ selectedId: ids[nextIndex] });
      },
      selectPrevious: (ids) => {
        if (!ids.length) return;
        const currentIndex = ids.findIndex((id) => id === get().selectedId);
        const nextIndex = currentIndex < 0 ? 0 : Math.max(0, currentIndex - 1);
        set({ selectedId: ids[nextIndex] });
      },
      resetFilters: () => set({ filters: defaultFilters }),
    }),
    {
      name: "reqlo:history-ui",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ filters: state.filters }),
    },
  ),
);
