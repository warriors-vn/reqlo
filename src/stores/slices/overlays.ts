import type { DefaultsTarget, OverlayKey, SliceCreator } from "@/stores/types";

export interface OverlaysSlice {
  overlays: Record<OverlayKey, boolean>;
  /** Set alongside the "collection-settings" overlay — which node's defaults
   * the modal is editing. Cleared when it closes so a stale id can't be
   * rendered against a collection that has since been deleted. */
  defaultsTarget: DefaultsTarget | null;

  openOverlay: (k: OverlayKey) => void;
  openDefaultsEditor: (target: DefaultsTarget) => void;
  closeOverlay: (k: OverlayKey) => void;
  toggleOverlay: (k: OverlayKey) => void;
  setPalette: (open: boolean) => void; // legacy alias
}

export const createOverlaysSlice: SliceCreator<OverlaysSlice> = (set) => ({
  overlays: {
    palette: false,
    "import-curl": false,
    settings: false,
    history: false,
    "env-switcher": false,
    shortcuts: false,
    runner: false,
    "collection-settings": false,
  },
  defaultsTarget: null,

  openOverlay: (k) => set((s) => ({ overlays: { ...s.overlays, [k]: true } })),
  openDefaultsEditor: (target) =>
    set((s) => ({
      defaultsTarget: target,
      overlays: { ...s.overlays, "collection-settings": true },
    })),
  closeOverlay: (k) =>
    set((s) => ({
      overlays: { ...s.overlays, [k]: false },
      ...(k === "collection-settings" ? { defaultsTarget: null } : {}),
    })),
  toggleOverlay: (k) => set((s) => ({ overlays: { ...s.overlays, [k]: !s.overlays[k] } })),
  setPalette: (open) => set((s) => ({ overlays: { ...s.overlays, palette: open } })),
});
