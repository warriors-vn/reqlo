import { describe, expect, it } from "vitest";
import { parseSseEvents } from "@/lib/sse";

describe("parseSseEvents", () => {
  it("parses a single data-only frame", () => {
    expect(parseSseEvents("data: hello\n\n")).toEqual([{ event: null, data: "hello", id: null }]);
  });

  it("parses multiple frames separated by a blank line", () => {
    expect(parseSseEvents("data: one\n\ndata: two\n\n")).toEqual([
      { event: null, data: "one", id: null },
      { event: null, data: "two", id: null },
    ]);
  });

  it("joins multiple data: lines within one frame with a newline", () => {
    expect(parseSseEvents("data: line1\ndata: line2\n\n")).toEqual([
      { event: null, data: "line1\nline2", id: null },
    ]);
  });

  it("captures event: and id: fields on the frame", () => {
    expect(parseSseEvents("event: update\nid: 42\ndata: hi\n\n")).toEqual([
      { event: "update", data: "hi", id: "42" },
    ]);
  });

  it("ignores comment lines starting with ':'", () => {
    expect(parseSseEvents(": keep-alive\ndata: hi\n\n")).toEqual([
      { event: null, data: "hi", id: null },
    ]);
  });

  it("strips exactly one leading space after the field colon, keeping the rest", () => {
    expect(parseSseEvents("data:  two spaces\n\n")).toEqual([
      { event: null, data: " two spaces", id: null },
    ]);
  });

  it("treats a line with no colon as a field name with an empty value", () => {
    expect(parseSseEvents("data\n\n")).toEqual([{ event: null, data: "", id: null }]);
  });

  it("flushes a trailing frame with no closing blank line (a still-arriving live stream)", () => {
    expect(parseSseEvents("data: partial")).toEqual([{ event: null, data: "partial", id: null }]);
  });

  it("returns nothing for empty input", () => {
    expect(parseSseEvents("")).toEqual([]);
  });

  it("normalizes CRLF line endings", () => {
    expect(parseSseEvents("data: one\r\n\r\ndata: two\r\n\r\n")).toEqual([
      { event: null, data: "one", id: null },
      { event: null, data: "two", id: null },
    ]);
  });

  it("ignores unrecognized fields (e.g. retry) without breaking the frame", () => {
    expect(parseSseEvents("retry: 3000\ndata: hi\n\n")).toEqual([
      { event: null, data: "hi", id: null },
    ]);
  });
});
