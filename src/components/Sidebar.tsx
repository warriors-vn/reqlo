import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Search,
  FolderClosed,
  ChevronRight,
  ChevronDown,
  GripVertical,
  Trash2,
  Star,
  Heart,
  Inbox,
  MoreHorizontal,
  Download,
  Pencil,
  CopyPlus,
  FolderGit2,
  Sun,
  Moon,
  CheckCircle2,
  Circle,
  X,
  Play,
  Upload,
  Terminal,
} from "lucide-react";
import { useStore } from "@/stores/useStore";
import { useIsDarkMode } from "@/hooks/useIsDarkMode";
import { applyTheme, setStoredTheme } from "@/lib/theme";
import { getRecent } from "@/core/commands/recent";
import { runCommand } from "@/hooks/useCommandSystem";
import { MethodBadge } from "./MethodBadge";
import { LazyConfirmDeleteDialog as ConfirmDeleteDialog } from "./LazyConfirmDeleteDialog";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
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

export function Sidebar() {
  const {
    collections,
    folders,
    requests,
    history,
    openRequest,
    activeTabId,
    tabs,
    createRequest,
    createCollection,
    renameCollection,
    moveRequestToCollection,
    reorderRequests,
    deleteRequest,
    duplicateRequest,
    duplicateCollection,
    deleteCollection,
    createFolder,
    renameFolder,
    deleteFolder,
    reorderFolders,
    moveFolderToParent,
    moveRequestToFolder,
    toggleFavorite,
    exportCollectionById,
    exportCollectionAsFilesById,
    reorderCollections,
    setPalette,
    sidebarTree,
    setSidebarTreeOpen,
  } = useStore();
  const [query, setQuery] = useState("");
  const [newCollectionName, setNewCollectionName] = useState("");
  const [renamingCollectionId, setRenamingCollectionId] = useState<string | null>(null);
  const [collectionNameDraft, setCollectionNameDraft] = useState("");
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [folderNameDraft, setFolderNameDraft] = useState("");
  const [draggedCollectionId, setDraggedCollectionId] = useState<string | null>(null);
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
  const [draggedRequest, setDraggedRequest] = useState<{
    id: string;
    collectionId: string | null;
    folderId: string | null;
  } | null>(null);
  const [collectionAppendTargetId, setCollectionAppendTargetId] = useState<string | null>(null);
  const [collectionReorderTargetId, setCollectionReorderTargetId] = useState<string | null>(null);
  const [folderAppendTargetId, setFolderAppendTargetId] = useState<string | null>(null);
  const [folderReorderTargetId, setFolderReorderTargetId] = useState<string | null>(null);
  const [requestDropTarget, setRequestDropTarget] = useState<{
    targetId: string | null;
    collectionId: string | null;
    folderId: string | null;
  } | null>(null);
  const [pendingDeleteRequestId, setPendingDeleteRequestId] = useState<string | null>(null);
  const [pendingDeleteCollectionId, setPendingDeleteCollectionId] = useState<string | null>(null);
  const [pendingDeleteFolderId, setPendingDeleteFolderId] = useState<string | null>(null);

  const activeRequestId = tabs.find((t) => t.id === activeTabId)?.requestId;
  const activeRequestObj = requests.find((request) => request.id === activeRequestId);
  const activeCollectionId = activeRequestObj?.collectionId ?? null;
  const activeFolderId = activeRequestObj?.folderId ?? null;
  const q = query.trim().toLowerCase();
  const dragEnabled = !q;
  const reorderRequestDrop = reorderRequests as (
    draggedId: string,
    targetId: string | null,
    collectionId: string | null,
    folderId: string | null,
  ) => Promise<void>;

  const filteredRequests = useMemo(
    () =>
      requests.filter(
        (request) =>
          !q || request.name.toLowerCase().includes(q) || request.url.toLowerCase().includes(q),
      ),
    [q, requests],
  );

  const filterReq = (cid: string | null) =>
    filteredRequests.filter((request) => request.collectionId === cid);

  const directRequests = (collectionId: string, folderId: string | null) =>
    filteredRequests.filter(
      (request) => request.collectionId === collectionId && request.folderId === folderId,
    );

  const favorites = useMemo(
    () => filteredRequests.filter((request) => request.favorite),
    [filteredRequests],
  );
  const unfiled = useMemo(
    () => filteredRequests.filter((request) => request.collectionId === null),
    [filteredRequests],
  );
  const collectionOptions = useMemo(
    () => collections.map((collection) => ({ id: collection.id, name: collection.name })),
    [collections],
  );

  const clearRequestDragState = () => {
    setDraggedRequest(null);
    setRequestDropTarget(null);
    setCollectionAppendTargetId(null);
    setFolderAppendTargetId(null);
  };

  const clearCollectionDragState = () => {
    setDraggedCollectionId(null);
    setCollectionReorderTargetId(null);
  };

  const clearFolderDragState = () => {
    setDraggedFolderId(null);
    setFolderReorderTargetId(null);
    setCollectionAppendTargetId(null);
    setFolderAppendTargetId(null);
  };

  useEffect(() => {
    if (!dragEnabled) {
      clearRequestDragState();
      clearCollectionDragState();
      clearFolderDragState();
    }
  }, [dragEnabled]);

  const createCollectionInline = async () => {
    const name = newCollectionName.trim();
    if (!name) return;
    await createCollection(name);
    setNewCollectionName("");
  };

  const startCollectionRename = (id: string, name: string) => {
    setRenamingCollectionId(id);
    setCollectionNameDraft(name);
  };

  const submitCollectionRename = async (id: string) => {
    const nextName = collectionNameDraft.trim();
    if (nextName) {
      await renameCollection(id, nextName);
    }
    setRenamingCollectionId(null);
    setCollectionNameDraft("");
  };

  const startFolderRename = (id: string, name: string) => {
    setRenamingFolderId(id);
    setFolderNameDraft(name);
  };

  const submitFolderRename = async (id: string) => {
    const nextName = folderNameDraft.trim();
    if (nextName) {
      await renameFolder(id, nextName);
    }
    setRenamingFolderId(null);
    setFolderNameDraft("");
  };

  const createFolderInline = async (collectionId: string, parentFolderId: string | null) => {
    const folder = await createFolder(collectionId, parentFolderId, "New folder");
    startFolderRename(folder.id, folder.name);
  };

  return (
    <aside
      aria-label="Sidebar"
      className="flex h-full w-72 shrink-0 flex-col border-r border-border bg-[var(--surface)]"
    >
      {/* Brand */}
      <div className="flex h-12 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="grid h-6 w-6 place-items-center rounded-md bg-primary text-3xs font-bold text-primary-foreground">
            R
          </div>
          <span className="text-sm font-semibold tracking-tight">Reqlo</span>
        </div>
        <div className="flex items-center gap-1">
          <ThemeSwitch />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground focus-ring"
                title="Import"
              >
                <Upload className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => runCommand("import.curl")}>
                <Terminal className="h-3.5 w-3.5" /> Import cURL
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => runCommand("import.collection")}>
                <Upload className="h-3.5 w-3.5" /> Import Collection
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => runCommand("import.postman")}>
                <Upload className="h-3.5 w-3.5" /> Import Postman Collection
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => runCommand("import.openapi")}>
                <Upload className="h-3.5 w-3.5" /> Import OpenAPI Spec
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            onClick={() => createRequest(activeCollectionId, activeFolderId)}
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground focus-ring"
            title="New request"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="space-y-2 px-3 pb-2">
        <label className="flex items-center gap-2 rounded-xl border border-border bg-[var(--surface-elevated)] px-2.5 py-2 text-xs text-muted-foreground transition focus-within:border-foreground/15">
          <Search className="h-3.5 w-3.5" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search requests…"
            aria-label="Search requests"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground/70"
          />
          <button
            type="button"
            onClick={() => setPalette(true)}
            className="rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-3xs text-muted-foreground/70 hover:text-foreground"
            title="Open command palette"
          >
            ⌘K
          </button>
        </label>
        <div className="grid grid-cols-2 gap-2 text-2xs text-muted-foreground">
          <SidebarStat label="Favorites" value={favorites.length} />
          <SidebarStat label="Collections" value={collections.length} />
        </div>
        <OnboardingChecklist requestCount={requests.length} historyCount={history.length} />
      </div>

      {/* Tree */}
      <nav
        aria-label="Collections and requests"
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-3"
      >
        <SidebarSection
          icon={<Heart className="h-3.5 w-3.5 text-muted-foreground" />}
          title="Favorites"
          count={favorites.length}
          open={sidebarTree.favorites}
          onToggle={() => setSidebarTreeOpen("favorites", !sidebarTree.favorites)}
        >
          <RequestList
            items={favorites}
            collections={collectionOptions}
            listCollectionId={null}
            listFolderId={null}
            reorderEnabled={false}
            draggedRequest={draggedRequest}
            requestDropTarget={requestDropTarget}
            activeRequestId={activeRequestId}
            onOpen={openRequest}
            onToggleFavorite={(id) => void toggleFavorite(id)}
            onMove={(id, collectionId) => void moveRequestToCollection(id, collectionId)}
            onDragStart={() => undefined}
            onDragEnd={clearRequestDragState}
            onReorder={() => undefined}
            onRequestDropTargetChange={() => undefined}
            onSectionAppendHover={() => undefined}
            onDuplicate={(id) => void duplicateRequest(id)}
            onDelete={(id) => setPendingDeleteRequestId(id)}
            emptyIcon={<Heart className="h-3.5 w-3.5" />}
            emptyTitle="No favorites yet"
            emptyHint="Star a request to pin it here"
          />
        </SidebarSection>

        <SidebarSection
          icon={<Inbox className="h-3.5 w-3.5 text-muted-foreground" />}
          title="Unfiled"
          count={unfiled.length}
          open={sidebarTree.unfiled}
          onToggle={() => setSidebarTreeOpen("unfiled", !sidebarTree.unfiled)}
          onDragOver={(event) => {
            if (!dragEnabled || !draggedRequest) return;
            event.preventDefault();
            setCollectionAppendTargetId("__unfiled__");
            setRequestDropTarget(null);
          }}
          onDrop={() => {
            if (!dragEnabled || !draggedRequest) return;
            void reorderRequestDrop(draggedRequest.id, null, null, null);
            clearRequestDragState();
          }}
          dropIndicator={
            collectionAppendTargetId === "__unfiled__" ? (
              <DropIndicator label="Drop to add to Unfiled" />
            ) : null
          }
        >
          <RequestList
            items={unfiled}
            collections={collectionOptions}
            listCollectionId={null}
            listFolderId={null}
            reorderEnabled={dragEnabled}
            draggedRequest={draggedRequest}
            requestDropTarget={requestDropTarget}
            activeRequestId={activeRequestId}
            onOpen={openRequest}
            onToggleFavorite={(id) => void toggleFavorite(id)}
            onMove={(id, collectionId) => void moveRequestToCollection(id, collectionId)}
            onDragStart={(id, collectionId, folderId) => {
              setDraggedRequest({ id, collectionId, folderId });
              setCollectionAppendTargetId(null);
              setRequestDropTarget(null);
            }}
            onDragEnd={clearRequestDragState}
            onReorder={(draggedId, targetId, collectionId, folderId) =>
              void reorderRequestDrop(draggedId, targetId, collectionId, folderId)
            }
            onRequestDropTargetChange={setRequestDropTarget}
            onSectionAppendHover={setCollectionAppendTargetId}
            onDuplicate={(id) => void duplicateRequest(id)}
            onDelete={(id) => setPendingDeleteRequestId(id)}
            emptyIcon={<Inbox className="h-3.5 w-3.5" />}
            emptyTitle="Nothing unfiled"
            emptyHint="Drag a request here to unfile it"
          />
        </SidebarSection>

        {collections.map((col) => {
          const isOpen = sidebarTree.collections[col.id] ?? true;
          const list = filterReq(col.id);
          return (
            <SidebarSection
              key={col.id}
              icon={<FolderClosed className="h-3.5 w-3.5 text-muted-foreground" />}
              title={
                renamingCollectionId === col.id ? (
                  <input
                    autoFocus
                    value={collectionNameDraft}
                    onChange={(event) => setCollectionNameDraft(event.target.value)}
                    onClick={(event) => event.stopPropagation()}
                    onBlur={() => void submitCollectionRename(col.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        event.currentTarget.blur();
                      }
                      if (event.key === "Escape") {
                        setRenamingCollectionId(null);
                        setCollectionNameDraft("");
                      }
                    }}
                    className="h-7 min-w-0 rounded-lg border border-border/80 bg-background/80 px-2 text-xs font-medium outline-none transition focus:border-foreground/15"
                  />
                ) : (
                  col.name
                )
              }
              count={list.length}
              open={isOpen}
              onToggle={() => setSidebarTreeOpen(col.id, !isOpen)}
              draggable={dragEnabled && renamingCollectionId !== col.id}
              dragging={draggedCollectionId === col.id}
              dragTargeted={collectionReorderTargetId === col.id}
              onDragStart={() => {
                setDraggedCollectionId(col.id);
                setCollectionReorderTargetId(null);
              }}
              onDragEnd={clearCollectionDragState}
              onDragOver={(event) => {
                if (dragEnabled && (draggedRequest || draggedFolderId)) {
                  event.preventDefault();
                  setCollectionAppendTargetId(col.id);
                  setRequestDropTarget(null);
                  return;
                }
                if (!dragEnabled || !draggedCollectionId || draggedCollectionId === col.id) return;
                event.preventDefault();
                setCollectionReorderTargetId(col.id);
              }}
              onDrop={() => {
                if (dragEnabled && draggedRequest) {
                  void reorderRequestDrop(draggedRequest.id, null, col.id, null);
                  clearRequestDragState();
                  return;
                }
                if (dragEnabled && draggedFolderId) {
                  const dragged = folders.find((f) => f.id === draggedFolderId);
                  if (dragged && dragged.collectionId === col.id) {
                    void moveFolderToParent(draggedFolderId, null);
                  }
                  clearFolderDragState();
                  return;
                }
                if (!draggedCollectionId || draggedCollectionId === col.id) return;
                void reorderCollections(draggedCollectionId, col.id);
                clearCollectionDragState();
              }}
              dropIndicator={
                collectionAppendTargetId === col.id ? (
                  <DropIndicator label={`Drop to add to ${col.name}`} />
                ) : collectionReorderTargetId === col.id ? (
                  <DropIndicator label={`Drop to reorder ${col.name}`} tone="muted" />
                ) : null
              }
              actions={
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      onClick={(event) => event.stopPropagation()}
                      className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
                      title={`${col.name} actions`}
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => {
                        startCollectionRename(col.id, col.name);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Rename collection
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void createRequest(col.id)}>
                      <Plus className="h-3.5 w-3.5" /> New request in collection
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void createFolderInline(col.id, null)}>
                      <FolderClosed className="h-3.5 w-3.5" /> New folder
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void duplicateCollection(col.id)}>
                      <CopyPlus className="h-3.5 w-3.5" /> Duplicate collection
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() =>
                        useStore.getState().startRun({ type: "collection", id: col.id })
                      }
                    >
                      <Play className="h-3.5 w-3.5" /> Run all requests
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => void exportCollectionById(col.id)}>
                      <Download className="h-3.5 w-3.5" /> Export collection
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void exportCollectionAsFilesById(col.id)}>
                      <FolderGit2 className="h-3.5 w-3.5" /> Export as files (git-friendly)
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => setPendingDeleteCollectionId(col.id)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete collection
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              }
            >
              <FolderTree
                collectionId={col.id}
                parentFolderId={null}
                folders={folders}
                requests={filteredRequests}
                collections={collectionOptions}
                dragEnabled={dragEnabled}
                draggedRequest={draggedRequest}
                requestDropTarget={requestDropTarget}
                draggedFolderId={draggedFolderId}
                folderReorderTargetId={folderReorderTargetId}
                folderAppendTargetId={folderAppendTargetId}
                activeRequestId={activeRequestId}
                openMap={sidebarTree.collections}
                renamingFolderId={renamingFolderId}
                folderNameDraft={folderNameDraft}
                onFolderNameDraftChange={setFolderNameDraft}
                onToggleFolderOpen={(id, open) => setSidebarTreeOpen(id, open)}
                onStartFolderRename={startFolderRename}
                onSubmitFolderRename={submitFolderRename}
                onCancelFolderRename={() => {
                  setRenamingFolderId(null);
                  setFolderNameDraft("");
                }}
                onOpen={openRequest}
                onToggleFavorite={(id) => void toggleFavorite(id)}
                onMove={(id, collectionId) => void moveRequestToCollection(id, collectionId)}
                onDragStartRequest={(id, collectionId, folderId) => {
                  setDraggedRequest({ id, collectionId, folderId });
                  setCollectionAppendTargetId(null);
                  setFolderAppendTargetId(null);
                  setRequestDropTarget(null);
                }}
                onDragEndRequest={clearRequestDragState}
                onReorderRequest={(draggedId, targetId, collectionId, folderId) =>
                  void reorderRequestDrop(draggedId, targetId, collectionId, folderId)
                }
                onRequestDropTargetChange={setRequestDropTarget}
                onDuplicateRequest={(id) => void duplicateRequest(id)}
                onDeleteRequest={(id) => setPendingDeleteRequestId(id)}
                onDropRequestIntoFolder={(requestId, collectionId, folderId) =>
                  void moveRequestToFolder(requestId, collectionId, folderId)
                }
                onDragStartFolder={(id) => {
                  setDraggedFolderId(id);
                  setFolderReorderTargetId(null);
                }}
                onDragEndFolder={clearFolderDragState}
                onFolderAppendHover={setFolderAppendTargetId}
                onFolderReorderTargetChange={setFolderReorderTargetId}
                onFolderDrop={(targetFolderId) => {
                  const dragged = folders.find((f) => f.id === draggedFolderId);
                  const target = folders.find((f) => f.id === targetFolderId);
                  if (!dragged || !target || dragged.id === target.id) return;
                  if (dragged.parentFolderId === target.parentFolderId) {
                    void reorderFolders(dragged.id, target.id);
                  } else {
                    void moveFolderToParent(dragged.id, target.id);
                  }
                }}
                onNewFolder={(collectionId, parentFolderId) =>
                  void createFolderInline(collectionId, parentFolderId)
                }
                onNewRequestInFolder={(collectionId, folderId) =>
                  void createRequest(collectionId, folderId)
                }
                onDeleteFolderRequest={(id) => setPendingDeleteFolderId(id)}
              />
            </SidebarSection>
          );
        })}

        {collections.length === 0 && !q ? <CollectionsEmptyState /> : null}

        <div className="mt-3 rounded-2xl border border-border/80 bg-background/50 p-2">
          <div className="mb-2 flex items-center gap-2 px-1 text-2xs font-medium text-muted-foreground">
            <Plus className="h-3.5 w-3.5" /> New collection
          </div>
          <div className="flex items-center gap-2">
            <input
              value={newCollectionName}
              onChange={(event) => setNewCollectionName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void createCollectionInline();
                }
              }}
              placeholder="Collection name"
              className="h-9 min-w-0 flex-1 rounded-xl border border-border/80 bg-background/80 px-3 text-xs outline-none transition focus:border-foreground/15"
            />
            <button
              type="button"
              onClick={() => void createCollectionInline()}
              disabled={!newCollectionName.trim()}
              className="inline-flex h-9 items-center rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>
      </nav>

      <div className="border-t border-border px-4 py-2 text-3xs text-muted-foreground/70">
        Local-first · {requests.length} requests
      </div>

      <ConfirmDeleteDialog
        open={pendingDeleteRequestId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteRequestId(null);
        }}
        title="Delete request"
        description={
          pendingDeleteRequestId
            ? `"${requests.find((request) => request.id === pendingDeleteRequestId)?.name ?? "This request"}" will be deleted. You can undo this from the toast for a few seconds afterward.`
            : ""
        }
        onConfirm={() => {
          if (pendingDeleteRequestId) void deleteRequest(pendingDeleteRequestId);
          setPendingDeleteRequestId(null);
        }}
      />

      <ConfirmDeleteDialog
        open={pendingDeleteCollectionId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteCollectionId(null);
        }}
        title="Delete collection"
        description={(() => {
          const collection = collections.find((c) => c.id === pendingDeleteCollectionId);
          if (!collection) return "";
          const count = requests.filter((r) => r.collectionId === collection.id).length;
          return `"${collection.name}" and its ${count} request${count === 1 ? "" : "s"} will be permanently deleted. This can't be undone.`;
        })()}
        onConfirm={() => {
          if (pendingDeleteCollectionId) void deleteCollection(pendingDeleteCollectionId);
          setPendingDeleteCollectionId(null);
        }}
      />

      <ConfirmDeleteDialog
        open={pendingDeleteFolderId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteFolderId(null);
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
          if (pendingDeleteFolderId) void deleteFolder(pendingDeleteFolderId);
          setPendingDeleteFolderId(null);
        }}
      />
    </aside>
  );
}

