import { describe, expect, it } from "vitest";
import { fuzzyScore, scoreCommand } from "@/core/commands/fuzzy";
import type { CommandDescriptor } from "@/core/commands/types";

describe("fuzzyScore", () => {
  it("returns 1 for an empty needle regardless of haystack", () => {
    expect(fuzzyScore("", "anything")).toBe(1);
    expect(fuzzyScore("", "")).toBe(1);
  });

  it("scores a substring match higher the earlier it appears", () => {
    const early = fuzzyScore("send", "send request");
    const late = fuzzyScore("send", "request to send");
    expect(early).toBeGreaterThan(late);
  });

  it("is case-insensitive", () => {
    expect(fuzzyScore("SEND", "send request")).toBe(fuzzyScore("send", "send request"));
  });

  it("scores a subsequence match without a substring match", () => {
    // "sr" is a subsequence of "send request" (s...r) but not a substring.
    const score = fuzzyScore("sr", "send request");
    expect(score).toBeGreaterThan(0);
  });

  it("rewards consecutive-character streaks over scattered matches", () => {
    // "req" is contiguous in "send request"; "sqt" is scattered.
    const contiguous = fuzzyScore("req", "send request");
    const scattered = fuzzyScore("sqt", "send request");
    expect(contiguous).toBeGreaterThan(scattered);
  });

  it("returns 0 when the needle's characters aren't all present in order", () => {
    expect(fuzzyScore("xyz", "send request")).toBe(0);
    // "ts" isn't a subsequence of "send" because 't' never appears before 's'
    // resets the search position — s-e-n-d has no 't' at all.
    expect(fuzzyScore("dt", "send")).toBe(0);
  });
});

describe("scoreCommand", () => {
  const baseCommand: CommandDescriptor = {
    id: "request.send",
    title: "Send Request",
    category: "requests",
    run: () => {},
  };

  it("returns 1 for an empty query", () => {
    expect(scoreCommand(baseCommand, "")).toBe(1);
  });

  it("matches against the title", () => {
    expect(scoreCommand(baseCommand, "send")).toBeGreaterThan(0);
  });

  it("matches against the description when present", () => {
    const cmd: CommandDescriptor = {
      ...baseCommand,
      title: "Fire",
      description: "Dispatches the active request",
    };
    expect(scoreCommand(cmd, "dispatch")).toBeGreaterThan(0);
  });

  it("matches against keywords", () => {
    const cmd: CommandDescriptor = { ...baseCommand, title: "Fire", keywords: ["execute", "go"] };
    expect(scoreCommand(cmd, "execute")).toBeGreaterThan(0);
  });

  it("matches against the id", () => {
    expect(scoreCommand(baseCommand, "request.send")).toBeGreaterThan(0);
  });

  it("returns the best score across all fields, not just the title", () => {
    const cmd: CommandDescriptor = {
      ...baseCommand,
      title: "Zzzzzzzzz",
      keywords: ["send"],
    };
    // "send" is a perfect substring match in keywords but absent from the title,
    // so the best score should reflect the keyword match, not 0.
    expect(scoreCommand(cmd, "send")).toBe(fuzzyScore("send", "send"));
  });

  it("returns 0 when the query matches no field", () => {
    expect(scoreCommand(baseCommand, "qqqqzzzz")).toBe(0);
  });
});
