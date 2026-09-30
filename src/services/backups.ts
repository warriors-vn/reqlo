import { db, uid, type WorkspaceBackup } from "@/services/db";

/** How many safety copies to keep. Each is a full copy of the workspace, so
 * this is a bound on storage as much as on clutter. */
export const BACKUP_RETENTION = 3;

/**
 * Copies every table into `db.backups`. Call it inside the same transaction
 * that is about to clear them — the copy and the wipe then commit together or
 * not at all, so there is no window with neither. That transaction must list
 * `db.backups` among its tables.
 */
export async function createSafetyBackup(): Promise<WorkspaceBackup> {
  const [workspaces, collections, folders, requests, history, environments] = await Promise.all([
    db.workspaces.toArray(),
    db.collections.toArray(),
    db.folders.toArray(),
    db.requests.toArray(),
    db.history.toArray(),
    db.environments.toArray(),
  ]);
  const backup: WorkspaceBackup = {
    id: uid(),
    createdAt: Date.now(),
    reason: "before-restore",
    workspaceName: workspaces[0]?.name ?? "Workspace",
    requestCount: requests.length,
    data: { workspaces, collections, folders, requests, history, environments },
  };
  await db.backups.add(backup);

  const all = await db.backups.orderBy("createdAt").toArray();
  const stale = all.slice(0, Math.max(0, all.length - BACKUP_RETENTION));
  if (stale.length) await db.backups.bulkDelete(stale.map((b) => b.id));
  return backup;
}

/** Puts a safety copy back. The copy stays in `backups` afterwards, so an
 * undo can itself be undone by picking the copy again. Returns false if it's
 * gone (pruned, or the data was cleared). */
export async function restoreSafetyBackup(id: string): Promise<boolean> {
  const backup = await db.backups.get(id);
  if (!backup) return false;
  const { data } = backup;
  await db.transaction(
    "rw",
    [db.history, db.requests, db.folders, db.collections, db.environments, db.workspaces],
    async () => {
      await db.history.clear();
      await db.requests.clear();
      await db.folders.clear();
      await db.collections.clear();
      await db.environments.clear();
      await db.workspaces.clear();
      if (data.workspaces.length) await db.workspaces.bulkAdd(data.workspaces);
      if (data.collections.length) await db.collections.bulkAdd(data.collections);
      if (data.folders.length) await db.folders.bulkAdd(data.folders);
      if (data.requests.length) await db.requests.bulkAdd(data.requests);
      if (data.environments.length) await db.environments.bulkAdd(data.environments);
      if (data.history.length) await db.history.bulkAdd(data.history);
    },
  );
  return true;
}
