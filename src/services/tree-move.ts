import type { ApiRequest, Collection, Folder } from "@/services/db";

/** Where a newly created item lands relative to its existing siblings — one
 * past the current max `position`, so it appends without disturbing anyone
 * else's order. */
export function getNextRequestPosition(
  requests: ApiRequest[],
  collectionId: string | null,
  folderId: string | null,
) {
  const siblings = requests.filter(
    (request) => request.collectionId === collectionId && request.folderId === folderId,
  );
  if (!siblings.length) return 0;
  return Math.max(...siblings.map((request) => request.position ?? 0)) + 1;
}

export function getNextCollectionPosition(collections: Collection[]) {
  if (!collections.length) return 0;
  return Math.max(...collections.map((collection) => collection.position ?? 0)) + 1;
}

export function getNextFolderPosition(
  folders: Folder[],
  collectionId: string,
  parentFolderId: string | null,
) {
  const siblings = folders.filter(
    (folder) => folder.collectionId === collectionId && folder.parentFolderId === parentFolderId,
  );
  if (!siblings.length) return 0;
  return Math.max(...siblings.map((folder) => folder.position ?? 0)) + 1;
}

export function collectDescendantFolderIds(folders: Folder[], rootId: string): string[] {
  const children = folders.filter((folder) => folder.parentFolderId === rootId);
  return children.flatMap((child) => [child.id, ...collectDescendantFolderIds(folders, child.id)]);
}

/** Would moving `folderId` under `newParentFolderId` create a cycle (moving a folder into
 * itself or one of its own descendants)? The sole safety enforcement for folder moves — UI
 * drag state can be bypassed, so this must be checked in the store action itself. */
export function wouldCreateCycle(
  folders: Folder[],
  folderId: string,
  newParentFolderId: string | null,
): boolean {
  if (newParentFolderId === null) return false;
  if (newParentFolderId === folderId) return true;
  const seen = new Set<string>();
  let cur = folders.find((folder) => folder.id === newParentFolderId);
  while (cur) {
    if (cur.id === folderId || seen.has(cur.id)) return true;
    seen.add(cur.id);
    const parentId: string | null = cur.parentFolderId;
    cur = parentId ? folders.find((folder) => folder.id === parentId) : undefined;
  }
  return false;
}

export function compareRequestsByPosition(left: ApiRequest, right: ApiRequest) {
  return left.position - right.position || left.createdAt - right.createdAt;
}

export function sortRequestsForCollection(requests: ApiRequest[]) {
  return [...requests].sort(compareRequestsByPosition);
}

/** Re-assigns 0..n-1 positions in sorted order — the step that turns a splice
 * result back into a persistable, gap-free ordering. */
export function resequenceRequests(requests: ApiRequest[]) {
  return sortRequestsForCollection(requests).map((request, index) => ({
    ...request,
    position: index,
  }));
}

export function reorderByIndex<T>(items: T[], from: number, to: number) {
  const next = items.slice();
  const [dragged] = next.splice(from, 1);
  if (!dragged) return items;
  next.splice(to, 0, dragged);
  return next;
}
