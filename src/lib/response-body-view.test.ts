import { describe, expect, it } from "vitest";
import {
  MAX_RESPONSE_RENDER_LENGTH,
  buildPrettyBody,
  truncateForRender,
} from "@/lib/response-body-view";

describe("buildPrettyBody", () => {
  it("pretty-prints small JSON bodies", () => {
    expect(buildPrettyBody('{"a":1}', "application/json")).toBe('{\n  "a": 1\n}');
  });

  it("falls back to the raw body on invalid JSON", () => {
    expect(buildPrettyBody("not json", "application/json")).toBe("not json");
  });

  it("returns non-JSON bodies unchanged", () => {
    expect(buildPrettyBody("hello world", "text/plain")).toBe("hello world");
  });

  it("skips parsing entirely once the body exceeds the render cap, even for valid JSON", () => {
    const bigArray = `[${"1,".repeat(MAX_RESPONSE_RENDER_LENGTH)}1]`;
    expect(buildPrettyBody(bigArray, "application/json")).toBe(bigArray);
  });

  it("falls back to the raw body when pretty-printing itself would exceed the cap", () => {
    // Each element is 2 raw chars ("1,") but several more once indented onto
    // its own line — a compact body under the cap can still balloon past it.
    const count = Math.floor(MAX_RESPONSE_RENDER_LENGTH / 4);
    const rawArray = `[${Array(count).fill("1").join(",")}]`;
    expect(rawArray.length).toBeLessThan(MAX_RESPONSE_RENDER_LENGTH);
    expect(buildPrettyBody(rawArray, "application/json")).toBe(rawArray);
  });
});

describe("truncateForRender", () => {
  it("returns text untouched when under the cap", () => {
    const result = truncateForRender("short body");
    expect(result).toEqual({ text: "short body", truncated: false, totalLength: 10 });
  });

  it("returns text untouched exactly at the cap", () => {
    const text = "a".repeat(MAX_RESPONSE_RENDER_LENGTH);
    const result = truncateForRender(text);
    expect(result.truncated).toBe(false);
    expect(result.text).toBe(text);
  });

  it("slices down to the cap once over it, and reports the full length", () => {
    const text = "a".repeat(MAX_RESPONSE_RENDER_LENGTH + 500);
    const result = truncateForRender(text);
    expect(result.truncated).toBe(true);
    expect(result.text).toHaveLength(MAX_RESPONSE_RENDER_LENGTH);
    expect(result.totalLength).toBe(MAX_RESPONSE_RENDER_LENGTH + 500);
  });

  it("backs off one code unit rather than splitting a surrogate pair at the cut", () => {
    // An astral-plane character (surrogate pair) landing exactly on the cut
    // boundary must not be split — the trailing high surrogate is dropped
    // too, rather than kept dangling with no low surrogate partner.
    const prefix = "a".repeat(MAX_RESPONSE_RENDER_LENGTH - 1);
    const text = prefix + "😀" + "b".repeat(10);
    const result = truncateForRender(text);
    expect(result.truncated).toBe(true);
    expect(result.text).toBe(prefix);
    expect(result.text.charCodeAt(result.text.length - 1)).toBeLessThan(0xd800);
  });
});
