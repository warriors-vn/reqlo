import { describe, expect, it } from "vitest";
import { normalizeApiRequest, type ApiRequest, type Collection, type Folder } from "@/services/db";
import {
  collectDescendantFolderIds,
  compareRequestsByPosition,
  getNextCollectionPosition,
  getNextFolderPosition,
  getNextRequestPosition,
  reorderByIndex,
  resequenceRequests,
  sortRequestsForCollection,
  wouldCreateCycle,
} from "@/services/tree-move";

function makeRequest(overrides: Partial<ApiRequest> & { id: string }): ApiRequest {
  return normalizeApiRequest({
    workspaceId: "ws1",
    name: "req",
    method: "GET",
    url: "https://example.com",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  });
}

function makeFolder(overrides: Partial<Folder> & { id: string; collectionId: string }): Folder {
  return {
    workspaceId: "ws1",
    parentFolderId: null,
    name: "folder",
    position: 0,
    createdAt: 0,
    ...overrides,
  };
}

function makeCollection(overrides: Partial<Collection> & { id: string }): Collection {
  return {
    workspaceId: "ws1",
    name: "collection",
    position: 0,
    createdAt: 0,
    ...overrides,
  };
}

describe("getNextRequestPosition", () => {
  it("returns 0 when the container has no siblings", () => {
    expect(getNextRequestPosition([], null, null)).toBe(0);
  });

  it("returns one past the highest sibling position, ignoring other containers", () => {
    const requests = [
      makeRequest({ id: "a", collectionId: "c1", folderId: null, position: 0 }),
      makeRequest({ id: "b", collectionId: "c1", folderId: null, position: 3 }),
      makeRequest({ id: "c", collectionId: "c2", folderId: null, position: 99 }),
    ];
    expect(getNextRequestPosition(requests, "c1", null)).toBe(4);
  });
});

describe("getNextCollectionPosition", () => {
  it("returns 0 for an empty list", () => {
    expect(getNextCollectionPosition([])).toBe(0);
  });

  it("returns one past the highest existing position", () => {
    const collections = [
      makeCollection({ id: "a", position: 2 }),
      makeCollection({ id: "b", position: 5 }),
    ];
    expect(getNextCollectionPosition(collections)).toBe(6);
  });
});

describe("getNextFolderPosition", () => {
  it("scopes siblings by collection and parent folder", () => {
    const folders = [
      makeFolder({ id: "a", collectionId: "c1", parentFolderId: null, position: 0 }),
      makeFolder({ id: "b", collectionId: "c1", parentFolderId: null, position: 1 }),
      makeFolder({ id: "c", collectionId: "c1", parentFolderId: "a", position: 10 }),
    ];
    expect(getNextFolderPosition(folders, "c1", null)).toBe(2);
    expect(getNextFolderPosition(folders, "c1", "a")).toBe(11);
    expect(getNextFolderPosition(folders, "c1", "missing-parent")).toBe(0);
  });
});

describe("collectDescendantFolderIds", () => {
  it("collects nested descendants at every depth, not just direct children", () => {
    const folders = [
      makeFolder({ id: "root", collectionId: "c1", parentFolderId: null }),
      makeFolder({ id: "child", collectionId: "c1", parentFolderId: "root" }),
      makeFolder({ id: "grandchild", collectionId: "c1", parentFolderId: "child" }),
      makeFolder({ id: "unrelated", collectionId: "c1", parentFolderId: null }),
    ];
    expect(collectDescendantFolderIds(folders, "root").sort()).toEqual(["child", "grandchild"]);
  });

  it("returns an empty array for a leaf folder", () => {
    const folders = [makeFolder({ id: "leaf", collectionId: "c1", parentFolderId: null })];
    expect(collectDescendantFolderIds(folders, "leaf")).toEqual([]);
  });
});

describe("wouldCreateCycle", () => {
  const folders = [
    makeFolder({ id: "a", collectionId: "c1", parentFolderId: null }),
    makeFolder({ id: "b", collectionId: "c1", parentFolderId: "a" }),
    makeFolder({ id: "c", collectionId: "c1", parentFolderId: "b" }),
  ];

  it("allows moving to the root (null parent)", () => {
    expect(wouldCreateCycle(folders, "a", null)).toBe(false);
  });

  it("rejects moving a folder into itself", () => {
    expect(wouldCreateCycle(folders, "a", "a")).toBe(true);
  });

  it("rejects moving a folder into its own descendant", () => {
    expect(wouldCreateCycle(folders, "a", "c")).toBe(true);
  });

  it("allows moving a folder under an unrelated folder", () => {
    const unrelated = [
      ...folders,
      makeFolder({ id: "d", collectionId: "c1", parentFolderId: null }),
    ];
    expect(wouldCreateCycle(unrelated, "d", "c")).toBe(false);
  });
});

describe("compareRequestsByPosition / sortRequestsForCollection", () => {
  it("sorts by position first, falling back to createdAt for ties", () => {
    const requests = [
      makeRequest({ id: "a", position: 1, createdAt: 100 }),
      makeRequest({ id: "b", position: 0, createdAt: 200 }),
      makeRequest({ id: "c", position: 0, createdAt: 50 }),
    ];
    expect(sortRequestsForCollection(requests).map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  it("does not mutate the input array", () => {
    const requests = [makeRequest({ id: "a", position: 1 }), makeRequest({ id: "b", position: 0 })];
    const original = [...requests];
    sortRequestsForCollection(requests);
    expect(requests).toEqual(original);
  });
});

describe("resequenceRequests", () => {
  it("reassigns gap-free 0..n-1 positions in sorted order", () => {
    const requests = [
      makeRequest({ id: "a", position: 5 }),
      makeRequest({ id: "b", position: 2 }),
      makeRequest({ id: "c", position: 9 }),
    ];
    const result = resequenceRequests(requests);
    expect(result.map((r) => [r.id, r.position])).toEqual([
      ["b", 0],
      ["a", 1],
      ["c", 2],
    ]);
  });
});

describe("reorderByIndex", () => {
  it("moves an item from one index to another, shifting everything between", () => {
    expect(reorderByIndex(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(reorderByIndex(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("returns the original array unchanged when `from` is out of range", () => {
    const items = ["a", "b"];
    expect(reorderByIndex(items, 5, 0)).toBe(items);
  });

  it("is a no-op when moving an item to its own index", () => {
    expect(reorderByIndex(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]);
  });
});
