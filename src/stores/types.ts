import type { StateCreator } from "zustand";
import type { IntrospectionQuery } from "graphql";

import type { CoreSlice } from "@/stores/slices/core";
import type { OverlaysSlice } from "@/stores/slices/overlays";
import type { DialogsSlice } from "@/stores/slices/dialogs";
import type { RunnerSlice } from "@/stores/slices/runner";
import type { TabsSlice } from "@/stores/slices/tabs";
import type { RequestsSlice } from "@/stores/slices/requests";
import type { CollectionsSlice } from "@/stores/slices/collections";
import type { FoldersSlice } from "@/stores/slices/folders";
import type { EnvironmentsSlice } from "@/stores/slices/environments";
import type { HistorySlice } from "@/stores/slices/history";
import type { ImportExportSlice } from "@/stores/slices/importExport";
import type { ViewSlice } from "@/stores/slices/view";

export interface Tab {
  id: string;
  requestId: string;
}

export interface SidebarSelection {
  type: "request" | "collection";
  id: string;
}

export interface SidebarTreeState {
  collections: Record<string, boolean>;
  favorites: boolean;
  unfiled: boolean;
}

export type OverlayKey =
  | "palette"
  | "import-curl"
  | "settings"
  | "history"
  | "env-switcher"
  | "shortcuts"
  | "runner"
  | "collection-settings";

/** Which collection or folder the defaults editor is open on. Collections and
 * folders carry the same RequestDefaults shape, so one modal serves both. */
export interface DefaultsTarget {
  type: "collection" | "folder";
  id: string;
}

/** A styled stand-in for window.prompt(), requested imperatively (e.g. from a
 * command with no owning component to hold dialog state) via requestPrompt(). */
export interface PromptRequest {
  title: string;
  defaultValue: string;
  confirmLabel?: string;
}

/** A styled stand-in for window.confirm(), requested imperatively via
 * requestConfirm() — see PromptRequest. */
export interface ConfirmRequest {
  title: string;
  description?: string;
  confirmLabel?: string;
}

// Session-only — never persisted to IndexedDB. A fetched schema is
// derived/disposable data: refetching is cheap, and it would need its own DB
// migration for no real benefit.
export type GraphQLSchemaState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; introspection: IntrospectionQuery; fetchedAt: number }
  | { status: "error"; message: string };

/**
 * The whole store, composed from every slice. Slices import this type (never
 * each other's implementations) so any slice can call any other slice's action
 * through `get()` exactly as it could when this was one file — the split is
 * about where code lives, not about isolating the slices from one another.
 *
 * The import cycle between this file and the slice files is type-only, so it
 * is erased at build time and never becomes a runtime module cycle.
 */
export type Store = CoreSlice &
  OverlaysSlice &
  DialogsSlice &
  RunnerSlice &
  TabsSlice &
  RequestsSlice &
  CollectionsSlice &
  FoldersSlice &
  EnvironmentsSlice &
  HistorySlice &
  ImportExportSlice &
  ViewSlice;

/** Every slice is a plain (no middleware) creator over the composed store. */
export type SliceCreator<T> = StateCreator<Store, [], [], T>;
