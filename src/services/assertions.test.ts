import { describe, expect, it } from "vitest";
import { evaluateAssertions } from "@/services/assertions";
import type { AssertionRule } from "@/services/db";
import type { ExecutionResult } from "@/services/execution";

function makeResult(overrides: Partial<ExecutionResult> = {}): ExecutionResult {
  return {
    status: 200,
    statusText: "OK",
    durationMs: 10,
    sizeBytes: 0,
    headers: {},
    body: "",
    contentType: "application/json",
    ok: true,
    responseKind: "json",
    blob: null,
    fileName: null,
    ...overrides,
  };
}

function makeRule(overrides: Partial<AssertionRule> = {}): AssertionRule {
  return {
    id: "r1",
    enabled: true,
    kind: "status",
    path: "",
    operator: "equals",
    expected: "200",
    ...overrides,
  };
}

describe("evaluateAssertions", () => {
  it("returns an empty array when there is no result yet", () => {
    expect(evaluateAssertions([makeRule()], null)).toEqual([]);
  });

  it("filters out disabled rules", () => {
    const rules = [makeRule({ id: "a", enabled: false }), makeRule({ id: "b", enabled: true })];
    const outcomes = evaluateAssertions(rules, makeResult());
    expect(outcomes.map((o) => o.rule.id)).toEqual(["b"]);
  });

  describe("status kind", () => {
    it("passes on a matching status", () => {
      const [outcome] = evaluateAssertions(
        [makeRule({ expected: "200" })],
        makeResult({ status: 200 }),
      );
      expect(outcome.passed).toBe(true);
      expect(outcome.message).toBe("Status is 200");
    });

    it("fails on a mismatched status", () => {
      const [outcome] = evaluateAssertions(
        [makeRule({ expected: "404" })],
        makeResult({ status: 200 }),
      );
      expect(outcome.passed).toBe(false);
      expect(outcome.message).toBe("Expected status 404, got 200");
    });

    it("fails when there is no response status", () => {
      const [outcome] = evaluateAssertions(
        [makeRule({ expected: "200" })],
        makeResult({ status: null }),
      );
      expect(outcome.passed).toBe(false);
      expect(outcome.message).toBe("Expected status 200, got no response");
    });

    it("fails on a non-numeric expected value", () => {
      const [outcome] = evaluateAssertions(
        [makeRule({ expected: "not-a-number" })],
        makeResult({ status: 200 }),
      );
      expect(outcome.passed).toBe(false);
    });
  });

  describe("jsonBody kind", () => {
    const body = JSON.stringify({ data: { token: "abc123" }, count: 2 });

    it("short-circuits every jsonBody rule when the body isn't valid JSON", () => {
      const rules = [makeRule({ kind: "jsonBody", operator: "exists", path: "data.token" })];
      const [outcome] = evaluateAssertions(rules, makeResult({ body: "not json" }));
      expect(outcome.passed).toBe(false);
      expect(outcome.message).toBe("Response is not valid JSON");
    });

    it("exists: passes when the path resolves, fails when it doesn't", () => {
      const rules = [
        makeRule({ id: "hit", kind: "jsonBody", operator: "exists", path: "data.token" }),
        makeRule({ id: "miss", kind: "jsonBody", operator: "exists", path: "data.missing" }),
      ];
      const [hit, miss] = evaluateAssertions(rules, makeResult({ body }));
      expect(hit.passed).toBe(true);
      expect(miss.passed).toBe(false);
      expect(miss.message).toBe("data.missing not found in response");
    });

    it("equals: passes on an exact match, fails otherwise", () => {
      const rules = [
        makeRule({ id: "hit", kind: "jsonBody", operator: "equals", path: "count", expected: "2" }),
        makeRule({
          id: "miss",
          kind: "jsonBody",
          operator: "equals",
          path: "count",
          expected: "3",
        }),
      ];
      const [hit, miss] = evaluateAssertions(rules, makeResult({ body }));
      expect(hit.passed).toBe(true);
      expect(miss.passed).toBe(false);
      expect(miss.message).toBe('count is "2", expected "3"');
    });

    it("contains: passes on a substring match, fails otherwise", () => {
      const rules = [
        makeRule({
          id: "hit",
          kind: "jsonBody",
          operator: "contains",
          path: "data.token",
          expected: "123",
        }),
        makeRule({
          id: "miss",
          kind: "jsonBody",
          operator: "contains",
          path: "data.token",
          expected: "zzz",
        }),
      ];
      const [hit, miss] = evaluateAssertions(rules, makeResult({ body }));
      expect(hit.passed).toBe(true);
      expect(miss.passed).toBe(false);
    });

    it("equals/contains fail when the path itself doesn't resolve", () => {
      const rules = [
        makeRule({ kind: "jsonBody", operator: "equals", path: "data.missing", expected: "x" }),
      ];
      const [outcome] = evaluateAssertions(rules, makeResult({ body }));
      expect(outcome.passed).toBe(false);
      expect(outcome.message).toBe("data.missing not found in response");
    });
  });
});
