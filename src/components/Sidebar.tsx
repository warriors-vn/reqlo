import { useEffect, useMemo, useState } from "react";
import { Search, FolderClosed, Heart, Inbox } from "lucide-react";
import { useStore } from "@/stores/useStore";
import { CollectionsEmptyState } from "./sidebar/CollectionsEmptyState";
import { DropIndicator } from "./sidebar/DropIndicator";
import { FolderTree } from "./sidebar/FolderTree";
import { OnboardingChecklist } from "./sidebar/OnboardingChecklist";
import { RequestList } from "./sidebar/RequestList";
import { SidebarSection } from "./sidebar/SidebarSection";
import { SidebarStat } from "./sidebar/SidebarStat";
import { SidebarBrandRow } from "./sidebar/SidebarBrandRow";
import { NewCollectionForm } from "./sidebar/NewCollectionForm";
import { SidebarDeleteDialogs } from "./sidebar/SidebarDeleteDialogs";
import { CollectionActionsMenu } from "./sidebar/CollectionActionsMenu";

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
    renameRequest,
    requestPrompt,
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
    openDefaultsEditor,
    exportCollectionAsFilesById,
    exportCollectionAsPostman,
    exportCollectionAsOpenApi,
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

  const startRequestRename = async (id: string) => {
    const target = requests.find((r) => r.id === id);
    if (!target) return;
    const name = await requestPrompt({ title: "Rename request", defaultValue: target.name });
    if (name) await renameRequest(id, name);
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
      <SidebarBrandRow
        onCreateRequest={(protocol) =>
          void createRequest(activeCollectionId, activeFolderId, protocol)
        }
      />

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
            onRename={(id) => void startRequestRename(id)}
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
            onRename={(id) => void startRequestRename(id)}
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
                <CollectionActionsMenu
                  collection={col}
                  onRename={() => startCollectionRename(col.id, col.name)}
                  onCreateRequest={(protocol) => void createRequest(col.id, null, protocol)}
                  onCreateFolder={() => void createFolderInline(col.id, null)}
                  onDuplicate={() => void duplicateCollection(col.id)}
                  onOpenSettings={() => openDefaultsEditor({ type: "collection", id: col.id })}
                  onExportJson={() => void exportCollectionById(col.id)}
                  onExportFiles={() => void exportCollectionAsFilesById(col.id)}
                  onExportPostman={() => void exportCollectionAsPostman(col.id)}
                  onExportOpenApi={() => void exportCollectionAsOpenApi(col.id)}
                  onDelete={() => setPendingDeleteCollectionId(col.id)}
                />
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
                onRenameRequest={(id) => void startRequestRename(id)}
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

        <NewCollectionForm
          value={newCollectionName}
          onChange={setNewCollectionName}
          onSubmit={() => void createCollectionInline()}
        />
      </nav>

      <div className="border-t border-border px-4 py-2 text-3xs text-muted-foreground/70">
        Local-first · {requests.length} requests
      </div>

      <SidebarDeleteDialogs
        requests={requests}
        collections={collections}
        folders={folders}
        pendingDeleteRequestId={pendingDeleteRequestId}
        pendingDeleteCollectionId={pendingDeleteCollectionId}
        pendingDeleteFolderId={pendingDeleteFolderId}
        onCancelDeleteRequest={() => setPendingDeleteRequestId(null)}
        onCancelDeleteCollection={() => setPendingDeleteCollectionId(null)}
        onCancelDeleteFolder={() => setPendingDeleteFolderId(null)}
        onConfirmDeleteRequest={(id) => {
          void deleteRequest(id);
          setPendingDeleteRequestId(null);
        }}
        onConfirmDeleteCollection={(id) => {
          void deleteCollection(id);
          setPendingDeleteCollectionId(null);
        }}
        onConfirmDeleteFolder={(id) => {
          void deleteFolder(id);
          setPendingDeleteFolderId(null);
        }}
      />
    </aside>
  );
}
