import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface RequestBodyPreferencesState {
  wrapLines: boolean;
  fontSize: number;
  showLineNumbers: boolean;
  setWrapLines: (value: boolean) => void;
  setFontSize: (value: number) => void;
  setShowLineNumbers: (value: boolean) => void;
}

export const useRequestBodyStore = create<RequestBodyPreferencesState>()(
  persist(
    (set) => ({
      wrapLines: true,
      fontSize: 12,
      showLineNumbers: true,
      setWrapLines: (value) => set({ wrapLines: value }),
      setFontSize: (value) => set({ fontSize: Math.max(11, Math.min(16, value)) }),
      setShowLineNumbers: (value) => set({ showLineNumbers: value }),
    }),
    {
      name: "reqlo:body-editor-preferences",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
