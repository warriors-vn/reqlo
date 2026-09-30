// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { useStore } from "@/stores/useStore";
import { BACKUP_RETENTION } from "@/services/backups";
import { db, normalizeApiRequest, uid, type Workspace } from "@/services/db";

const now = Date.now();

async function seedCurrentWorkspace(name = "Current") {
  const workspace: Workspace = {
    id: uid(),
    name,
    globals: [],
    createdAt: now,
    updatedAt: now,
  };
  const request = normalizeApiRequest({
    id: uid(),
    workspaceId: workspace.id,
    name: "Precious request",
    method: "GET",
    url: "https://api.example.com/precious",
    auth: { type: "bearer", token: "live-token-kept-in-backup" },
    createdAt: now,
    updatedAt: now,
  });
  await db.workspaces.add(workspace);
  await db.requests.add(request);
  useStore.setState({ workspace, requests: [request], collections: [], folders: [] });
  return { workspace, request };
}

const backupFile = (name: string) =>
  JSON.stringify({
    schema: "reqlo.workspace",
    version: 1,
    exportedAt: now,
    workspace: { id: "old", name, globals: [], createdAt: now, updatedAt: now },
    collections: [],
    folders: [],
    requests: [],
    environments: [],
    history: [],
  });

afterEach(async () => {
  vi.restoreAllMocks();
  await db.delete();
  await db.open();
});

describe("restoring a workspace backup", () => {
  it("keeps a full copy of what it replaced, credentials included", async () => {
    const { request } = await seedCurrentWorkspace();

    await useStore.getState().importWorkspaceJSON(backupFile("From file"));

    expect(await db.requests.count()).toBe(0);
    const backups = await db.backups.toArray();
    expect(backups).toHaveLength(1);
    expect(backups[0].workspaceName).toBe("Current");
    expect(backups[0].data.requests[0].id).toBe(request.id);
    // A safety copy that can't put the token back isn't one — unlike an
    // export, it never leaves this browser.
    expect(backups[0].data.requests[0].auth.token).toBe("live-token-kept-in-backup");
    expect(useStore.getState().lastRestoreBackupId).toBe(backups[0].id);
  });

  it("undo puts the previous workspace back", async () => {
    const { workspace, request } = await seedCurrentWorkspace();
    await useStore.getState().importWorkspaceJSON(backupFile("From file"));
    const backupId = useStore.getState().lastRestoreBackupId!;

    await useStore.getState().undoWorkspaceRestore(backupId);

    expect(useStore.getState().workspace?.id).toBe(workspace.id);
    expect(useStore.getState().requests.map((r) => r.id)).toEqual([request.id]);
    expect((await db.requests.get(request.id))?.auth.token).toBe("live-token-kept-in-backup");
  });

  it("makes no copy and clears nothing when the file is invalid", async () => {
    await seedCurrentWorkspace();

    expect(await useStore.getState().importWorkspaceJSON("{not json")).toBeNull();

    expect(await db.backups.count()).toBe(0);
    expect(await db.requests.count()).toBe(1);
  });

  it("keeps only the most recent copies", async () => {
    await seedCurrentWorkspace();
    for (let i = 0; i < BACKUP_RETENTION + 2; i++) {
      await useStore.getState().importWorkspaceJSON(backupFile(`File ${i}`));
    }
    expect(await db.backups.count()).toBe(BACKUP_RETENTION);
  });

  it("asks through the styled dialog and does nothing when declined", async () => {
    await seedCurrentWorkspace();
    const native = vi.spyOn(window, "confirm");
    const done = useStore.getState().restoreWorkspaceBackup();
    expect(useStore.getState().confirmRequest?.title).toMatch(/restore/i);

    useStore.getState().resolveConfirm(false);
    await done;

    expect(native).not.toHaveBeenCalled();
    expect(await db.requests.count()).toBe(1);
  });
});

describe("importing an OpenAPI spec", () => {
  it("carries the server into the new collection as {{baseUrl}}", async () => {
    await seedCurrentWorkspace();
    const col = await useStore.getState().importOpenApiText(
      JSON.stringify({
        openapi: "3.0.3",
        servers: [{ url: "https://api.example.com" }],
        paths: { "/users/{id}": { get: { parameters: [{ name: "id", in: "path", example: 7 }] } } },
      }),
    );

    expect(col).not.toBeNull();
    const stored = await db.collections.get(col!.id);
    expect(stored?.defaults.variables.map((v) => [v.key, v.value])).toEqual([
      ["baseUrl", "https://api.example.com"],
      ["id", "7"],
    ]);
    const requests = await db.requests.where("collectionId").equals(col!.id).toArray();
    expect(requests[0].url).toBe("{{baseUrl}}/users/{{id}}");
  });
});
