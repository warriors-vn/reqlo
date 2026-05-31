import { useMemo, useState } from "react";
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
} from "lucide-react";
import { useStore } from "@/stores/useStore";
import { MethodBadge } from "./MethodBadge";
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
    requests,
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
    toggleFavorite,
    exportCollectionById,
    reorderCollections,
    setPalette,
    sidebarTree,
    setSidebarTreeOpen,
  } = useStore();
  const [query, setQuery] = useState("");
  const [newCollectionName, setNewCollectionName] = useState("");
  const [renamingCollectionId, setRenamingCollectionId] = useState<string | null>(null);
  const [collectionNameDraft, setCollectionNameDraft] = useState("");
  const [draggedCollectionId, setDraggedCollectionId] = useState<string | null>(null);
  const [draggedRequest, setDraggedRequest] = useState<{
    id: string;
    collectionId: string | null;
  } | null>(null);

  const activeRequestId = tabs.find((t) => t.id === activeTabId)?.requestId;
  const q = query.trim().toLowerCase();
  const dragEnabled = !q;

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

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-border bg-[var(--surface)]">
      {/* Brand */}
      <div className="flex h-12 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="grid h-6 w-6 place-items-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground">
            R
          </div>
          <span className="text-sm font-semibold tracking-tight">Reqlo</span>
        </div>
        <button
          onClick={() => createRequest(collections[0]?.id ?? null)}
          className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground focus-ring"
          title="New request"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Search */}
      <div className="space-y-2 px-3 pb-2">
        <label className="flex items-center gap-2 rounded-xl border border-border bg-[var(--surface-elevated)] px-2.5 py-2 text-xs text-muted-foreground transition focus-within:border-foreground/15">
          <Search className="h-3.5 w-3.5" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search requests…"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground/70"
          />
          <button
            type="button"
            onClick={() => setPalette(true)}
            className="rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/70 hover:text-foreground"
            title="Open command palette"
          >
            ⌘K
          </button>
        </label>
        <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
          <SidebarStat label="Favorites" value={favorites.length} />
          <SidebarStat label="Collections" value={collections.length} />
        </div>
      </div>

      {/* Tree */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
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
            reorderEnabled={false}
            draggedRequest={draggedRequest}
            activeRequestId={activeRequestId}
            onOpen={openRequest}
            onToggleFavorite={(id) => void toggleFavorite(id)}
            onMove={(id, collectionId) => void moveRequestToCollection(id, collectionId)}
            onDragStart={() => undefined}
            onDragEnd={() => setDraggedRequest(null)}
            onReorder={() => undefined}
            onDuplicate={(id) => void duplicateRequest(id)}
            onDelete={(id) => void deleteRequest(id)}
          />
        </SidebarSection>

        <SidebarSection
          icon={<Inbox className="h-3.5 w-3.5 text-muted-foreground" />}
          title="Unfiled"
          count={unfiled.length}
          open={sidebarTree.unfiled}
          onToggle={() => setSidebarTreeOpen("unfiled", !sidebarTree.unfiled)}
        >
          <RequestList
            items={unfiled}
            collections={collectionOptions}
            listCollectionId={null}
            reorderEnabled={dragEnabled}
            draggedRequest={draggedRequest}
            activeRequestId={activeRequestId}
            onOpen={openRequest}
            onToggleFavorite={(id) => void toggleFavorite(id)}
            onMove={(id, collectionId) => void moveRequestToCollection(id, collectionId)}
            onDragStart={(id, collectionId) => setDraggedRequest({ id, collectionId })}
            onDragEnd={() => setDraggedRequest(null)}
            onReorder={(draggedId, targetId, collectionId) =>
              void reorderRequests(draggedId, targetId, collectionId)
            }
            onDuplicate={(id) => void duplicateRequest(id)}
            onDelete={(id) => void deleteRequest(id)}
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
                        void submitCollectionRename(col.id);
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
              onDragStart={() => setDraggedCollectionId(col.id)}
              onDragEnd={() => setDraggedCollectionId(null)}
              onDragOver={(event) => {
                if (!dragEnabled || !draggedCollectionId || draggedCollectionId === col.id) return;
                event.preventDefault();
              }}
              onDrop={() => {
                if (!draggedCollectionId || draggedCollectionId === col.id) return;
                void reorderCollections(draggedCollectionId, col.id);
                setDraggedCollectionId(null);
              }}
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
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => void exportCollectionById(col.id)}>
                      <Download className="h-3.5 w-3.5" /> Export collection
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              }
            >
              <RequestList
                items={list}
                collections={collectionOptions}
                listCollectionId={col.id}
                reorderEnabled={dragEnabled}
                draggedRequest={draggedRequest}
                activeRequestId={activeRequestId}
                onOpen={openRequest}
                onToggleFavorite={(id) => void toggleFavorite(id)}
                onMove={(id, collectionId) => void moveRequestToCollection(id, collectionId)}
                onDragStart={(id, collectionId) => setDraggedRequest({ id, collectionId })}
                onDragEnd={() => setDraggedRequest(null)}
                onReorder={(draggedId, targetId, collectionId) =>
                  void reorderRequests(draggedId, targetId, collectionId)
                }
                onDuplicate={(id) => void duplicateRequest(id)}
                onDelete={(id) => void deleteRequest(id)}
              />
            </SidebarSection>
          );
        })}

        <div className="mt-3 rounded-2xl border border-border/80 bg-background/50 p-2">
          <div className="mb-2 flex items-center gap-2 px-1 text-[11px] font-medium text-muted-foreground">
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
      </div>

      <div className="border-t border-border px-4 py-2 text-[10px] text-muted-foreground/70">
        Local-first · {requests.length} requests
      </div>
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
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  actions,
  children,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  count: number;
  open: boolean;
  onToggle: () => void;
  draggable?: boolean;
  dragging?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDragOver?: (event: React.DragEvent<HTMLButtonElement>) => void;
  onDrop?: () => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-1.5">
      <div className="group flex items-center gap-1">
        <button
          onClick={onToggle}
          draggable={draggable}
          onDragStart={() => onDragStart?.()}
          onDragEnd={() => onDragEnd?.()}
          onDragOver={onDragOver}
          onDrop={() => onDrop?.()}
          className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-foreground/70 transition hover:bg-accent focus-ring"
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
          <span className="text-[10px] text-muted-foreground/70">{count}</span>
        </button>
        {actions}
      </div>

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

