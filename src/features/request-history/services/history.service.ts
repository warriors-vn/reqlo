import { db, normalizeHistoryEntry, type HistoryEntry } from "@/services/db";
import Dexie from "dexie";

export async function loadWorkspaceHistory(workspaceId: string): Promise<HistoryEntry[]> {
  const entries = await db.history
    .where("[workspaceId+executedAt]")
    .between([workspaceId, Dexie.minKey], [workspaceId, Dexie.maxKey])
    .reverse()
    .toArray();
  return entries.map(normalizeHistoryEntry);
}

export async function saveHistoryEntry(entry: HistoryEntry) {
  const normalized = normalizeHistoryEntry(entry);
  await db.history.put(normalized);
  return normalized;
}

export async function updateHistoryEntry(id: string, patch: Partial<HistoryEntry>) {
  await db.history.update(id, patch);
}

export async function deleteHistoryEntry(id: string) {
  await db.history.delete(id);
}

export async function clearWorkspaceHistory(workspaceId: string) {
  const ids = await db.history.where("workspaceId").equals(workspaceId).primaryKeys();
  await db.history.bulkDelete(ids as string[]);
}
