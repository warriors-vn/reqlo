/** Drops any keys not in `keepIds`, returning the same object reference when
 * nothing is stale — lets a caller prune a keyed map (e.g. Workspace.tsx's
 * per-request results/loading state) in a useState updater without causing a
 * re-render when the prune has nothing to do. */
export function pruneStaleKeys<T>(
  record: Record<string, T>,
  keepIds: Set<string>,
): Record<string, T> {
  const staleKeys = Object.keys(record).filter((id) => !keepIds.has(id));
  if (!staleKeys.length) return record;
  const next = { ...record };
  for (const id of staleKeys) delete next[id];
  return next;
}
