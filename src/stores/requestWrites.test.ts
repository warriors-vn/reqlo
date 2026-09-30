// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "@/stores/useStore";
import { db, normalizeApiRequest, uid, type Workspace } from "@/services/db";
import { flushRequestWrites, REQUEST_WRITE_DEBOUNCE_MS } from "@/stores/requestWrites";

const now = Date.now();

async function seed() {
  const workspace: Workspace = {
    id: uid(),
    name: "W",
    globals: [],
    createdAt: now,
    updatedAt: now,
  };
  const request = normalizeApiRequest({
    id: uid(),
    workspaceId: workspace.id,
    name: "R",
    method: "GET",
    url: "",
    createdAt: now,
    updatedAt: now,
  });
  await db.workspaces.add(workspace);
  await db.requests.add(request);
  useStore.setState({ workspace, requests: [request], collections: [], folders: [] });
  return request;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(async () => {
  await flushRequestWrites();
  vi.useRealTimers();
  vi.restoreAllMocks();
  await db.delete();
  await db.open();
});

describe("updateRequest persistence", () => {
  it("updates memory at once but writes a burst of edits to IndexedDB once", async () => {
    const request = await seed();
    const write = vi.spyOn(db.requests, "update");

    const pending = "hello"
      .split("")
      .map((_, i) =>
        useStore.getState().updateRequest(request.id, { url: "hello".slice(0, i + 1) }),
      );

    expect(useStore.getState().requests[0].url).toBe("hello");
    expect(write).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(REQUEST_WRITE_DEBOUNCE_MS);
    await Promise.all(pending);

    expect(write).toHaveBeenCalledTimes(1);
    expect((await db.requests.get(request.id))?.url).toBe("hello");
  });

  it("merges different fields edited in the same burst", async () => {
    const request = await seed();
    const a = useStore.getState().updateRequest(request.id, { url: "https://x.test" });
    const b = useStore.getState().updateRequest(request.id, { name: "Renamed" });
    await vi.advanceTimersByTimeAsync(REQUEST_WRITE_DEBOUNCE_MS);
    await Promise.all([a, b]);
    const stored = await db.requests.get(request.id);
    expect(stored?.url).toBe("https://x.test");
    expect(stored?.name).toBe("Renamed");
  });

  it("flushRequestWrites persists without waiting for the timer", async () => {
    const request = await seed();
    void useStore.getState().updateRequest(request.id, { url: "https://now.test" });
    await flushRequestWrites();
    expect((await db.requests.get(request.id))?.url).toBe("https://now.test");
  });

  it("flushes when the tab is hidden", async () => {
    const request = await seed();
    void useStore.getState().updateRequest(request.id, { url: "https://hidden.test" });
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(async () =>
      expect((await db.requests.get(request.id))?.url).toBe("https://hidden.test"),
    );
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });

  it("a workspace import sees edits that were still waiting on the debounce", async () => {
    const request = await seed();
    void useStore.getState().updateRequest(request.id, { url: "https://unsaved.test" });
    await useStore.getState().importWorkspaceJSON(
      JSON.stringify({
        schema: "reqlo.workspace",
        version: 1,
        exportedAt: now,
        workspace: { id: "o", name: "O", globals: [], createdAt: now, updatedAt: now },
        collections: [],
        folders: [],
        requests: [],
        environments: [],
        history: [],
      }),
    );
    const backups = await db.backups.toArray();
    expect(backups[0].data.requests[0].url).toBe("https://unsaved.test");
  });
});

describe("write failures", () => {
  it("reports a failing burst once, under a fixed toast id", async () => {
    const { toast } = await import("sonner");
    const error = vi.spyOn(toast, "error").mockImplementation(() => "x");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const request = await seed();
    vi.spyOn(db.requests, "update").mockRejectedValue(new Error("quota"));

    const edits = [1, 2, 3].map((n) =>
      useStore
        .getState()
        .updateRequest(request.id, { url: `u${n}` })
        .catch(() => undefined),
    );
    await vi.advanceTimersByTimeAsync(REQUEST_WRITE_DEBOUNCE_MS);
    await Promise.all(edits);

    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][1]).toMatchObject({ id: "db-write-failed" });
  });
});