function RequestList({
  items,
  collections,
  listCollectionId,
  reorderEnabled,
  draggedRequest,
  activeRequestId,
  onOpen,
  onToggleFavorite,
  onMove,
  onDragStart,
  onDragEnd,
  onReorder,
  onDuplicate,
  onDelete,
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
  reorderEnabled: boolean;
  draggedRequest: { id: string; collectionId: string | null } | null;
  activeRequestId?: string;
  onOpen: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onMove: (id: string, collectionId: string | null) => void;
  onDragStart: (id: string, collectionId: string | null) => void;
  onDragEnd: () => void;
  onReorder: (draggedId: string, targetId: string, collectionId: string | null) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (items.length === 0) {
    return <div className="px-2 py-1 text-[11px] text-muted-foreground/60">No requests</div>;
  }

  return (
    <>
      {items.map((request) => (
        <div
          key={request.id}
          draggable={reorderEnabled}
          onDragStart={(event) => {
            if (!reorderEnabled) return;
            event.dataTransfer.effectAllowed = "move";
            onDragStart(request.id, listCollectionId);
          }}
          onDragEnd={onDragEnd}
          onDragOver={(event) => {
            if (
              !reorderEnabled ||
              !draggedRequest ||
              draggedRequest.collectionId !== listCollectionId ||
              draggedRequest.id === request.id
            ) {
              return;
            }
            event.preventDefault();
          }}
          onDrop={() => {
            if (
              !reorderEnabled ||
              !draggedRequest ||
              draggedRequest.collectionId !== listCollectionId ||
              draggedRequest.id === request.id
            ) {
              return;
            }
            onReorder(draggedRequest.id, request.id, listCollectionId);
            onDragEnd();
          }}
          className={cn(
            "group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition",
            activeRequestId === request.id
              ? "bg-accent text-accent-foreground"
              : "hover:bg-accent/60",
            reorderEnabled && "cursor-grab active:cursor-grabbing",
          )}
          onClick={() => onOpen(request.id)}
        >
          {reorderEnabled ? (
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground/60" />
          ) : null}
          <MethodBadge method={request.method} className="w-10 shrink-0 text-right" />
          <span className="truncate text-xs">{request.name || "Untitled"}</span>
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
      ))}
    </>
  );
}

function SidebarStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/80 bg-background/70 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/80">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold tracking-tight text-foreground">{value}</div>
    </div>
  );
}
