import {
  CopyPlus,
  Download,
  FolderClosed,
  FolderGit2,
  MoreHorizontal,
  Pencil,
  Play,
  Plug,
  Plus,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useStore } from "@/stores/useStore";
import type { Collection } from "@/services/db";

export function CollectionActionsMenu({
  collection,
  onRename,
  onCreateRequest,
  onCreateFolder,
  onDuplicate,
  onOpenSettings,
  onExportJson,
  onExportFiles,
  onExportPostman,
  onExportOpenApi,
  onDelete,
}: {
  collection: Collection;
  onRename: () => void;
  onCreateRequest: (protocol?: "http" | "websocket") => void;
  onCreateFolder: () => void;
  onDuplicate: () => void;
  onOpenSettings: () => void;
  onExportJson: () => void;
  onExportFiles: () => void;
  onExportPostman: () => void;
  onExportOpenApi: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(event) => event.stopPropagation()}
          className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
          title={`${collection.name} actions`}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onRename}>
          <Pencil className="h-3.5 w-3.5" /> Rename collection
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onCreateRequest()}>
          <Plus className="h-3.5 w-3.5" /> New request in collection
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onCreateRequest("websocket")}>
          <Plug className="h-3.5 w-3.5" /> New WebSocket request
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onCreateFolder}>
          <FolderClosed className="h-3.5 w-3.5" /> New folder
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onDuplicate}>
          <CopyPlus className="h-3.5 w-3.5" /> Duplicate collection
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => useStore.getState().startRun({ type: "collection", id: collection.id })}
        >
          <Play className="h-3.5 w-3.5" /> Run all requests
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onOpenSettings}>
          <SlidersHorizontal className="h-3.5 w-3.5" /> Collection settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Download className="h-3.5 w-3.5" /> Export as
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent>
              <DropdownMenuItem onSelect={onExportJson}>reqlo JSON</DropdownMenuItem>
              <DropdownMenuItem onSelect={onExportFiles}>
                <FolderGit2 className="h-3.5 w-3.5" /> Files (git-friendly)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onExportPostman}>Postman v2.1</DropdownMenuItem>
              <DropdownMenuItem onSelect={onExportOpenApi}>OpenAPI 3.1</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="h-3.5 w-3.5" /> Delete collection
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
