import { describe, expect, it } from "vitest";
import {
  parseKVText,
  serializeKVText,
  type KVTextRow,
} from "@/features/request-body/utils/kv-text";

describe("serializeKVText", () => {
  it("joins enabled rows as 'Key: Value' lines", () => {
    const rows: KVTextRow[] = [
      { key: "Accept", value: "application/json", enabled: true },
      { key: "X-Trace", value: "abc", enabled: true },
    ];
    expect(serializeKVText(rows)).toBe("Accept: application/json\nX-Trace: abc");
  });

  it("prefixes a disabled row with '# '", () => {
    const rows: KVTextRow[] = [{ key: "X-Debug", value: "1", enabled: false }];
    expect(serializeKVText(rows)).toBe("# X-Debug: 1");
  });

  it("drops the trailing ': ' for an empty value", () => {
    const rows: KVTextRow[] = [{ key: "X-Empty", value: "", enabled: true }];
    expect(serializeKVText(rows)).toBe("X-Empty:");
  });

  it("round-trips a value containing a colon intact", () => {
    const rows: KVTextRow[] = [{ key: "Authorization", value: "Bearer abc:123", enabled: true }];
    const text = serializeKVText(rows);
    expect(text).toBe("Authorization: Bearer abc:123");
    expect(parseKVText(text)).toEqual(rows);
  });

  it("escapes an enabled key that itself starts with '#' so it isn't read back as disabled", () => {
    const rows: KVTextRow[] = [{ key: "#token", value: "abc123", enabled: true }];
    const text = serializeKVText(rows);
    expect(text).toBe("##token: abc123");
    expect(parseKVText(text)).toEqual(rows);
  });

  it("round-trips a disabled row whose key itself starts with '#'", () => {
    const rows: KVTextRow[] = [{ key: "#token", value: "abc123", enabled: false }];
    const text = serializeKVText(rows);
    expect(text).toBe("# #token: abc123");
    expect(parseKVText(text)).toEqual(rows);
  });

  it("round-trips a key containing a colon (e.g. a 'filter:eq' REST convention)", () => {
    const rows: KVTextRow[] = [{ key: "filter:eq", value: "5", enabled: true }];
    const text = serializeKVText(rows);
    expect(text).toBe("filter:eq: 5");
    expect(parseKVText(text)).toEqual(rows);
  });

  it("round-trips a key with a colon and an empty value", () => {
    const rows: KVTextRow[] = [{ key: "filter:eq", value: "", enabled: true }];
    const text = serializeKVText(rows);
    expect(text).toBe("filter:eq:");
    expect(parseKVText(text)).toEqual(rows);
  });
});

describe("parseKVText", () => {
  it("parses a plain 'Key: Value' line as enabled", () => {
    expect(parseKVText("Accept: application/json")).toEqual([
      { key: "Accept", value: "application/json", enabled: true },
    ]);
  });

  it("parses a '#'-prefixed line as disabled, with or without a space after '#'", () => {
    expect(parseKVText("# X-Debug: 1\n#X-Trace: 2")).toEqual([
      { key: "X-Debug", value: "1", enabled: false },
      { key: "X-Trace", value: "2", enabled: false },
    ]);
  });

  it("treats a line with no colon as a key with an empty value", () => {
    expect(parseKVText("Accept")).toEqual([{ key: "Accept", value: "", enabled: true }]);
  });

  it("returns no rows for a completely empty text — clearing everything means zero rows, not a phantom blank one", () => {
    // A blank *line* elsewhere in otherwise non-empty text is different and
    // still produces its own row (see "produces exactly one row per line,
    // including a trailing blank line" below) — this case is specifically
    // about the whole document being empty, e.g. select-all-and-delete.
    expect(parseKVText("")).toEqual([]);
  });

  it("produces exactly one row per line, including a trailing blank line", () => {
    const text = "Accept: json\n";
    expect(parseKVText(text)).toEqual([
      { key: "Accept", value: "json", enabled: true },
      { key: "", value: "", enabled: true },
    ]);
  });

  it("splits only on the first colon, preserving colons inside the value", () => {
    expect(parseKVText("X-Ratio: 16:9")).toEqual([
      { key: "X-Ratio", value: "16:9", enabled: true },
    ]);
  });

  it("keeps a colon embedded in the key (not followed by a space) as part of the key", () => {
    expect(parseKVText("filter:eq: 5")).toEqual([{ key: "filter:eq", value: "5", enabled: true }]);
  });

  it("normalizes CRLF and lone-CR line endings so no '\\r' leaks into a value", () => {
    expect(parseKVText("a: 1\r\nb: 2\rc: 3")).toEqual([
      { key: "a", value: "1", enabled: true },
      { key: "b", value: "2", enabled: true },
      { key: "c", value: "3", enabled: true },
    ]);
  });

  it("reads a doubled leading '#' as an enabled key starting with a single '#'", () => {
    expect(parseKVText("##token: abc123")).toEqual([
      { key: "#token", value: "abc123", enabled: true },
    ]);
  });

  it("reads a triple leading '#' as an enabled key starting with '##'", () => {
    expect(parseKVText("###token: abc123")).toEqual([
      { key: "##token", value: "abc123", enabled: true },
    ]);
  });
});

describe("serializeKVText / parseKVText round-trip", () => {
  it("recovers the exact same rows for a mixed enabled/disabled set", () => {
    const rows: KVTextRow[] = [
      { key: "Accept", value: "application/json", enabled: true },
      { key: "X-Debug", value: "1", enabled: false },
      { key: "X-Empty", value: "", enabled: true },
    ];
    expect(parseKVText(serializeKVText(rows))).toEqual(rows);
  });
});
