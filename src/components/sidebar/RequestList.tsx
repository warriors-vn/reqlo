import { memo } from "react";
import {
  GripVertical,
  Trash2,
  Star,
  Heart,
  Inbox,
  MoreHorizontal,
  Pencil,
  Plus,
} from "lucide-react";
import { MethodBadge } from "@/components/MethodBadge";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DropIndicator } from "./DropIndicator";

type RequestItem = {
  id: string;
  method: Parameters<typeof MethodBadge>[0]["method"];
  protocol?: Parameters<typeof MethodBadge>[0]["protocol"];
  name: string;
  favorite?: boolean;
  collectionId?: string | null;
};

interface RequestRowProps {
  request: RequestItem;
  collections: Array<{ id: string; name: string }>;
  listCollectionId: string | null;
  listFolderId: string | null;
  reorderEnabled: boolean;
  draggedRequestId: string | null;
  dropBefore: boolean;
  isDropTarget: boolean;
  isActive: boolean;
  onOpen: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onMove: (id: string, collectionId: string | null) => void;
  onDragStart: (id: string, collectionId: string | null, folderId: string | null) => void;
  onDragEnd: () => void;
  onReorder: (
    draggedId: string,
    targetId: string | null,
    collectionId: string | null,
    folderId: string | null,
  ) => void;
  onRequestDropTargetChange: (
    value: { targetId: string | null; collectionId: string | null; folderId: string | null } | null,
  ) => void;
  onSectionAppendHover: (collectionId: string | null) => void;
  onRename: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

// Memoized so a `requests` array update elsewhere (e.g. every keystroke while
// editing a different request's URL/headers/body via updateRequest) only
// re-renders the row whose own object identity actually changed, not every
// row in the sidebar tree.
const RequestRow = memo(function RequestRow({
  request,
  collections,
  listCollectionId,
  listFolderId,
  reorderEnabled,
  draggedRequestId,
  dropBefore,
  isDropTarget,
  isActive,
  onOpen,
  onToggleFavorite,
  onMove,
  onDragStart,
  onDragEnd,
  onReorder,
  onRequestDropTargetChange,
  onSectionAppendHover,
  onRename,
  onDuplicate,
  onDelete,
}: RequestRowProps) {
  const isDragSource = draggedRequestId === request.id;
  return (
    <div>
      {dropBefore ? (
        <DropIndicator label={`Drop before ${request.name || "Untitled"}`} compact />
      ) : null}
      <div
        draggable={reorderEnabled}
        onDragStart={(event) => {
          if (!reorderEnabled) return;
          event.dataTransfer.effectAllowed = "move";
          onDragStart(request.id, listCollectionId, listFolderId);
        }}
        onDragEnd={onDragEnd}
        onDragOver={(event) => {
          if (!reorderEnabled || !draggedRequestId || isDragSource) return;
          event.preventDefault();
          onSectionAppendHover(null);
          onRequestDropTargetChange({
            targetId: request.id,
            collectionId: listCollectionId,
            folderId: listFolderId,
          });
        }}
        onDrop={() => {
          if (!reorderEnabled || !draggedRequestId || isDragSource) return;
          onReorder(draggedRequestId, request.id, listCollectionId, listFolderId);
          onDragEnd();
        }}
        className={cn(
          "group flex items-center gap-2 rounded-md px-2 py-1.5 transition",
          isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
          reorderEnabled && "cursor-grab active:cursor-grabbing",
          isDropTarget && "bg-primary/5 ring-1 ring-primary/15",
        )}
      >
        {reorderEnabled ? (
          <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
        ) : null}
        <button
          type="button"
          onClick={() => onOpen(request.id)}
          aria-current={isActive ? "true" : undefined}
          className="flex min-w-0 flex-1 items-center gap-2 rounded text-left focus-ring"
        >
          <MethodBadge
            method={request.method}
            protocol={request.protocol}
            className="w-10 shrink-0 text-right"
          />
          <span className="truncate text-xs">{request.name || "Untitled"}</span>
        </button>
        <div className="ml-auto flex items-center gap-0.5 opacity-100 md:opacity-0 md:transition md:group-hover:opacity-100">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleFavorite(request.id);
            }}
            className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Toggle favorite"
          >
            {request.favorite ? (
              <Heart className="h-3 w-3 fill-current text-primary" />
            ) : (
              <Star className="h-3 w-3" />
            )}
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDuplicate(request.id);
            }}
            className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Duplicate request"
          >
            <Plus className="h-3 w-3" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(event) => event.stopPropagation()}
                className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                title="Request actions"
              >
                <MoreHorizontal className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    value={request.collectionId ?? "__unfiled__"}
                    onValueChange={(value) =>
                      onMove(request.id, value === "__unfiled__" ? null : value)
                    }
                  >
                    <DropdownMenuRadioItem value="__unfiled__">Unfiled</DropdownMenuRadioItem>
                    {collections.map((collection) => (
                      <DropdownMenuRadioItem key={collection.id} value={collection.id}>
                        {collection.name}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem onSelect={() => onRename(request.id)}>
                <Pencil className="h-3.5 w-3.5" /> Rename request
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onDuplicate(request.id)}>
                <Plus className="h-3.5 w-3.5" /> Duplicate request
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => onDelete(request.id)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete request
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
});

