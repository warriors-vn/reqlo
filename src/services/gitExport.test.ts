import { describe, expect, it } from "vitest";
import {
  createDefaultRequestDefaults,
  db,
  normalizeApiRequest,
  uid,
  type ApiRequest,
  type Collection,
  type Folder,
} from "@/services/db";
import { buildCollectionFileTree } from "@/services/gitExport";

function makeRequest(overrides: Partial<ApiRequest> = {}): ApiRequest {
  const now = Date.now();
  return normalizeApiRequest({
    id: uid(),
    workspaceId: "ws-x",
    name: "Untitled",
    method: "GET",
    url: "https://api.example.com",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe("buildCollectionFileTree", () => {
  it("writes the collection's own defaults into _collection.json", async () => {
    const workspaceId = uid();
    const collection: Collection = {
      id: uid(),
      workspaceId,
      name: "My API",
      position: 0,
      defaults: {
        ...createDefaultRequestDefaults(),
        auth: { type: "bearer", token: "collection-token" },
        variables: [
          {
            id: "v1",
            key: "COLLECTION_TOKEN",
            value: "collection-secret",
            enabled: true,
            secret: true,
          },
        ],
      },
      createdAt: Date.now(),
    };
    await db.collections.add(collection);

    const files = await buildCollectionFileTree(collection);
    const root = JSON.parse(files.find((f) => f.path === "_collection.json")!.content);

    // Auth is written through, same as request-level auth in exportCollection.
    expect(root.defaults.auth).toEqual({ type: "bearer", token: "collection-token" });
    // Secret variables in the collection's own defaults are blanked, same as
    // exportCollection/exportWorkspace treat them — this file leaves the
    // workspace too, and shouldn't carry the secret value with it.
    expect(
      root.defaults.variables.find((v: { key: string }) => v.key === "COLLECTION_TOKEN").value,
    ).toBe("");
    // The live store value itself is never mutated by exporting.
    const live = await db.collections.get(collection.id);
    expect(live?.defaults.variables.find((v) => v.key === "COLLECTION_TOKEN")?.value).toBe(
      "collection-secret",
    );
  });

  it("writes a folder's own defaults into its _folder.json", async () => {
    const workspaceId = uid();
    const collection: Collection = {
      id: uid(),
      workspaceId,
      name: "My API",
      position: 0,
      defaults: createDefaultRequestDefaults(),
      createdAt: Date.now(),
    };
    await db.collections.add(collection);

    const folder: Folder = {
      id: uid(),
      workspaceId,
      collectionId: collection.id,
      parentFolderId: null,
      name: "Users",
      position: 0,
      defaults: {
        ...createDefaultRequestDefaults(),
        headers: [{ id: "h1", key: "X-Team", value: "platform", enabled: true }],
        variables: [
          { id: "v1", key: "FOLDER_TOKEN", value: "folder-secret", enabled: true, secret: true },
        ],
      },
      createdAt: Date.now(),
    };
    await db.folders.add(folder);

    const files = await buildCollectionFileTree(collection);
    const folderFile = JSON.parse(files.find((f) => f.path === "users/_folder.json")!.content);

    expect(folderFile.defaults.headers).toEqual([
      { id: "h1", key: "X-Team", value: "platform", enabled: true },
    ]);
    expect(
      folderFile.defaults.variables.find((v: { key: string }) => v.key === "FOLDER_TOKEN").value,
    ).toBe("");
  });

  it("nests requests under their folder's directory", async () => {
    const workspaceId = uid();
    const collection: Collection = {
      id: uid(),
      workspaceId,
      name: "My API",
      position: 0,
      defaults: createDefaultRequestDefaults(),
      createdAt: Date.now(),
    };
    await db.collections.add(collection);

    const folder: Folder = {
      id: uid(),
      workspaceId,
      collectionId: collection.id,
      parentFolderId: null,
      name: "Users",
      position: 0,
      defaults: createDefaultRequestDefaults(),
      createdAt: Date.now(),
    };
    await db.folders.add(folder);

    const request = makeRequest({
      workspaceId,
      collectionId: collection.id,
      folderId: folder.id,
      name: "Create user",
      position: 0,
    });
    await db.requests.add(request);

    const files = await buildCollectionFileTree(collection);
    expect(files.map((f) => f.path).sort()).toEqual([
      "_collection.json",
      "users/_folder.json",
      "users/create-user.json",
    ]);
  });
});