function SidebarSection({
  icon,
  title,
  count,
  open,
  onToggle,
  draggable,
  dragging,
  dragTargeted,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  actions,
  dropIndicator,
  children,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  count: number;
  open: boolean;
  onToggle: () => void;
  draggable?: boolean;
  dragging?: boolean;
  dragTargeted?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDragOver?: (event: React.DragEvent<HTMLButtonElement>) => void;
  onDrop?: () => void;
  actions?: React.ReactNode;
  dropIndicator?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-1.5">
      <div className="group flex items-center gap-1">
        <button
          onClick={onToggle}
          aria-expanded={open}
          draggable={draggable}
          onDragStart={() => onDragStart?.()}
          onDragEnd={() => onDragEnd?.()}
          onDragOver={onDragOver}
          onDrop={() => onDrop?.()}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-foreground/70 transition hover:bg-accent focus-ring",
            dragTargeted && "bg-primary/6 text-foreground ring-1 ring-primary/20",
          )}
        >
          {draggable ? (
            <GripVertical
              className={cn("h-3.5 w-3.5 text-muted-foreground/70", dragging && "text-primary")}
            />
          ) : null}
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          {icon}
          <span className="min-w-0 flex-1 truncate text-left">{title}</span>
          <span className="text-3xs text-muted-foreground/70">{count}</span>
        </button>
        {actions}
      </div>
      {dropIndicator}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
            className="overflow-hidden"
          >
            <div className="ml-2 mt-0.5 border-l border-border pl-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface FolderTreeProps {
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

