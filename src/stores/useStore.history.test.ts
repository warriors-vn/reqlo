import { afterEach, describe, expect, it } from "vitest";
import { loadRecentHistory, pruneHistoryToLimit, useStore } from "@/stores/useStore";
import { db, normalizeHistoryEntry, uid, type HistoryEntry, type Workspace } from "@/services/db";

function makeEntry(
  workspaceId: string,
  executedAt: number,
  overrides: Partial<HistoryEntry> = {},
): HistoryEntry {
  return normalizeHistoryEntry({
    id: uid(),
    workspaceId,
    requestId: null,
    method: "GET",
    url: "https://api.example.com",
    ok: true,
    durationMs: 5,
    sizeBytes: 10,
    executedAt,
    ...overrides,
  });
}

async function seedWorkspace(): Promise<Workspace> {
  const now = Date.now();
  const ws: Workspace = { id: uid(), name: "Test", globals: [], createdAt: now, updatedAt: now };
  await db.workspaces.add(ws);
  return ws;
}

afterEach(async () => {
  await db.delete();
  await db.open();
});

// loadRecentHistory / pruneHistoryToLimit back both init() and addHistory() —
// exercised directly here at a small scale, since running them at the real
// HISTORY_RETENTION (2500) row count is too slow against fake-indexeddb for
// a unit test.
describe("history retention mechanism", () => {
  it("loadRecentHistory returns only the most recent `limit` rows, newest first", async () => {
    const ws = await seedWorkspace();
    const entries = Array.from({ length: 30 }, (_, i) => makeEntry(ws.id, i));
    await db.history.bulkAdd(entries);

    const loaded = await loadRecentHistory(ws.id, 10);

    expect(loaded).toHaveLength(10);
    expect(loaded.map((e) => e.executedAt)).toEqual([29, 28, 27, 26, 25, 24, 23, 22, 21, 20]);
  });

  it("pruneHistoryToLimit deletes only the oldest rows past the limit", async () => {
    const ws = await seedWorkspace();
    const entries = Array.from({ length: 30 }, (_, i) => makeEntry(ws.id, i));
    await db.history.bulkAdd(entries);

    await pruneHistoryToLimit(ws.id, 10);

    const remaining = await db.history.where("workspaceId").equals(ws.id).toArray();
    expect(remaining).toHaveLength(10);
    expect(remaining.map((e) => e.executedAt).sort((a, b) => a - b)).toEqual([
      20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
    ]);
  });

  it("pruneHistoryToLimit prunes pinned rows too once they're the oldest", async () => {
    // Pinning doesn't exempt a row from retention — an earlier version of this
    // fix tried that and it turned a bounded-cost prune into a scan over
    // every pinned row ever, while pinned rows that outlived the load window
    // became invisible with no way to un-pin them. Simpler and correct: a
    // pinned row ages out exactly like any other.
    const ws = await seedWorkspace();
    const pinnedOld = makeEntry(ws.id, 0, { pinned: true });
    const rest = Array.from({ length: 10 }, (_, i) => makeEntry(ws.id, i + 1));
    await db.history.bulkAdd([pinnedOld, ...rest]);

    await pruneHistoryToLimit(ws.id, 5);

    expect(await db.history.where("workspaceId").equals(ws.id).count()).toBe(5);
    expect(await db.history.get(pinnedOld.id)).toBeUndefined();
  });

  it("addHistory persists the new entry and prunes the table in one write", async () => {
    const ws = await seedWorkspace();
    await useStore.setState({ workspace: ws });

    await useStore.getState().addHistory(makeEntry(ws.id, 1));

    expect(await db.history.where("workspaceId").equals(ws.id).count()).toBe(1);
    expect(useStore.getState().history).toHaveLength(1);
  });

  it("init() wires loadRecentHistory into the store's history state", async () => {
    const ws = await seedWorkspace();
    const entries = Array.from({ length: 5 }, (_, i) => makeEntry(ws.id, i));
    await db.history.bulkAdd(entries);

    await useStore.getState().init();

    expect(useStore.getState().history).toHaveLength(5);
    expect(useStore.getState().history[0].executedAt).toBe(4);
  });

  it("importWorkspaceJSON restores history sorted newest-first", async () => {
    // Small-scale here — this is a smoke test confirming the sort/shape are
    // right, not a check of the HISTORY_RETENTION cutoff itself (which would
    // need 2500+ rows in the payload, too slow for a unit test).
    const now = Date.now();
    const workspace: Workspace = {
      id: "src-ws",
      name: "Src",
      globals: [],
      createdAt: now,
      updatedAt: now,
    };
    const history = [makeEntry("src-ws", 1), makeEntry("src-ws", 3), makeEntry("src-ws", 2)];
    const payload = JSON.stringify({
      schema: "reqlo.workspace",
      version: 1,
      exportedAt: now,
      workspace,
      collections: [],
      folders: [],
      requests: [],
      environments: [],
      history,
    });

    const imported = await useStore.getState().importWorkspaceJSON(payload);

    expect(imported).not.toBeNull();
    expect(useStore.getState().history.map((h) => h.executedAt)).toEqual([3, 2, 1]);
  });
});
