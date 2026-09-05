// Constants and helpers shared by more than one store slice. Nothing here
// touches Zustand directly — a slice passes its own `set`/`get` in where a
// helper needs them, so this module has no dependency on the store's identity.

import Dexie from "dexie";
import { toast } from "sonner";
import {
  db,
  uid,
  cloneBodyDrafts,
  createDefaultBodyDrafts,
  createDefaultRequestDefaults,
  normalizeHistoryEntry,
  type ApiRequest,
  type Collection,
  type Folder,
  type HistoryEntry,
  type Workspace,
} from "@/services/db";
import { getNextCollectionPosition } from "@/services/tree-move";
import type { SidebarTreeState, Store } from "@/stores/types";

export const DEFAULT_SIDEBAR_TREE: SidebarTreeState = {
  collections: {},
  favorites: true,
  unfiled: true,
};

// Undo-for-delete recovery buffer for deleteRequest — deliberately not part of
// Zustand State. It's a short-lived (few-second) in-memory snapshot, not app
// state: nothing outside deleteRequest's own closure reads it, and it must
// never survive a reload (see plan's "no persistence across reload" scope
// cut) the way real State does via persistSession.
export const UNDO_GRACE_MS = 6000;
// The one number the in-memory store and the IndexedDB table now agree on —
// init() pages the load to this many rows, addHistory prunes the table down
// to it on every write. Applies uniformly, including to pinned entries:
// exempting them turned a bounded-cost prune into a scan over however many a
// user has ever pinned, and once a pinned row outlived the load window it'd
// be invisible in the UI with no way to reach it to un-pin — worse than just
// letting it age out like everything else.
export const HISTORY_RETENTION = 2500;

/** The most recent `limit` history entries for a workspace, newest first —
 * an indexed, bounded read instead of loading the whole table. Exported only
 * so tests can exercise the paging/pruning mechanism at a small scale without
 * the real HISTORY_RETENTION's row count making that prohibitively slow. */
export async function loadRecentHistory(
  workspaceId: string,
  limit: number,
): Promise<HistoryEntry[]> {
  const items = await db.history
    .where("[workspaceId+executedAt]")
    .between([workspaceId, Dexie.minKey], [workspaceId, Dexie.maxKey])
    .reverse()
    .limit(limit)
    .toArray();
  return items.map(normalizeHistoryEntry);
}

/** Deletes history entries past the `limit` most recent for a workspace.
 * Only ever touches the overflow past the cutoff, not the whole table — call
 * from inside the same transaction as the write that might have pushed the
 * count over the limit, so the table never briefly holds more than one
 * entry's worth over it. */
export async function pruneHistoryToLimit(workspaceId: string, limit: number): Promise<void> {
  const staleIds = await db.history
    .where("[workspaceId+executedAt]")
    .between([workspaceId, Dexie.minKey], [workspaceId, Dexie.maxKey])
    .reverse()
    .offset(limit)
    .primaryKeys();
  if (staleIds.length) await db.history.bulkDelete(staleIds as string[]);
}

/** Shared tail end of every "import a collection from some external format"
 * action (Postman, Insomnia, HAR, OpenAPI) — each parser produces the same
 * `{ collectionName, folders, requests, warnings }` shape, and from there
 * committing it (new Collection, re-parented folders/requests, DB write,
 * store update, warnings toast) is identical regardless of source format. */
