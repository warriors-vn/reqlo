import { describe, expect, it } from "vitest";
import { parseExtractPath, resolveExtractPath, stringifyExtractedValue } from "@/services/extract";

describe("parseExtractPath", () => {
  it("parses a plain key", () => {
    expect(parseExtractPath("token")).toEqual(["token"]);
  });

  it("parses a dotted path", () => {
    expect(parseExtractPath("data.token")).toEqual(["data", "token"]);
  });

  it("parses bracket indices", () => {
    expect(parseExtractPath("items[0]")).toEqual(["items", 0]);
  });

  it("parses a mixed key + multiple brackets", () => {
    expect(parseExtractPath("data.items[0][1].id")).toEqual(["data", "items", 0, 1, "id"]);
  });

  it("returns null for invalid syntax", () => {
    expect(parseExtractPath("data..token")).toBeNull();
    expect(parseExtractPath("data.[0]bad")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parseExtractPath("")).toBeNull();
    expect(parseExtractPath("   ")).toBeNull();
  });
});

describe("resolveExtractPath", () => {
  it("resolves nested object and array traversal", () => {
    const data = { data: { items: [{ id: "a" }, { id: "b" }] } };
    expect(resolveExtractPath(data, "data.items[1].id")).toEqual({ ok: true, value: "b" });
  });

  it("fails on a missing key", () => {
    expect(resolveExtractPath({ data: {} }, "data.missing")).toEqual({ ok: false });
  });

  it("short-circuits on null/undefined mid-path", () => {
    expect(resolveExtractPath({ data: null }, "data.token")).toEqual({ ok: false });
    expect(resolveExtractPath({}, "data.token")).toEqual({ ok: false });
  });

  it("fails indexing a non-array", () => {
    expect(resolveExtractPath({ data: {} }, "data[0]")).toEqual({ ok: false });
  });

  it("fails keying a non-object", () => {
    expect(resolveExtractPath({ data: 5 }, "data.token")).toEqual({ ok: false });
  });

  it("fails on an unparseable path", () => {
    expect(resolveExtractPath({ data: "x" }, "..bad")).toEqual({ ok: false });
  });
});

describe("stringifyExtractedValue", () => {
  it("passes strings through unchanged", () => {
    expect(stringifyExtractedValue("hello")).toBe("hello");
  });

  it("JSON-stringifies non-string values", () => {
    expect(stringifyExtractedValue(42)).toBe("42");
    expect(stringifyExtractedValue({ a: 1 })).toBe('{"a":1}');
    expect(stringifyExtractedValue(null)).toBe("null");
  });
});