function FolderTree(props: FolderTreeProps) {
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

function RequestList({
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
  onDuplicate,
  onDelete,
  emptyIcon = <Inbox className="h-3.5 w-3.5" />,
  emptyTitle = "No requests",
  emptyHint,
}: {
  items: Array<{
    id: string;
    method: Parameters<typeof MethodBadge>[0]["method"];
    name: string;
    favorite?: boolean;
    collectionId?: string | null;
  }>;
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

  return (
    <>
      {items.map((request) => (
        <div key={request.id}>
          {requestDropTarget?.targetId === request.id &&
          requestDropTarget.collectionId === listCollectionId &&
          requestDropTarget.folderId === listFolderId ? (
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
              if (!reorderEnabled || !draggedRequest || draggedRequest.id === request.id) {
                return;
              }
              event.preventDefault();
              onSectionAppendHover(null);
              onRequestDropTargetChange({
                targetId: request.id,
                collectionId: listCollectionId,
                folderId: listFolderId,
              });
            }}
            onDrop={() => {
              if (!reorderEnabled || !draggedRequest || draggedRequest.id === request.id) {
                return;
              }
              onReorder(draggedRequest.id, request.id, listCollectionId, listFolderId);
              onDragEnd();
            }}
            className={cn(
              "group flex items-center gap-2 rounded-md px-2 py-1.5 transition",
              activeRequestId === request.id
                ? "bg-accent text-accent-foreground"
                : "hover:bg-accent/60",
              reorderEnabled && "cursor-grab active:cursor-grabbing",
              requestDropTarget?.targetId === request.id &&
                requestDropTarget.collectionId === listCollectionId &&
                requestDropTarget.folderId === listFolderId &&
                "bg-primary/5 ring-1 ring-primary/15",
            )}
          >
            {reorderEnabled ? (
              <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
            ) : null}
            <button
              type="button"
              onClick={() => onOpen(request.id)}
              aria-current={activeRequestId === request.id ? "true" : undefined}
              className="flex min-w-0 flex-1 items-center gap-2 rounded text-left focus-ring"
            >
              <MethodBadge method={request.method} className="w-10 shrink-0 text-right" />
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
      ))}
    </>
  );
}

function DropIndicator({
  label,
  tone = "primary",
  compact = false,
}: {
  label: string;
  tone?: "primary" | "muted";
  compact?: boolean;
}) {
  return (
    <div className={cn("px-2", compact ? "py-1" : "py-1.5")}>
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "h-px flex-1",
            tone === "primary" ? "bg-primary/45" : "bg-muted-foreground/35",
          )}
        />
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-3xs font-medium",
            tone === "primary"
              ? "border-primary/25 bg-primary/8 text-primary"
              : "border-border bg-background/70 text-muted-foreground",
          )}
        >
          {label}
        </span>
        <div
          className={cn(
            "h-px flex-1",
            tone === "primary" ? "bg-primary/45" : "bg-muted-foreground/35",
          )}
        />
      </div>
    </div>
  );
}

function CollectionsEmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="mt-3 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border/70 px-4 py-6 text-center"
    >
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
        <FolderClosed className="h-4 w-4" />
      </div>
      <div className="text-xs font-medium text-foreground">No collections yet</div>
      <p className="text-2xs leading-4 text-muted-foreground">
        Group related requests together to keep your workspace tidy.
      </p>
    </motion.div>
  );
}

const ONBOARDING_DISMISSED_KEY = "reqlo:onboarding-dismissed";
// ensureSeed() (db.ts) always creates exactly 3 sample requests — once the
// workspace has more than that, the user has created one of their own.
const SEEDED_REQUEST_COUNT = 3;

function OnboardingChecklist({
  requestCount,
  historyCount,
}: {
  requestCount: number;
  historyCount: number;
}) {
  const paletteOpen = useStore((s) => s.overlays.palette);
  const isDark = useIsDarkMode();
  const initialIsDark = useRef(isDark);

  const [dismissed, setDismissed] = useState(
    () =>
      typeof localStorage !== "undefined" && localStorage.getItem(ONBOARDING_DISMISSED_KEY) === "1",
  );
  const [usedPalette, setUsedPalette] = useState(() => getRecent().length > 0);
  const [usedTheme, setUsedTheme] = useState(
    () => typeof localStorage !== "undefined" && localStorage.getItem("reqlo:theme") !== null,
  );

  useEffect(() => {
    if (paletteOpen) setUsedPalette(true);
  }, [paletteOpen]);

  useEffect(() => {
    if (isDark !== initialIsDark.current) setUsedTheme(true);
  }, [isDark]);

  const items = [
    { done: historyCount > 0, label: "Send a request" },
    { done: usedPalette, label: "Open the command palette (⌘K)" },
    { done: requestCount > SEEDED_REQUEST_COUNT, label: "Create a request of your own" },
    { done: usedTheme, label: "Try dark mode" },
  ];
  const doneCount = items.filter((item) => item.done).length;
  const complete = doneCount === items.length;

  useEffect(() => {
    if (complete) localStorage.setItem(ONBOARDING_DISMISSED_KEY, "1");
  }, [complete]);

  if (dismissed || complete) return null;

  return (
    <div className="rounded-xl border border-border/80 bg-background/70 p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-3xs font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
          Getting started
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-3xs text-muted-foreground">
            {doneCount}/{items.length}
          </span>
          <button
            type="button"
            onClick={() => {
              setDismissed(true);
              localStorage.setItem(ONBOARDING_DISMISSED_KEY, "1");
            }}
            aria-label="Dismiss getting-started checklist"
            className="grid h-4 w-4 place-items-center rounded text-muted-foreground/70 hover:bg-accent hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-1.5 text-2xs">
            {item.done ? (
              <CheckCircle2 className="h-3 w-3 shrink-0 text-primary" />
            ) : (
              <Circle className="h-3 w-3 shrink-0 text-muted-foreground/40" />
            )}
            <span
              className={cn(
                item.done ? "text-muted-foreground line-through" : "text-foreground/80",
              )}
            >
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SidebarStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/80 bg-background/70 px-2.5 py-2">
      <div className="text-3xs uppercase tracking-[0.16em] text-muted-foreground/80">{label}</div>
      <div className="mt-1 text-sm font-semibold tracking-tight text-foreground">{value}</div>
    </div>
  );
}

function ThemeSwitch() {
  const isDark = useIsDarkMode();
  return (
    <button
      onClick={() => {
        const next = isDark ? "light" : "dark";
        setStoredTheme(next);
        applyTheme(next);
      }}
      className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground focus-ring"
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

function collectDescendantFolderIds(
  folders: Array<{ id: string; parentFolderId: string | null }>,
  rootId: string,
): string[] {
  const children = folders.filter((folder) => folder.parentFolderId === rootId);
  return children.flatMap((child) => [child.id, ...collectDescendantFolderIds(folders, child.id)]);
}
