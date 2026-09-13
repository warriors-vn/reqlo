import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useStore } from "@/stores/useStore";
import {
  createDefaultRequestDefaults,
  createDefaultWebSocketConfig,
  db,
  normalizeApiRequest,
  uid,
  type ApiRequest,
  type Collection,
  type Folder,
  type Workspace,
} from "@/services/db";

// The slice builds its socket through the global constructor, same fake used
// by useStore.websocket.test.ts — needed here to prove a live socket actually
// gets closed by a bulk folder delete, not just that wsSessions is emptied.
class FakeSocket {
  static instances: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  send() {}
  close() {
    this.closed = true;
    this.onclose?.({ code: 1000, reason: "", wasClean: true } as CloseEvent);
  }
  open() {
    this.onopen?.();
  }
}

let originalWebSocket: unknown;

beforeEach(() => {
  FakeSocket.instances = [];
  originalWebSocket = (globalThis as Record<string, unknown>).WebSocket;
  (globalThis as Record<string, unknown>).WebSocket = FakeSocket;
});

afterEach(async () => {
  (globalThis as Record<string, unknown>).WebSocket = originalWebSocket;
  await db.delete();
  await db.open();
});

const WORKSPACE_ID = "ws-1";

function makeCollection(overrides: Partial<Collection> = {}): Collection {
  return {
    id: uid(),
    workspaceId: WORKSPACE_ID,
    name: "Collection",
    position: 0,
    defaults: createDefaultRequestDefaults(),
    createdAt: 0,
    ...overrides,
  };
}

function makeFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: uid(),
    workspaceId: WORKSPACE_ID,
    collectionId: "",
    parentFolderId: null,
    name: "Folder",
    position: 0,
    defaults: createDefaultRequestDefaults(),
    createdAt: 0,
    ...overrides,
  };
}

function makeRequest(overrides: Partial<ApiRequest> = {}): ApiRequest {
  return normalizeApiRequest({
    id: uid(),
    workspaceId: WORKSPACE_ID,
    name: "Req",
    method: "GET",
    url: "https://api.example.com",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  });
}

/** Seeds both the live DB and the store's in-memory mirror of it — the slice
 * actions read from `get()` but persist through Dexie, so a test that checks
 * both surfaces has to seed both. */
async function seed(collections: Collection[], folders: Folder[], requests: ApiRequest[]) {
  await db.transaction("rw", db.collections, db.folders, db.requests, async () => {
    if (collections.length) await db.collections.bulkAdd(collections);
    if (folders.length) await db.folders.bulkAdd(folders);
    if (requests.length) await db.requests.bulkAdd(requests);
  });
  useStore.setState({
    workspace: {
      id: WORKSPACE_ID,
      name: "W",
      globals: [],
      createdAt: 0,
      updatedAt: 0,
    } as Workspace,
    collections,
    folders,
    requests,
    tabs: [],
    activeTabId: null,
    sidebarSelection: null,
    graphqlSchemas: {},
    wsSessions: {},
  });
}

describe("createFolder", () => {
  it("adds the folder to the store and the DB", async () => {
    const collection = makeCollection();
    await seed([collection], [], []);

    const folder = await useStore.getState().createFolder(collection.id, null, "  Users  ");

    expect(folder.name).toBe("Users");
    expect(folder.collectionId).toBe(collection.id);
    expect(useStore.getState().folders.map((f) => f.id)).toEqual([folder.id]);
    expect(await db.folders.get(folder.id)).toMatchObject({ name: "Users" });
  });
});

describe("renameFolder", () => {
  it("trims the new name and persists it", async () => {
    const folder = makeFolder({ name: "Old" });
    await seed([], [folder], []);

    await useStore.getState().renameFolder(folder.id, "  New Name  ");

    expect(useStore.getState().folders[0].name).toBe("New Name");
    expect((await db.folders.get(folder.id))?.name).toBe("New Name");
  });

  it("ignores a blank name", async () => {
    const folder = makeFolder({ name: "Old" });
    await seed([], [folder], []);

    await useStore.getState().renameFolder(folder.id, "   ");

    expect(useStore.getState().folders[0].name).toBe("Old");
  });
});