export async function commitImportedCollection(
  result: { collectionName: string; folders: Folder[]; requests: ApiRequest[]; warnings: string[] },
  ws: Workspace,
  set: (fn: (s: Store) => Partial<Store>) => void,
  get: () => Store,
): Promise<Collection> {
  const position = getNextCollectionPosition(get().collections);
  const newCol: Collection = {
    id: uid(),
    workspaceId: ws.id,
    name: result.collectionName,
    position,
    defaults: createDefaultRequestDefaults(),
    createdAt: Date.now(),
  };
  const newFolders: Folder[] = result.folders.map((folder) => ({
    ...folder,
    workspaceId: ws.id,
    collectionId: newCol.id,
  }));
  const newReqs: ApiRequest[] = result.requests.map((request) => ({
    ...request,
    workspaceId: ws.id,
    collectionId: newCol.id,
  }));

  await db.transaction("rw", db.collections, db.folders, db.requests, async () => {
    await db.collections.add(newCol);
    if (newFolders.length) await db.folders.bulkAdd(newFolders);
    if (newReqs.length) await db.requests.bulkAdd(newReqs);
  });
  set((s) => ({
    collections: [...s.collections, newCol],
    folders: [...s.folders, ...newFolders],
    requests: [...s.requests, ...newReqs],
  }));

  if (result.warnings.length) {
    toast.warning(`Imported with ${result.warnings.length} note(s)`, {
      description: result.warnings.slice(0, 3).join(" · "),
    });
  }
  return newCol;
}

export function persistSession(get: () => Store) {
  const { tabs, activeTabId, activeEnvId, sidebarCollapsed, sidebarWidth, sidebarTree } = get();
  try {
    localStorage.setItem(
      "reqlo:session",
      JSON.stringify({
        tabs,
        activeTabId,
        activeEnvId,
        sidebarCollapsed,
        sidebarWidth,
        sidebarTree,
      }),
    );
  } catch {
    // Ignore storage write failures in private mode or quota-constrained environments.
  }
}

export function resetPersistedSession() {
  try {
    localStorage.removeItem("reqlo:session");
  } catch {
    // Ignore storage failures during destructive restore.
  }
}

export function setSidebarTreeDefaults(value?: SidebarTreeState | null): SidebarTreeState {
  return {
    collections: value?.collections ?? {},
    favorites: value?.favorites ?? true,
    unfiled: value?.unfiled ?? true,
  };
}

export function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "reqlo"
  );
}

export function suggestEnvironmentName(existingNames: string[]) {
  const taken = new Set(existingNames.map((name) => name.toLowerCase()));
  let index = 1;
  let candidate = "Environment";

  while (taken.has(candidate.toLowerCase())) {
    index += 1;
    candidate = `Environment ${index}`;
  }

  return candidate;
}

export function suggestCopyName(name: string, existingNames: string[]) {
  const base = name.trim() || "Environment";
  const taken = new Set(existingNames.map((item) => item.toLowerCase()));
  let candidate = `${base} (copy)`;
  let index = 2;

  while (taken.has(candidate.toLowerCase())) {
    candidate = `${base} (copy ${index})`;
    index += 1;
  }

  return candidate;
}

export async function reportDbWriteFailure<T>(write: Promise<T>): Promise<T> {
  try {
    return await write;
  } catch (error) {
    console.error(error);
    toast.error("Change not saved", {
      description:
        "The last change couldn't be written to local storage. It may be lost on reload.",
    });
    throw error;
  }
}

export function omitKeys<T>(record: Record<string, T>, ids: readonly string[]): Record<string, T> {
  if (!ids.length) return record;
  const doomed = new Set(ids);
  return Object.fromEntries(Object.entries(record).filter(([key]) => !doomed.has(key)));
}

export function remapKvIds<T extends { id: string }>(list: T[]) {
  return list.map((item) => ({ ...item, id: uid() }));
}

export function remapBodyDraftIds(
  drafts?: ApiRequest["bodyDrafts"] | HistoryEntry["snapshot"]["bodyDrafts"],
) {
  const next = cloneBodyDrafts(drafts ?? createDefaultBodyDrafts());
  return {
    ...next,
    formData: next.formData.map((row) => ({
      ...row,
      id: uid(),
      files: row.files.map((file) => ({ ...file, id: uid() })),
    })),
    urlEncoded: next.urlEncoded.map((row) => ({ ...row, id: uid() })),
    binary: {
      file: next.binary.file ? { ...next.binary.file, id: uid() } : null,
    },
  };
}
