import {
  db,
  uid,
  cloneBodyDrafts,
  cloneRequestDefaults,
  createDefaultRequestDefaults,
  type ApiRequest,
  type Collection,
  type RequestDefaults,
  type Folder,
} from "@/services/db";
import { getNextCollectionPosition, reorderByIndex } from "@/services/tree-move";
import { omitKeys, persistSession, reportDbWriteFailure } from "@/stores/shared";
import type { SliceCreator } from "@/stores/types";

export interface CollectionsSlice {
  updateCollectionDefaults: (id: string, defaults: RequestDefaults) => Promise<void>;
  createCollection: (name: string) => Promise<Collection>;
  renameCollection: (id: string, name: string) => Promise<void>;
  reorderCollections: (draggedId: string, targetId: string) => Promise<void>;
  duplicateCollection: (id: string) => Promise<Collection | null>;
  deleteCollection: (id: string) => Promise<void>;
}

export const createCollectionsSlice: SliceCreator<CollectionsSlice> = (set, get) => ({
  updateCollectionDefaults: async (id, defaults) => {
    set((state) => ({
      collections: state.collections.map((collection) =>
        collection.id === id ? { ...collection, defaults } : collection,
      ),
    }));
    await reportDbWriteFailure(db.collections.update(id, { defaults }));
  },

  createCollection: async (name) => {
    const ws = get().workspace!;
    const position = getNextCollectionPosition(get().collections);
    const finalName = name.trim() || `Collection ${get().collections.length + 1}`;
    const col: Collection = {
      id: uid(),
      workspaceId: ws.id,
      name: finalName,
      position,
      defaults: createDefaultRequestDefaults(),
      createdAt: Date.now(),
    };
    await reportDbWriteFailure(db.collections.add(col));
    set((s) => ({ collections: [...s.collections, col] }));
    return col;
  },

  renameCollection: async (id, name) => {
    const nextName = name.trim();
    if (!nextName) return;
    await reportDbWriteFailure(db.collections.update(id, { name: nextName }));
    set((state) => ({
      collections: state.collections.map((collection) =>
        collection.id === id ? { ...collection, name: nextName } : collection,
      ),
    }));
  },

  reorderCollections: async (draggedId, targetId) => {
    if (draggedId === targetId) return;
    const collections = [...get().collections].sort(
      (left, right) => left.position - right.position,
    );
    const draggedIndex = collections.findIndex((collection) => collection.id === draggedId);
    const targetIndex = collections.findIndex((collection) => collection.id === targetId);
    if (draggedIndex === -1 || targetIndex === -1) return;

    const reordered = reorderByIndex(collections, draggedIndex, targetIndex).map(
      (collection, index) => ({
        ...collection,
        position: index,
      }),
    );

    set({ collections: reordered });
    await reportDbWriteFailure(db.collections.bulkPut(reordered));
  },

  duplicateCollection: async (id) => {
    const src = get().collections.find((c) => c.id === id);
    if (!src) return null;
    const ws = get().workspace!;
    const now = Date.now();
    const position = getNextCollectionPosition(get().collections);
    const copy: Collection = {
      id: uid(),
      workspaceId: ws.id,
      name: `${src.name} (copy)`,
      position,
      // A duplicate inherits the source's defaults too — copying a collection
      // without its auth would silently break every request inside the copy.
      defaults: cloneRequestDefaults(src.defaults),
      createdAt: now,
    };

    const srcFolders = get().folders.filter((f) => f.collectionId === id);
    const folderIdMap = new Map<string, string>();
    srcFolders.forEach((folder) => folderIdMap.set(folder.id, uid()));
    const newFolders: Folder[] = srcFolders.map((folder) => ({
      id: folderIdMap.get(folder.id)!,
      workspaceId: ws.id,
      collectionId: copy.id,
      parentFolderId: folder.parentFolderId
        ? (folderIdMap.get(folder.parentFolderId) ?? null)
        : null,
      name: folder.name,
      position: folder.position,
      defaults: cloneRequestDefaults(folder.defaults),
      createdAt: now,
    }));

    const srcReqs = get().requests.filter((r) => r.collectionId === id);
    const copies: ApiRequest[] = srcReqs.map((r) => ({
      ...r,
      id: uid(),
      collectionId: copy.id,
      folderId: r.folderId ? (folderIdMap.get(r.folderId) ?? null) : null,
      position: r.position,
      headers: r.headers.map((h) => ({ ...h, id: uid() })),
      queryParams: r.queryParams.map((p) => ({ ...p, id: uid() })),
      bodyDrafts: cloneBodyDrafts(r.bodyDrafts),
      auth: { ...r.auth },
      extracts: r.extracts.map((rule) => ({ ...rule, id: uid() })),
      assertions: r.assertions.map((rule) => ({ ...rule, id: uid() })),
      mock: { ...r.mock },
      createdAt: now,
      updatedAt: now,
    }));

    await reportDbWriteFailure(
      db.transaction("rw", db.collections, db.folders, db.requests, async () => {
        await db.collections.add(copy);
        if (newFolders.length) await db.folders.bulkAdd(newFolders);
        if (copies.length) await db.requests.bulkAdd(copies);
      }),
    );
    set((s) => ({
      collections: [...s.collections, copy],
      folders: [...s.folders, ...newFolders],
      requests: [...s.requests, ...copies],
    }));
    return copy;
  },

  deleteCollection: async (id) => {
    const reqs = get().requests.filter((r) => r.collectionId === id);
    const folders = get().folders.filter((f) => f.collectionId === id);
    await reportDbWriteFailure(
      db.transaction("rw", db.collections, db.folders, db.requests, async () => {
        await db.requests.bulkDelete(reqs.map((r) => r.id));
        await db.folders.bulkDelete(folders.map((f) => f.id));
        await db.collections.delete(id);
      }),
    );
    set((s) => ({
      collections: s.collections.filter((c) => c.id !== id),
      folders: s.folders.filter((f) => f.collectionId !== id),
      requests: s.requests.filter((r) => r.collectionId !== id),
      tabs: s.tabs.filter((t) => !reqs.find((r) => r.id === t.requestId)),
      sidebarSelection:
        s.sidebarSelection?.type === "collection" && s.sidebarSelection.id === id
          ? null
          : s.sidebarSelection,
      graphqlSchemas: omitKeys(
        s.graphqlSchemas,
        reqs.map((r) => r.id),
      ),
    }));
    persistSession(get);
  },
});
