import { describe, expect, it } from "vitest";
import { pruneStaleKeys } from "@/lib/prune-stale-keys";

describe("pruneStaleKeys", () => {
  it("drops keys not in keepIds", () => {
    const record = { a: 1, b: 2, c: 3 };
    const result = pruneStaleKeys(record, new Set(["b"]));
    expect(result).toEqual({ b: 2 });
  });

  it("returns the same reference when nothing is stale", () => {
    const record = { a: 1, b: 2 };
    const result = pruneStaleKeys(record, new Set(["a", "b", "c"]));
    expect(result).toBe(record);
  });

  it("returns an empty object when keepIds is empty", () => {
    const record = { a: 1, b: 2 };
    const result = pruneStaleKeys(record, new Set());
    expect(result).toEqual({});
  });

  it("is a no-op on an already-empty record", () => {
    const record = {};
    const result = pruneStaleKeys(record, new Set(["a"]));
    expect(result).toBe(record);
  });
});
