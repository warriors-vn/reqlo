import {
  createDefaultRequestDefaults,
  db,
  uid,
  type Folder,
  type RequestDefaults,
} from "@/services/db";
import {
  collectDescendantFolderIds,
  getNextFolderPosition,
  reorderByIndex,
  wouldCreateCycle,
} from "@/services/tree-move";
import { omitKeys, persistSession, reportDbWriteFailure } from "@/stores/shared";
import type { SliceCreator } from "@/stores/types";

export interface FoldersSlice {
  updateFolderDefaults: (id: string, defaults: RequestDefaults) => Promise<void>;
  createFolder: (
    collectionId: string,
    parentFolderId: string | null,
    name: string,
  ) => Promise<Folder>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  reorderFolders: (draggedId: string, targetId: string) => Promise<void>;
  moveFolderToParent: (folderId: string, parentFolderId: string | null) => Promise<void>;
}

export const createFoldersSlice: SliceCreator<FoldersSlice> = (set, get) => ({
  updateFolderDefaults: async (id, defaults) => {
    set((state) => ({
      folders: state.folders.map((folder) => (folder.id === id ? { ...folder, defaults } : folder)),
    }));
    await reportDbWriteFailure(db.folders.update(id, { defaults }));
  },

  createFolder: async (collectionId, parentFolderId, name) => {
    const ws = get().workspace!;
    const position = getNextFolderPosition(get().folders, collectionId, parentFolderId);
    const folder: Folder = {
      id: uid(),
      workspaceId: ws.id,
      collectionId,
      parentFolderId,
      name: name.trim() || "New folder",
      position,
      defaults: createDefaultRequestDefaults(),
      createdAt: Date.now(),
    };
    await reportDbWriteFailure(db.folders.add(folder));
    set((s) => ({ folders: [...s.folders, folder] }));
    return folder;
  },

  renameFolder: async (id, name) => {
    const nextName = name.trim();
    if (!nextName) return;
    await reportDbWriteFailure(db.folders.update(id, { name: nextName }));
    set((state) => ({
      folders: state.folders.map((folder) =>
        folder.id === id ? { ...folder, name: nextName } : folder,
      ),
    }));
  },

  deleteFolder: async (id) => {
    const allFolders = get().folders;
    const descendantFolderIds = collectDescendantFolderIds(allFolders, id);
    const doomedFolderIds = new Set([id, ...descendantFolderIds]);
    const doomedRequestIds = get()
      .requests.filter((request) => !!request.folderId && doomedFolderIds.has(request.folderId))
      .map((request) => request.id);

    await reportDbWriteFailure(
      db.transaction("rw", db.folders, db.requests, async () => {
        await db.requests.bulkDelete(doomedRequestIds);
        await db.folders.bulkDelete([...doomedFolderIds]);
      }),
    );
    set((s) => ({
      folders: s.folders.filter((folder) => !doomedFolderIds.has(folder.id)),
      requests: s.requests.filter((request) => !doomedRequestIds.includes(request.id)),
      tabs: s.tabs.filter((tab) => !doomedRequestIds.includes(tab.requestId)),
      sidebarSelection:
        s.sidebarSelection?.type === "collection" && doomedFolderIds.has(s.sidebarSelection.id)
          ? null
          : s.sidebarSelection,
      graphqlSchemas: omitKeys(s.graphqlSchemas, doomedRequestIds),
    }));
    persistSession(get);
  },

  reorderFolders: async (draggedId, targetId) => {
    if (draggedId === targetId) return;
    const dragged = get().folders.find((folder) => folder.id === draggedId);
    if (!dragged) return;

    const siblings = get()
      .folders.filter(
        (folder) =>
          folder.collectionId === dragged.collectionId &&
          folder.parentFolderId === dragged.parentFolderId,
      )
      .sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
    const draggedIndex = siblings.findIndex((folder) => folder.id === draggedId);
    const targetIndex = siblings.findIndex((folder) => folder.id === targetId);
    if (draggedIndex === -1 || targetIndex === -1) return;

    const reordered = reorderByIndex(siblings, draggedIndex, targetIndex).map((folder, index) => ({
      ...folder,
      position: index,
    }));
    const reorderedMap = new Map(reordered.map((folder) => [folder.id, folder]));
    set((state) => ({
      folders: state.folders.map((folder) => reorderedMap.get(folder.id) ?? folder),
    }));
    await reportDbWriteFailure(db.folders.bulkPut(reordered));
  },

  moveFolderToParent: async (folderId, parentFolderId) => {
    const folder = get().folders.find((item) => item.id === folderId);
    if (!folder) return;
    if (folder.parentFolderId === parentFolderId) return;
    if (wouldCreateCycle(get().folders, folderId, parentFolderId)) return;

    const position = getNextFolderPosition(get().folders, folder.collectionId, parentFolderId);
    set((state) => ({
      folders: state.folders.map((item) =>
        item.id === folderId ? { ...item, parentFolderId, position } : item,
      ),
    }));
    await reportDbWriteFailure(db.folders.update(folderId, { parentFolderId, position }));
  },
});
