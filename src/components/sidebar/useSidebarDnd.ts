import { useCallback, useEffect, useState } from "react";

export interface DraggedRequest {
  id: string;
  collectionId: string | null;
  folderId: string | null;
}

export interface RequestDropTarget {
  targetId: string | null;
  collectionId: string | null;
  folderId: string | null;
}

// Owns every piece of sidebar drag-and-drop state — collections, folders and
// requests each drag independently — plus the handlers that mutate it.
// Pulled out of Sidebar.tsx so its setState-only handlers (clear*/start*) are
// useCallback-stable across renders: Sidebar itself re-renders on every
// keystroke made elsewhere in the store (editing a request's URL, headers,
// etc.), and passing fresh closures here on every one of those renders would
// defeat the FolderTree/RequestList row memoization that exists specifically
// to survive that churn.
export function useSidebarDnd(dragEnabled: boolean) {
  const [draggedCollectionId, setDraggedCollectionId] = useState<string | null>(null);
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
  const [draggedRequest, setDraggedRequest] = useState<DraggedRequest | null>(null);
  const [collectionAppendTargetId, setCollectionAppendTargetId] = useState<string | null>(null);
  const [collectionReorderTargetId, setCollectionReorderTargetId] = useState<string | null>(null);
  const [folderAppendTargetId, setFolderAppendTargetId] = useState<string | null>(null);
  const [folderReorderTargetId, setFolderReorderTargetId] = useState<string | null>(null);
  const [requestDropTarget, setRequestDropTarget] = useState<RequestDropTarget | null>(null);

  const clearRequestDragState = useCallback(() => {
    setDraggedRequest(null);
    setRequestDropTarget(null);
    setCollectionAppendTargetId(null);
    setFolderAppendTargetId(null);
  }, []);

  const clearCollectionDragState = useCallback(() => {
    setDraggedCollectionId(null);
    setCollectionReorderTargetId(null);
  }, []);

  const clearFolderDragState = useCallback(() => {
    setDraggedFolderId(null);
    setFolderReorderTargetId(null);
    setCollectionAppendTargetId(null);
    setFolderAppendTargetId(null);
  }, []);

  const startRequestDrag = useCallback(
    (id: string, collectionId: string | null, folderId: string | null) => {
      setDraggedRequest({ id, collectionId, folderId });
      setCollectionAppendTargetId(null);
      setFolderAppendTargetId(null);
      setRequestDropTarget(null);
    },
    [],
  );

  const startCollectionDrag = useCallback((id: string) => {
    setDraggedCollectionId(id);
    setCollectionReorderTargetId(null);
  }, []);

  const startFolderDrag = useCallback((id: string) => {
    setDraggedFolderId(id);
    setFolderReorderTargetId(null);
  }, []);

  // A search query disables dragging (reordering a filtered view would be
  // ambiguous) — drop any drag that was already in progress when it starts.
  useEffect(() => {
    if (!dragEnabled) {
      clearRequestDragState();
      clearCollectionDragState();
      clearFolderDragState();
    }
  }, [dragEnabled, clearRequestDragState, clearCollectionDragState, clearFolderDragState]);

  return {
    draggedCollectionId,
    draggedFolderId,
    draggedRequest,
    collectionAppendTargetId,
    collectionReorderTargetId,
    folderAppendTargetId,
    folderReorderTargetId,
    requestDropTarget,
    setCollectionAppendTargetId,
    setCollectionReorderTargetId,
    setFolderAppendTargetId,
    setFolderReorderTargetId,
    setRequestDropTarget,
    clearRequestDragState,
    clearCollectionDragState,
    clearFolderDragState,
    startRequestDrag,
    startCollectionDrag,
    startFolderDrag,
  };
}
