import { useCallback, useMemo, useState } from "react";
import { Search, FolderClosed, Heart, Inbox } from "lucide-react";
import { useStore } from "@/stores/useStore";
import { useShallow } from "zustand/react/shallow";
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
import { useInlineRename } from "./sidebar/useInlineRename";
import { useSidebarDnd } from "./sidebar/useSidebarDnd";

// A stable no-op for list slots (favorites) that don't support the
// interaction at all — a fresh arrow function here would change identity
// every render and defeat RequestList's row memoization for no reason.
const noop = () => undefined;

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
  } = useStore(
    useShallow((state) => ({
      collections: state.collections,
      folders: state.folders,
      requests: state.requests,
      history: state.history,
      openRequest: state.openRequest,
      activeTabId: state.activeTabId,
      tabs: state.tabs,
      createRequest: state.createRequest,
      createCollection: state.createCollection,
      renameCollection: state.renameCollection,
      moveRequestToCollection: state.moveRequestToCollection,
      reorderRequests: state.reorderRequests,
      deleteRequest: state.deleteRequest,
      duplicateRequest: state.duplicateRequest,
      renameRequest: state.renameRequest,
      requestPrompt: state.requestPrompt,
      duplicateCollection: state.duplicateCollection,
      deleteCollection: state.deleteCollection,
      createFolder: state.createFolder,
      renameFolder: state.renameFolder,
      deleteFolder: state.deleteFolder,
      reorderFolders: state.reorderFolders,
      moveFolderToParent: state.moveFolderToParent,
      moveRequestToFolder: state.moveRequestToFolder,
      toggleFavorite: state.toggleFavorite,
      exportCollectionById: state.exportCollectionById,
      openDefaultsEditor: state.openDefaultsEditor,
      exportCollectionAsFilesById: state.exportCollectionAsFilesById,
      exportCollectionAsPostman: state.exportCollectionAsPostman,
      exportCollectionAsOpenApi: state.exportCollectionAsOpenApi,
      reorderCollections: state.reorderCollections,
      setPalette: state.setPalette,
      sidebarTree: state.sidebarTree,
      setSidebarTreeOpen: state.setSidebarTreeOpen,
    })),
  );
  const [query, setQuery] = useState("");
  const [newCollectionName, setNewCollectionName] = useState("");
  const [pendingDeleteRequestId, setPendingDeleteRequestId] = useState<string | null>(null);
  const [pendingDeleteCollectionId, setPendingDeleteCollectionId] = useState<string | null>(null);
  const [pendingDeleteFolderId, setPendingDeleteFolderId] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const dragEnabled = !q;

  const collectionRename = useInlineRename(renameCollection);
  const folderRename = useInlineRename(renameFolder);
  const dnd = useSidebarDnd(dragEnabled);

  const activeRequestId = tabs.find((t) => t.id === activeTabId)?.requestId;
  const activeRequestObj = requests.find((request) => request.id === activeRequestId);
  const activeCollectionId = activeRequestObj?.collectionId ?? null;
  const activeFolderId = activeRequestObj?.folderId ?? null;

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

  // Reads `requests` imperatively (rather than closing over the component's
  // own `requests` prop) so this callback's identity doesn't change on every
  // keystroke made while editing a request elsewhere — it's threaded down
  // through FolderTree/RequestList to every row via `onRename`.
  const startRequestRename = useCallback(
    async (id: string) => {
      const target = useStore.getState().requests.find((r) => r.id === id);
      if (!target) return;
      const name = await requestPrompt({ title: "Rename request", defaultValue: target.name });
      if (name) await renameRequest(id, name);
    },
    [requestPrompt, renameRequest],
  );

  const createFolderInline = useCallback(
    async (collectionId: string, parentFolderId: string | null) => {
      const folder = await createFolder(collectionId, parentFolderId, "New folder");
      folderRename.start(folder.id, folder.name);
    },
    [createFolder, folderRename],
  );

  const onNewFolder = useCallback(
    (collectionId: string, parentFolderId: string | null) =>
      void createFolderInline(collectionId, parentFolderId),
    [createFolderInline],
  );

  // Reads `folders` imperatively for the same reason as startRequestRename
  // above — this is the single `onFolderDrop` shared by every folder in
  // every collection via FolderTree's recursion.
  const onFolderDrop = useCallback(
    (targetFolderId: string) => {
      const allFolders = useStore.getState().folders;
      const dragged = allFolders.find((f) => f.id === dnd.draggedFolderId);
      const target = allFolders.find((f) => f.id === targetFolderId);
      if (!dragged || !target || dragged.id === target.id) return;
      if (dragged.parentFolderId === target.parentFolderId) {
        void reorderFolders(dragged.id, target.id);
      } else {
        void moveFolderToParent(dragged.id, target.id);
      }
    },
    [dnd.draggedFolderId, reorderFolders, moveFolderToParent],
  );

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
            draggedRequest={dnd.draggedRequest}
            requestDropTarget={dnd.requestDropTarget}
            activeRequestId={activeRequestId}
            onOpen={openRequest}
            onToggleFavorite={toggleFavorite}
            onMove={moveRequestToCollection}
            onDragStart={noop}
            onDragEnd={dnd.clearRequestDragState}
            onReorder={noop}
            onRequestDropTargetChange={noop}
            onSectionAppendHover={noop}
            onRename={startRequestRename}
            onDuplicate={duplicateRequest}
            onDelete={setPendingDeleteRequestId}
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
            if (!dragEnabled || !dnd.draggedRequest) return;
            event.preventDefault();
            dnd.setCollectionAppendTargetId("__unfiled__");
            dnd.setRequestDropTarget(null);
          }}
          onDrop={() => {
            if (!dragEnabled || !dnd.draggedRequest) return;
            void reorderRequests(dnd.draggedRequest.id, null, null, null);
            dnd.clearRequestDragState();
          }}
          dropIndicator={
            dnd.collectionAppendTargetId === "__unfiled__" ? (
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
            draggedRequest={dnd.draggedRequest}
            requestDropTarget={dnd.requestDropTarget}
            activeRequestId={activeRequestId}
            onOpen={openRequest}
            onToggleFavorite={toggleFavorite}
            onMove={moveRequestToCollection}
            onDragStart={dnd.startRequestDrag}
            onDragEnd={dnd.clearRequestDragState}
            onReorder={reorderRequests}
            onRequestDropTargetChange={dnd.setRequestDropTarget}
            onSectionAppendHover={dnd.setCollectionAppendTargetId}
            onRename={startRequestRename}
            onDuplicate={duplicateRequest}
            onDelete={setPendingDeleteRequestId}
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
                collectionRename.renamingId === col.id ? (
                  <input
                    autoFocus
                    value={collectionRename.draft}
                    onChange={(event) => collectionRename.setDraft(event.target.value)}
                    onClick={(event) => event.stopPropagation()}
                    onBlur={() => void collectionRename.submit(col.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        event.currentTarget.blur();
                      }
                      if (event.key === "Escape") collectionRename.cancel();
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
              draggable={dragEnabled && collectionRename.renamingId !== col.id}
              dragging={dnd.draggedCollectionId === col.id}
              dragTargeted={dnd.collectionReorderTargetId === col.id}
              onDragStart={() => dnd.startCollectionDrag(col.id)}
              onDragEnd={dnd.clearCollectionDragState}
              onDragOver={(event) => {
                if (dragEnabled && (dnd.draggedRequest || dnd.draggedFolderId)) {
                  event.preventDefault();
                  dnd.setCollectionAppendTargetId(col.id);
                  dnd.setRequestDropTarget(null);
                  return;
                }
                if (
                  !dragEnabled ||
                  !dnd.draggedCollectionId ||
                  dnd.draggedCollectionId === col.id
                ) {
                  return;
                }
                event.preventDefault();
                dnd.setCollectionReorderTargetId(col.id);
              }}
              onDrop={() => {
                if (dragEnabled && dnd.draggedRequest) {
                  void reorderRequests(dnd.draggedRequest.id, null, col.id, null);
                  dnd.clearRequestDragState();
                  return;
                }
                if (dragEnabled && dnd.draggedFolderId) {
                  const dragged = folders.find((f) => f.id === dnd.draggedFolderId);
                  if (dragged && dragged.collectionId === col.id) {
                    void moveFolderToParent(dnd.draggedFolderId, null);
                  }
                  dnd.clearFolderDragState();
                  return;
                }
                if (!dnd.draggedCollectionId || dnd.draggedCollectionId === col.id) return;
                void reorderCollections(dnd.draggedCollectionId, col.id);
                dnd.clearCollectionDragState();
              }}
              dropIndicator={
                dnd.collectionAppendTargetId === col.id ? (
                  <DropIndicator label={`Drop to add to ${col.name}`} />
                ) : dnd.collectionReorderTargetId === col.id ? (
                  <DropIndicator label={`Drop to reorder ${col.name}`} tone="muted" />
                ) : null
              }
              actions={
                <CollectionActionsMenu
                  collection={col}
                  onRename={() => collectionRename.start(col.id, col.name)}
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
                draggedRequest={dnd.draggedRequest}
                requestDropTarget={dnd.requestDropTarget}
                draggedFolderId={dnd.draggedFolderId}
                folderReorderTargetId={dnd.folderReorderTargetId}
                folderAppendTargetId={dnd.folderAppendTargetId}
                activeRequestId={activeRequestId}
                openMap={sidebarTree.collections}
                renamingFolderId={folderRename.renamingId}
                folderNameDraft={folderRename.draft}
                onFolderNameDraftChange={folderRename.setDraft}
                onToggleFolderOpen={setSidebarTreeOpen}
                onStartFolderRename={folderRename.start}
                onSubmitFolderRename={folderRename.submit}
                onCancelFolderRename={folderRename.cancel}
                onOpen={openRequest}
                onToggleFavorite={toggleFavorite}
                onMove={moveRequestToCollection}
                onDragStartRequest={dnd.startRequestDrag}
                onDragEndRequest={dnd.clearRequestDragState}
                onReorderRequest={reorderRequests}
                onRequestDropTargetChange={dnd.setRequestDropTarget}
                onRenameRequest={startRequestRename}
                onDuplicateRequest={duplicateRequest}
                onDeleteRequest={setPendingDeleteRequestId}
                onDropRequestIntoFolder={moveRequestToFolder}
                onDragStartFolder={dnd.startFolderDrag}
                onDragEndFolder={dnd.clearFolderDragState}
                onFolderAppendHover={dnd.setFolderAppendTargetId}
                onFolderReorderTargetChange={dnd.setFolderReorderTargetId}
                onFolderDrop={onFolderDrop}
                onNewFolder={onNewFolder}
                onNewRequestInFolder={createRequest}
                onDeleteFolderRequest={setPendingDeleteFolderId}
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
