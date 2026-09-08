import { LazyConfirmDeleteDialog as ConfirmDeleteDialog } from "@/components/LazyConfirmDeleteDialog";
import { collectDescendantFolderIds } from "@/services/tree-move";
import type { ApiRequest, Collection, Folder } from "@/services/db";

export function SidebarDeleteDialogs({
  requests,
  collections,
  folders,
  pendingDeleteRequestId,
  pendingDeleteCollectionId,
  pendingDeleteFolderId,
  onCancelDeleteRequest,
  onCancelDeleteCollection,
  onCancelDeleteFolder,
  onConfirmDeleteRequest,
  onConfirmDeleteCollection,
  onConfirmDeleteFolder,
}: {
  requests: ApiRequest[];
  collections: Collection[];
  folders: Folder[];
  pendingDeleteRequestId: string | null;
  pendingDeleteCollectionId: string | null;
  pendingDeleteFolderId: string | null;
  onCancelDeleteRequest: () => void;
  onCancelDeleteCollection: () => void;
  onCancelDeleteFolder: () => void;
  onConfirmDeleteRequest: (id: string) => void;
  onConfirmDeleteCollection: (id: string) => void;
  onConfirmDeleteFolder: (id: string) => void;
}) {
  return (
    <>
      <ConfirmDeleteDialog
        open={pendingDeleteRequestId !== null}
        onOpenChange={(open) => {
          if (!open) onCancelDeleteRequest();
        }}
        title="Delete request"
        description={
          pendingDeleteRequestId
            ? `"${requests.find((request) => request.id === pendingDeleteRequestId)?.name ?? "This request"}" will be deleted. You can undo this from the toast for a few seconds afterward.`
            : ""
        }
        onConfirm={() => {
          if (pendingDeleteRequestId) onConfirmDeleteRequest(pendingDeleteRequestId);
        }}
      />

      <ConfirmDeleteDialog
        open={pendingDeleteCollectionId !== null}
        onOpenChange={(open) => {
          if (!open) onCancelDeleteCollection();
        }}
        title="Delete collection"
        description={(() => {
          const collection = collections.find((c) => c.id === pendingDeleteCollectionId);
          if (!collection) return "";
          const count = requests.filter((r) => r.collectionId === collection.id).length;
          return `"${collection.name}" and its ${count} request${count === 1 ? "" : "s"} will be permanently deleted. This can't be undone.`;
        })()}
        onConfirm={() => {
          if (pendingDeleteCollectionId) onConfirmDeleteCollection(pendingDeleteCollectionId);
        }}
      />

      <ConfirmDeleteDialog
        open={pendingDeleteFolderId !== null}
        onOpenChange={(open) => {
          if (!open) onCancelDeleteFolder();
        }}
        title="Delete folder"
        description={(() => {
          const folder = folders.find((f) => f.id === pendingDeleteFolderId);
          if (!folder) return "";
          const descendantFolderIds = new Set(collectDescendantFolderIds(folders, folder.id));
          descendantFolderIds.add(folder.id);
          const count = requests.filter(
            (r) => !!r.folderId && descendantFolderIds.has(r.folderId),
          ).length;
          return `"${folder.name}" and everything inside it (${count} request${count === 1 ? "" : "s"}) will be permanently deleted. This can't be undone.`;
        })()}
        onConfirm={() => {
          if (pendingDeleteFolderId) onConfirmDeleteFolder(pendingDeleteFolderId);
        }}
      />
    </>
  );
}
