import { describe, expect, it } from "vitest";
import { createEmptyKV } from "@/services/db";
import { composeUrl, splitUrl } from "@/lib/url-query";

describe("composeUrl", () => {
  it("appends only enabled rows", () => {
    const off = { ...createEmptyKV("skip", "1"), enabled: false };
    expect(composeUrl("https://a.dev/x", [createEmptyKV("q", "a b"), off])).toBe(
      "https://a.dev/x?q=a%20b",
    );
  });
  it("leaves {{vars}} unencoded", () => {
    expect(composeUrl("https://a.dev", [createEmptyKV("id", "{{userId}}")])).toBe(
      "https://a.dev?id={{userId}}",
    );
  });
});

describe("splitUrl", () => {
  it("moves the query string into rows so it isn't sent twice", () => {
    const { url, queryParams } = splitUrl("https://a.dev/x?a=1&b=two%20words", []);
    expect(url).toBe("https://a.dev/x");
    expect(queryParams.map((p) => [p.key, p.value])).toEqual([
      ["a", "1"],
      ["b", "two words"],
    ]);
  });
  it("keeps disabled rows and reuses ids by position", () => {
    const a = createEmptyKV("a", "1");
    const off = { ...createEmptyKV("x", "9"), enabled: false };
    const { queryParams } = splitUrl("https://a.dev?a=2", [a, off]);
    expect(queryParams[0]).toMatchObject({ id: a.id, key: "a", value: "2" });
    expect(queryParams[1].id).toBe(off.id);
  });
  it("drops rows whose pair was deleted from the URL", () => {
    const { queryParams } = splitUrl("https://a.dev", [createEmptyKV("a", "1")]);
    expect(queryParams).toEqual([]);
  });
  it("round-trips", () => {
    const rows = [createEmptyKV("q", "a&b"), createEmptyKV("t", "{{tok}}")];
    const text = composeUrl("https://a.dev", rows);
    const back = splitUrl(text, rows);
    expect(back.url).toBe("https://a.dev");
    expect(back.queryParams.map((p) => [p.key, p.value])).toEqual([
      ["q", "a&b"],
      ["t", "{{tok}}"],
    ]);
  });
});

it("ignores the blank placeholder row", () => {
  expect(composeUrl("https://a.dev", [createEmptyKV()])).toBe("https://a.dev");
});
