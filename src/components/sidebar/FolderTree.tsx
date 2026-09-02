import { FolderClosed, MoreHorizontal, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { useStore } from "@/stores/useStore";
import { MethodBadge } from "@/components/MethodBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DropIndicator } from "./DropIndicator";
import { RequestList } from "./RequestList";
import { SidebarSection } from "./SidebarSection";

export interface FolderTreeProps {
  collectionId: string;
  parentFolderId: string | null;
  folders: Array<{
    id: string;
    collectionId: string;
    parentFolderId: string | null;
    name: string;
    position: number;
    createdAt: number;
  }>;
  requests: Array<{
    id: string;
    method: Parameters<typeof MethodBadge>[0]["method"];
    name: string;
    favorite?: boolean;
    collectionId?: string | null;
    folderId?: string | null;
  }>;
  collections: Array<{ id: string; name: string }>;
  dragEnabled: boolean;
  draggedRequest: { id: string; collectionId: string | null; folderId: string | null } | null;
  requestDropTarget: {
    targetId: string | null;
    collectionId: string | null;
    folderId: string | null;
  } | null;
  draggedFolderId: string | null;
  folderReorderTargetId: string | null;
  folderAppendTargetId: string | null;
  activeRequestId?: string;
  openMap: Record<string, boolean>;
  renamingFolderId: string | null;
  folderNameDraft: string;
  onFolderNameDraftChange: (value: string) => void;
  onToggleFolderOpen: (id: string, open: boolean) => void;
  onStartFolderRename: (id: string, name: string) => void;
  onSubmitFolderRename: (id: string) => void;
  onCancelFolderRename: () => void;
  onOpen: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onMove: (id: string, collectionId: string | null) => void;
  onDragStartRequest: (id: string, collectionId: string | null, folderId: string | null) => void;
  onDragEndRequest: () => void;
  onReorderRequest: (
    draggedId: string,
    targetId: string | null,
    collectionId: string | null,
    folderId: string | null,
  ) => void;
  onRequestDropTargetChange: (
    value: { targetId: string | null; collectionId: string | null; folderId: string | null } | null,
  ) => void;
  onRenameRequest: (id: string) => void;
  onDuplicateRequest: (id: string) => void;
  onDeleteRequest: (id: string) => void;
  onDropRequestIntoFolder: (requestId: string, collectionId: string, folderId: string) => void;
  onDragStartFolder: (id: string) => void;
  onDragEndFolder: () => void;
  onFolderAppendHover: (id: string | null) => void;
  onFolderReorderTargetChange: (id: string | null) => void;
  onFolderDrop: (targetFolderId: string) => void;
  onNewFolder: (collectionId: string, parentFolderId: string | null) => void;
  onNewRequestInFolder: (collectionId: string, folderId: string) => void;
  onDeleteFolderRequest: (id: string) => void;
}

export function FolderTree(props: FolderTreeProps) {
  const { collectionId, parentFolderId, folders, requests } = props;
  const childFolders = folders
    .filter((f) => f.collectionId === collectionId && f.parentFolderId === parentFolderId)
    .sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
  const childRequests = requests.filter(
    (r) => (r.collectionId ?? null) === collectionId && (r.folderId ?? null) === parentFolderId,
  );

  return (
    <>
      {childFolders.map((folder) => {
        const isOpen = props.openMap[folder.id] ?? true;
        const isRenaming = props.renamingFolderId === folder.id;
        return (
          <SidebarSection
            key={folder.id}
            icon={<FolderClosed className="h-3.5 w-3.5 text-muted-foreground" />}
            title={
              isRenaming ? (
                <input
                  autoFocus
                  value={props.folderNameDraft}
                  onChange={(event) => props.onFolderNameDraftChange(event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                  onBlur={() => props.onSubmitFolderRename(folder.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                    if (event.key === "Escape") props.onCancelFolderRename();
                  }}
                  className="h-7 min-w-0 rounded-lg border border-border/80 bg-background/80 px-2 text-xs font-medium outline-none transition focus:border-foreground/15"
                />
              ) : (
                folder.name
              )
            }
            count={requests.filter((r) => r.folderId === folder.id).length}
            open={isOpen}
            onToggle={() => props.onToggleFolderOpen(folder.id, !isOpen)}
            draggable={props.dragEnabled && !isRenaming}
            dragging={props.draggedFolderId === folder.id}
            dragTargeted={props.folderReorderTargetId === folder.id}
            onDragStart={() => props.onDragStartFolder(folder.id)}
            onDragEnd={props.onDragEndFolder}
            onDragOver={(event) => {
              if (props.dragEnabled && props.draggedRequest) {
                event.preventDefault();
                props.onFolderAppendHover(folder.id);
                props.onRequestDropTargetChange(null);
                return;
              }
              if (
                !props.dragEnabled ||
                !props.draggedFolderId ||
                props.draggedFolderId === folder.id
              ) {
                return;
              }
              event.preventDefault();
              props.onFolderReorderTargetChange(folder.id);
            }}
            onDrop={() => {
              if (props.dragEnabled && props.draggedRequest) {
                props.onDropRequestIntoFolder(props.draggedRequest.id, collectionId, folder.id);
                props.onDragEndRequest();
                return;
              }
              if (
                !props.dragEnabled ||
                !props.draggedFolderId ||
                props.draggedFolderId === folder.id
              ) {
                return;
              }
              props.onFolderDrop(folder.id);
              props.onDragEndFolder();
            }}
            dropIndicator={
              props.folderAppendTargetId === folder.id ? (
                <DropIndicator label={`Drop to add to ${folder.name}`} />
              ) : props.folderReorderTargetId === folder.id ? (
                <DropIndicator label={`Drop near ${folder.name}`} tone="muted" />
              ) : null
            }
            actions={
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    onClick={(event) => event.stopPropagation()}
                    className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
                    title={`${folder.name} actions`}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => props.onStartFolderRename(folder.id, folder.name)}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Rename folder
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => props.onNewRequestInFolder(collectionId, folder.id)}
                  >
                    <Plus className="h-3.5 w-3.5" /> New request in folder
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => props.onNewFolder(collectionId, folder.id)}>
                    <FolderClosed className="h-3.5 w-3.5" /> New subfolder
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => useStore.getState().startRun({ type: "folder", id: folder.id })}
                  >
                    <Play className="h-3.5 w-3.5" /> Run all requests
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => props.onDeleteFolderRequest(folder.id)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete folder
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            }
          >
            <FolderTree {...props} parentFolderId={folder.id} />
          </SidebarSection>
        );
      })}
      <RequestList
        items={childRequests}
        collections={props.collections}
        listCollectionId={collectionId}
        listFolderId={parentFolderId}
        reorderEnabled={props.dragEnabled}
        draggedRequest={props.draggedRequest}
        requestDropTarget={props.requestDropTarget}
        activeRequestId={props.activeRequestId}
        onOpen={props.onOpen}
        onToggleFavorite={props.onToggleFavorite}
        onMove={props.onMove}
        onDragStart={props.onDragStartRequest}
        onDragEnd={props.onDragEndRequest}
        onReorder={props.onReorderRequest}
        onRequestDropTargetChange={props.onRequestDropTargetChange}
        onSectionAppendHover={() => undefined}
        onRename={props.onRenameRequest}
        onDuplicate={props.onDuplicateRequest}
        onDelete={props.onDeleteRequest}
        emptyIcon={<FolderClosed className="h-3.5 w-3.5" />}
        emptyTitle={parentFolderId ? "Folder is empty" : "No requests yet"}
        emptyHint={
          parentFolderId ? "Drag a request into this folder" : "Add a request or drag one in"
        }
      />
    </>
  );
}