describe("updateFolderDefaults", () => {
  it("writes new defaults to the store and the DB", async () => {
    const folder = makeFolder();
    await seed([], [folder], []);
    const next = {
      ...createDefaultRequestDefaults(),
      headers: [{ id: "h1", key: "X-Team", value: "platform", enabled: true }],
    };

    await useStore.getState().updateFolderDefaults(folder.id, next);

    expect(useStore.getState().folders[0].defaults).toEqual(next);
    expect((await db.folders.get(folder.id))?.defaults).toEqual(next);
  });
});

describe("moveFolderToParent", () => {
  it("moves the folder and assigns it the next position under the new parent", async () => {
    const collection = makeCollection();
    const parentA = makeFolder({ collectionId: collection.id, name: "A" });
    const parentB = makeFolder({ collectionId: collection.id, name: "B" });
    const existingChildOfB = makeFolder({
      collectionId: collection.id,
      parentFolderId: parentB.id,
      position: 0,
    });
    const moved = makeFolder({ collectionId: collection.id, parentFolderId: parentA.id });
    await seed([collection], [parentA, parentB, existingChildOfB, moved], []);

    await useStore.getState().moveFolderToParent(moved.id, parentB.id);

    const updated = useStore.getState().folders.find((f) => f.id === moved.id)!;
    expect(updated.parentFolderId).toBe(parentB.id);
    expect(updated.position).toBe(1);
  });

  it("refuses a move that would create a cycle", async () => {
    const collection = makeCollection();
    const parent = makeFolder({ collectionId: collection.id });
    const child = makeFolder({ collectionId: collection.id, parentFolderId: parent.id });
    await seed([collection], [parent, child], []);

    await useStore.getState().moveFolderToParent(parent.id, child.id);

    expect(useStore.getState().folders.find((f) => f.id === parent.id)?.parentFolderId).toBeNull();
  });
});

describe("reorderFolders", () => {
  it("reorders siblings and re-sequences their positions", async () => {
    const collection = makeCollection();
    const first = makeFolder({ collectionId: collection.id, position: 0, name: "First" });
    const second = makeFolder({ collectionId: collection.id, position: 1, name: "Second" });
    const third = makeFolder({ collectionId: collection.id, position: 2, name: "Third" });
    await seed([collection], [first, second, third], []);

    await useStore.getState().reorderFolders(first.id, third.id);

    const order = [...useStore.getState().folders]
      .sort((a, b) => a.position - b.position)
      .map((f) => f.name);
    expect(order).toEqual(["Second", "Third", "First"]);
  });
});

