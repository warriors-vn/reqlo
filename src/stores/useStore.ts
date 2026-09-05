// The app's single Zustand store, composed from the slices under ./slices.
// Each slice owns one section of what used to be a 1,779-line file; they share
// one `set`/`get` pair, so any slice can still call any other slice's action
// through `get()` exactly as before. This module stays the only import path
// components and tests use — everything the old file exported is re-exported
// here so the public surface is unchanged.

import { create } from "zustand";
import { pickFile } from "@/services/portability";

import { createCoreSlice } from "@/stores/slices/core";
import { createOverlaysSlice } from "@/stores/slices/overlays";
import { createDialogsSlice } from "@/stores/slices/dialogs";
import { createRunnerSlice } from "@/stores/slices/runner";
import { createTabsSlice } from "@/stores/slices/tabs";
import { createRequestsSlice } from "@/stores/slices/requests";
import { createCollectionsSlice } from "@/stores/slices/collections";
import { createFoldersSlice } from "@/stores/slices/folders";
import { createEnvironmentsSlice } from "@/stores/slices/environments";
import { createHistorySlice } from "@/stores/slices/history";
import { createImportExportSlice } from "@/stores/slices/importExport";
import { createViewSlice } from "@/stores/slices/view";
import type { Store } from "@/stores/types";

export const useStore = create<Store>((...args) => ({
  ...createCoreSlice(...args),
  ...createOverlaysSlice(...args),
  ...createDialogsSlice(...args),
  ...createRunnerSlice(...args),
  ...createTabsSlice(...args),
  ...createRequestsSlice(...args),
  ...createCollectionsSlice(...args),
  ...createFoldersSlice(...args),
  ...createEnvironmentsSlice(...args),
  ...createHistorySlice(...args),
  ...createImportExportSlice(...args),
  ...createViewSlice(...args),
}));

// Re-export so consumers can `import { pickFile }` cleanly
export { pickFile };

// Exported only so tests can exercise the history paging/pruning mechanism at
// a small scale — see their definitions in ./shared.
export { loadRecentHistory, pruneHistoryToLimit } from "@/stores/shared";

export type {
  ConfirmRequest,
  GraphQLSchemaState,
  OverlayKey,
  PromptRequest,
  SidebarSelection,
  SidebarTreeState,
  Store,
} from "@/stores/types";
