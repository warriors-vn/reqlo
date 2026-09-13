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

// Same fake used by useStore.websocket.test.ts / useStore.folders.test.ts —
// needed to prove a live socket is actually closed, not just forgotten.
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

describe("createCollection", () => {
  it("adds the collection to the store and the DB with empty defaults", async () => {
    await seed([], [], []);

    const collection = await useStore.getState().createCollection("  My API  ");

    expect(collection.name).toBe("My API");
    expect(useStore.getState().collections.map((c) => c.id)).toEqual([collection.id]);
    expect(await db.collections.get(collection.id)).toMatchObject({ name: "My API" });
  });

  it("falls back to a numbered name when given a blank one", async () => {
    await seed([], [], []);
    const collection = await useStore.getState().createCollection("   ");
    expect(collection.name).toBe("Collection 1");
  });
});

describe("renameCollection", () => {
  it("trims the new name and persists it", async () => {
    const collection = makeCollection({ name: "Old" });
    await seed([collection], [], []);

    await useStore.getState().renameCollection(collection.id, "  New Name  ");

    expect(useStore.getState().collections[0].name).toBe("New Name");
    expect((await db.collections.get(collection.id))?.name).toBe("New Name");
  });

  it("ignores a blank name", async () => {
    const collection = makeCollection({ name: "Old" });
    await seed([collection], [], []);

    await useStore.getState().renameCollection(collection.id, "   ");

    expect(useStore.getState().collections[0].name).toBe("Old");
  });
});

describe("reorderCollections", () => {
  it("reorders and re-sequences positions", async () => {
    const first = makeCollection({ position: 0, name: "First" });
    const second = makeCollection({ position: 1, name: "Second" });
    const third = makeCollection({ position: 2, name: "Third" });
    await seed([first, second, third], [], []);

    await useStore.getState().reorderCollections(first.id, third.id);

    const order = [...useStore.getState().collections]
      .sort((a, b) => a.position - b.position)
      .map((c) => c.name);
    expect(order).toEqual(["Second", "Third", "First"]);
  });
});

describe("duplicateCollection", () => {
  it("deep-clones the collection, its folders and its requests under fresh ids", async () => {
    const source = makeCollection({
      name: "Original",
      defaults: {
        ...createDefaultRequestDefaults(),
        auth: { type: "bearer", token: "secret" },
      },
    });
    const folder = makeFolder({ collectionId: source.id, name: "Users" });
    const request = makeRequest({ collectionId: source.id, folderId: folder.id, name: "List" });
    await seed([source], [folder], [request]);

    const copy = await useStore.getState().duplicateCollection(source.id);

    expect(copy?.name).toBe("Original (copy)");
    expect(copy?.id).not.toBe(source.id);
    expect(copy?.defaults.auth).toEqual({ type: "bearer", token: "secret" });

    const copiedFolder = useStore.getState().folders.find((f) => f.collectionId === copy?.id);
    expect(copiedFolder?.name).toBe("Users");
    expect(copiedFolder?.id).not.toBe(folder.id);

    const copiedRequest = useStore.getState().requests.find((r) => r.collectionId === copy?.id);
    expect(copiedRequest?.name).toBe("List");
    expect(copiedRequest?.folderId).toBe(copiedFolder?.id);

    // The originals must survive untouched.
    expect(useStore.getState().collections.find((c) => c.id === source.id)).toBeDefined();
    expect(await db.collections.get(copy!.id)).toBeDefined();
  });

  it("returns null for a collection that doesn't exist", async () => {
    await seed([], [], []);
    expect(await useStore.getState().duplicateCollection("nope")).toBeNull();
  });
});

describe("deleteCollection", () => {
  it("cascades to every folder and request in the collection, leaving other collections alone", async () => {
    const target = makeCollection({ name: "Target" });
    const other = makeCollection({ name: "Other" });
    const folder = makeFolder({ collectionId: target.id });
    const reqInTarget = makeRequest({ collectionId: target.id, folderId: folder.id });
    const reqInOther = makeRequest({ collectionId: other.id, folderId: null });
    await seed([target, other], [folder], [reqInTarget, reqInOther]);

    await useStore.getState().deleteCollection(target.id);

    expect(useStore.getState().collections.map((c) => c.id)).toEqual([other.id]);
    expect(useStore.getState().folders).toEqual([]);
    expect(useStore.getState().requests.map((r) => r.id)).toEqual([reqInOther.id]);
    expect(await db.collections.get(target.id)).toBeUndefined();
    expect(await db.folders.get(folder.id)).toBeUndefined();
    expect(await db.requests.get(reqInTarget.id)).toBeUndefined();
    expect(await db.requests.get(reqInOther.id)).toBeDefined();
  });

  it("still clears sidebarSelection when it pointed at the deleted collection itself", async () => {
    const target = makeCollection();
    await seed([target], [], []);
    useStore.setState({ sidebarSelection: { type: "collection", id: target.id } });

    await useStore.getState().deleteCollection(target.id);

    expect(useStore.getState().sidebarSelection).toBeNull();
  });

  // Regression: a request selected in the sidebar wasn't cleared when its
  // whole collection (not just the request) was deleted.
  it("clears sidebarSelection when it pointed at a request deleted with the collection", async () => {
    const target = makeCollection();
    const request = makeRequest({ collectionId: target.id, folderId: null });
    await seed([target], [], [request]);
    useStore.setState({ sidebarSelection: { type: "request", id: request.id } });

    await useStore.getState().deleteCollection(target.id);

    expect(useStore.getState().sidebarSelection).toBeNull();
  });

  // Regression: deleteCollection used to leave a live socket open and its
  // wsSessions entry behind for any WebSocket request in the collection.
  it("closes a live WebSocket session for a request deleted with the collection", async () => {
    const target = makeCollection();
    const wsRequest = makeRequest({
      collectionId: target.id,
      folderId: null,
      protocol: "websocket",
      url: "wss://echo.example.com/socket",
      websocket: createDefaultWebSocketConfig(),
    });
    await seed([target], [], [wsRequest]);
    useStore.getState().connectWebSocket(wsRequest.id);
    const socket = FakeSocket.instances[0];
    socket.open();
    expect(useStore.getState().wsSessions[wsRequest.id]).toBeDefined();

    await useStore.getState().deleteCollection(target.id);

    expect(socket.closed).toBe(true);
    expect(useStore.getState().wsSessions[wsRequest.id]).toBeUndefined();
  });

  // Regression: activeTabId kept pointing at a tab whose request had just
  // been deleted as part of the collection cascade.
  it("fixes up activeTabId when the active tab's request is deleted with the collection", async () => {
    const target = makeCollection();
    const other = makeCollection();
    const reqInTarget = makeRequest({ collectionId: target.id, folderId: null });
    const reqElsewhere = makeRequest({ collectionId: other.id, folderId: null });
    await seed([target, other], [], [reqInTarget, reqElsewhere]);
    const tabInTarget = { id: "tab-1", requestId: reqInTarget.id };
    const tabElsewhere = { id: "tab-2", requestId: reqElsewhere.id };
    useStore.setState({ tabs: [tabInTarget, tabElsewhere], activeTabId: tabInTarget.id });

    await useStore.getState().deleteCollection(target.id);

    expect(useStore.getState().tabs).toEqual([tabElsewhere]);
    expect(useStore.getState().activeTabId).toBe(tabElsewhere.id);
  });
});