describe("deleteFolder", () => {
  it("cascades to descendant folders and every request inside any of them, leaving siblings alone", async () => {
    const collection = makeCollection();
    const target = makeFolder({ collectionId: collection.id, name: "Target" });
    const child = makeFolder({
      collectionId: collection.id,
      parentFolderId: target.id,
      name: "Child",
    });
    const sibling = makeFolder({ collectionId: collection.id, name: "Sibling" });
    const reqInTarget = makeRequest({ collectionId: collection.id, folderId: target.id });
    const reqInChild = makeRequest({ collectionId: collection.id, folderId: child.id });
    const reqInSibling = makeRequest({ collectionId: collection.id, folderId: sibling.id });
    const reqUnfiled = makeRequest({ collectionId: collection.id, folderId: null });
    await seed(
      [collection],
      [target, child, sibling],
      [reqInTarget, reqInChild, reqInSibling, reqUnfiled],
    );

    await useStore.getState().deleteFolder(target.id);

    const folderIds = useStore.getState().folders.map((f) => f.id);
    expect(folderIds).toEqual([sibling.id]);
    const requestIds = useStore
      .getState()
      .requests.map((r) => r.id)
      .sort();
    expect(requestIds).toEqual([reqInSibling.id, reqUnfiled.id].sort());
    expect(await db.folders.get(target.id)).toBeUndefined();
    expect(await db.folders.get(child.id)).toBeUndefined();
    expect(await db.requests.get(reqInTarget.id)).toBeUndefined();
    expect(await db.requests.get(reqInChild.id)).toBeUndefined();
    expect(await db.requests.get(reqInSibling.id)).toBeDefined();
  });

  // Regression: deleteFolder used to leave a live socket open and its
  // wsSessions entry behind for any WebSocket request caught in the cascade.
  it("closes a live WebSocket session for a request deleted with the folder", async () => {
    const collection = makeCollection();
    const folder = makeFolder({ collectionId: collection.id });
    const wsRequest = makeRequest({
      collectionId: collection.id,
      folderId: folder.id,
      protocol: "websocket",
      url: "wss://echo.example.com/socket",
      websocket: createDefaultWebSocketConfig(),
    });
    await seed([collection], [folder], [wsRequest]);
    useStore.getState().connectWebSocket(wsRequest.id);
    const socket = FakeSocket.instances[0];
    socket.open();
    expect(useStore.getState().wsSessions[wsRequest.id]).toBeDefined();

    await useStore.getState().deleteFolder(folder.id);

    expect(socket.closed).toBe(true);
    expect(useStore.getState().wsSessions[wsRequest.id]).toBeUndefined();
  });

  // Regression: activeTabId kept pointing at a tab whose request had just
  // been deleted as part of the folder cascade.
  it("fixes up activeTabId when the active tab's request is deleted with the folder", async () => {
    const collection = makeCollection();
    const folder = makeFolder({ collectionId: collection.id });
    const reqInFolder = makeRequest({ collectionId: collection.id, folderId: folder.id });
    const reqElsewhere = makeRequest({ collectionId: collection.id, folderId: null });
    await seed([collection], [folder], [reqInFolder, reqElsewhere]);
    const tabInFolder = { id: "tab-1", requestId: reqInFolder.id };
    const tabElsewhere = { id: "tab-2", requestId: reqElsewhere.id };
    useStore.setState({ tabs: [tabInFolder, tabElsewhere], activeTabId: tabInFolder.id });

    await useStore.getState().deleteFolder(folder.id);

    expect(useStore.getState().tabs).toEqual([tabElsewhere]);
    expect(useStore.getState().activeTabId).toBe(tabElsewhere.id);
  });

  // Regression: the old check compared sidebarSelection.type === "collection"
  // against a folder id, which can never match — a selected request inside
  // the deleted folder kept a stale sidebarSelection.
  it("clears sidebarSelection when it pointed at a request deleted with the folder", async () => {
    const collection = makeCollection();
    const folder = makeFolder({ collectionId: collection.id });
    const reqInFolder = makeRequest({ collectionId: collection.id, folderId: folder.id });
    await seed([collection], [folder], [reqInFolder]);
    useStore.setState({ sidebarSelection: { type: "request", id: reqInFolder.id } });

    await useStore.getState().deleteFolder(folder.id);

    expect(useStore.getState().sidebarSelection).toBeNull();
  });

  it("leaves sidebarSelection alone when it points at something outside the deleted folder", async () => {
    const collection = makeCollection();
    const folder = makeFolder({ collectionId: collection.id });
    const reqElsewhere = makeRequest({ collectionId: collection.id, folderId: null });
    await seed([collection], [folder], [reqElsewhere]);
    useStore.setState({ sidebarSelection: { type: "request", id: reqElsewhere.id } });

    await useStore.getState().deleteFolder(folder.id);

    expect(useStore.getState().sidebarSelection).toEqual({ type: "request", id: reqElsewhere.id });
  });
});
