import {
  db,
  uid,
  cloneBodyDrafts,
  normalizeApiRequest,
  normalizeHistoryEntry,
  type ApiRequest,
  type HistoryEntry,
} from "@/services/db";
import { getNextRequestPosition } from "@/services/tree-move";
import {
  HISTORY_RETENTION,
  persistSession,
  pruneHistoryToLimit,
  reportDbWriteFailure,
} from "@/stores/shared";
import type { SliceCreator } from "@/stores/types";

export interface HistorySlice {
  addHistory: (entry: HistoryEntry) => Promise<void>;
  restoreHistoryEntry: (
    historyId: string,
    options?: { openInNewTab?: boolean; rerun?: boolean },
  ) => Promise<void>;
  toggleHistoryFavorite: (historyId: string) => Promise<void>;
  toggleHistoryPinned: (historyId: string) => Promise<void>;
  deleteHistoryEntry: (historyId: string) => Promise<void>;
  clearHistory: () => Promise<void>;
}

export const createHistorySlice: SliceCreator<HistorySlice> = (set, get) => ({
  addHistory: async (entry) => {
    const normalized = normalizeHistoryEntry(entry);
    await reportDbWriteFailure(
      db.transaction("rw", db.history, async () => {
        await db.history.put(normalized);
        await pruneHistoryToLimit(normalized.workspaceId, HISTORY_RETENTION);
      }),
    );
    set((s) => ({
      history: [normalized, ...s.history.filter((h) => h.id !== normalized.id)].slice(
        0,
        HISTORY_RETENTION,
      ),
    }));
  },

  restoreHistoryEntry: async (historyId, options) => {
    const entry = get().history.find((item) => item.id === historyId);
    const workspace = get().workspace;
    if (!entry || !workspace) return;

    const now = Date.now();
    const snapshot = entry.snapshot;
    const existing = snapshot.requestId
      ? get().requests.find((request) => request.id === snapshot.requestId)
      : null;
    let targetRequestId: string | null;

    if (options?.openInNewTab || !existing) {
      const restored: ApiRequest = normalizeApiRequest({
        id: uid(),
        workspaceId: workspace.id,
        collectionId: snapshot.collectionId,
        folderId: null,
        position: getNextRequestPosition(get().requests, snapshot.collectionId, null),
        name: options?.openInNewTab ? `${snapshot.requestName} · restored` : snapshot.requestName,
        method: snapshot.method,
        url: snapshot.url,
        headers: snapshot.headers.map((header) => ({ ...header, id: uid() })),
        queryParams: snapshot.queryParams.map((param) => ({ ...param, id: uid() })),
        body: snapshot.body,
        bodyType: snapshot.bodyType,
        bodyDrafts: cloneBodyDrafts(snapshot.bodyDrafts),
        auth: { ...snapshot.auth },
        favorite: false,
        createdAt: now,
        updatedAt: now,
      });
      await db.requests.add(restored);
      set((s) => ({ requests: [...s.requests, restored] }));
      targetRequestId = restored.id;
      const tab = { id: uid(), requestId: restored.id };
      set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
    } else {
      const confirmed = window.confirm(
        `Restore this snapshot into "${existing.name}"? Its current contents will be overwritten.`,
      );
      if (!confirmed) return;

      const nextCollectionId = snapshot.collectionId;
      const collectionChanged = existing.collectionId !== nextCollectionId;
      const patch = {
        collectionId: nextCollectionId,
        // Only reset folderId when the collection actually changes — the snapshot carries no
        // folder info, and a same-collection restore shouldn't silently relocate the request
        // out of whatever folder it's currently filed in.
        ...(collectionChanged
          ? {
              folderId: null,
              position: getNextRequestPosition(
                get().requests.filter((request) => request.id !== existing.id),
                nextCollectionId,
                null,
              ),
            }
          : {}),
        name: snapshot.requestName,
        method: snapshot.method,
        url: snapshot.url,
        headers: snapshot.headers.map((header) => ({ ...header })),
        queryParams: snapshot.queryParams.map((param) => ({ ...param })),
        body: snapshot.body,
        bodyType: snapshot.bodyType,
        bodyDrafts: cloneBodyDrafts(snapshot.bodyDrafts),
        auth: { ...snapshot.auth },
      } satisfies Partial<ApiRequest>;
      await get().updateRequest(existing.id, patch);
      get().openRequest(existing.id);
      targetRequestId = existing.id;
    }

    persistSession(get);
    if (options?.rerun && targetRequestId) {
      get().requestSend();
    }
  },

  toggleHistoryFavorite: async (historyId) => {
    const entry = get().history.find((item) => item.id === historyId);
    if (!entry) return;
    const favorite = !entry.favorite;
    await reportDbWriteFailure(db.history.update(historyId, { favorite }));
    set((s) => ({
      history: s.history.map((item) => (item.id === historyId ? { ...item, favorite } : item)),
    }));
  },

  toggleHistoryPinned: async (historyId) => {
    const entry = get().history.find((item) => item.id === historyId);
    if (!entry) return;
    const pinned = !entry.pinned;
    await reportDbWriteFailure(db.history.update(historyId, { pinned }));
    set((s) => ({
      history: s.history.map((item) => (item.id === historyId ? { ...item, pinned } : item)),
    }));
  },

  deleteHistoryEntry: async (historyId) => {
    await reportDbWriteFailure(db.history.delete(historyId));
    set((s) => ({ history: s.history.filter((item) => item.id !== historyId) }));
  },

  clearHistory: async () => {
    const workspace = get().workspace;
    if (!workspace) return;
    const ids = await db.history.where("workspaceId").equals(workspace.id).primaryKeys();
    await reportDbWriteFailure(db.history.bulkDelete(ids as string[]));
    set({ history: [] });
  },
});
