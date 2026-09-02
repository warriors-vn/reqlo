import { describe, expect, it } from "vitest";
import { looksLikeJson } from "@/services/import-shared";

describe("looksLikeJson", () => {
  it("recognizes an object literal", () => {
    expect(looksLikeJson('{"a":1}')).toBe(true);
  });

  it("recognizes an array literal", () => {
    expect(looksLikeJson("[1,2,3]")).toBe(true);
  });

  it("tolerates surrounding whitespace", () => {
    expect(looksLikeJson('  {"a":1}  \n')).toBe(true);
  });

  it("rejects plain text", () => {
    expect(looksLikeJson("hello world")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(looksLikeJson("")).toBe(false);
  });
});
