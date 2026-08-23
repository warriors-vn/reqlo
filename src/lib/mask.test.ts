import { describe, expect, it } from "vitest";
import { maskPreview } from "@/lib/mask";

describe("maskPreview", () => {
  it("returns a placeholder for an empty value", () => {
    expect(maskPreview("")).toBe("(empty)");
  });

  it("masks short values (<=6 chars) entirely", () => {
    expect(maskPreview("abc")).toBe("•••");
    expect(maskPreview("abcdef")).toBe("••••••");
  });

  it("keeps the first 3 and last 2 characters for longer values", () => {
    expect(maskPreview("abcdefgh")).toBe("abc•••gh");
  });

  it("caps the masked middle section at 8 dots for very long values", () => {
    const long = "a".repeat(50) + "zz";
    const result = maskPreview(long);
    expect(result.startsWith("aaa")).toBe(true);
    expect(result.endsWith("zz")).toBe(true);
    expect(result).toBe(`aaa${"•".repeat(8)}zz`);
  });
});