export function RequestList({
  items,
  collections,
  listCollectionId,
  listFolderId,
  reorderEnabled,
  draggedRequest,
  requestDropTarget,
  activeRequestId,
  onOpen,
  onToggleFavorite,
  onMove,
  onDragStart,
  onDragEnd,
  onReorder,
  onRequestDropTargetChange,
  onSectionAppendHover,
  onRename,
  onDuplicate,
  onDelete,
  emptyIcon = <Inbox className="h-3.5 w-3.5" />,
  emptyTitle = "No requests",
  emptyHint,
}: {
  items: RequestItem[];
  collections: Array<{ id: string; name: string }>;
  listCollectionId: string | null;
  listFolderId: string | null;
  reorderEnabled: boolean;
  draggedRequest: { id: string; collectionId: string | null; folderId: string | null } | null;
  requestDropTarget: {
    targetId: string | null;
    collectionId: string | null;
    folderId: string | null;
  } | null;
  activeRequestId?: string;
  onOpen: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onMove: (id: string, collectionId: string | null) => void;
  onDragStart: (id: string, collectionId: string | null, folderId: string | null) => void;
  onDragEnd: () => void;
  onReorder: (
    draggedId: string,
    targetId: string | null,
    collectionId: string | null,
    folderId: string | null,
  ) => void;
  onRequestDropTargetChange: (
    value: { targetId: string | null; collectionId: string | null; folderId: string | null } | null,
  ) => void;
  onSectionAppendHover: (collectionId: string | null) => void;
  onRename: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  emptyIcon?: React.ReactNode;
  emptyTitle?: string;
  emptyHint?: string;
}) {
  if (items.length === 0) {
    const dragActive = reorderEnabled && !!draggedRequest;
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
        onDragOver={(event) => {
          if (!reorderEnabled || !draggedRequest) return;
          event.preventDefault();
          onSectionAppendHover(listCollectionId);
          onRequestDropTargetChange({
            targetId: null,
            collectionId: listCollectionId,
            folderId: listFolderId,
          });
        }}
        onDrop={() => {
          if (!reorderEnabled || !draggedRequest) return;
          onReorder(draggedRequest.id, null, listCollectionId, listFolderId);
          onDragEnd();
        }}
        className={cn(
          "flex flex-col items-center gap-1 rounded-lg border border-dashed px-2 py-3 text-center transition",
          dragActive ? "border-primary/35 bg-primary/5" : "border-border/60",
        )}
      >
        <div className="grid h-6 w-6 place-items-center rounded-full bg-muted text-muted-foreground/70">
          {emptyIcon}
        </div>
        <div className="text-2xs font-medium text-muted-foreground">{emptyTitle}</div>
        {emptyHint ? (
          <div className="text-3xs leading-4 text-muted-foreground/60">{emptyHint}</div>
        ) : null}
      </motion.div>
    );
  }

  const draggedRequestId = draggedRequest?.id ?? null;

  return (
    <>
      {items.map((request) => {
        const isDropTargetHere =
          requestDropTarget?.targetId === request.id &&
          requestDropTarget.collectionId === listCollectionId &&
          requestDropTarget.folderId === listFolderId;
        return (
          <RequestRow
            key={request.id}
            request={request}
            collections={collections}
            listCollectionId={listCollectionId}
            listFolderId={listFolderId}
            reorderEnabled={reorderEnabled}
            draggedRequestId={draggedRequestId}
            dropBefore={isDropTargetHere}
            isDropTarget={isDropTargetHere}
            isActive={activeRequestId === request.id}
            onOpen={onOpen}
            onToggleFavorite={onToggleFavorite}
            onMove={onMove}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onReorder={onReorder}
            onRequestDropTargetChange={onRequestDropTargetChange}
            onSectionAppendHover={onSectionAppendHover}
            onRename={onRename}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
          />
        );
      })}
    </>
  );
}
