import type { AssertionRule } from "@/services/db";
import type { ExecutionResult } from "@/services/execution";
import { resolveExtractPath, stringifyExtractedValue } from "@/services/extract";

export interface AssertionOutcome {
  rule: AssertionRule;
  passed: boolean;
  message: string;
}

export function evaluateAssertions(
  rules: AssertionRule[],
  result: ExecutionResult | null,
): AssertionOutcome[] {
  if (!result) return [];

  let parsedBody: unknown;
  if (result.responseKind === "json" && result.body) {
    try {
      parsedBody = JSON.parse(result.body);
    } catch {
      parsedBody = undefined;
    }
  }

  return rules.filter((rule) => rule.enabled).map((rule) => evaluateOne(rule, result, parsedBody));
}

function evaluateOne(
  rule: AssertionRule,
  result: ExecutionResult,
  parsedBody: unknown,
): AssertionOutcome {
  if (rule.kind === "status") {
    const expected = Number(rule.expected);
    const passed = result.status !== null && !Number.isNaN(expected) && result.status === expected;
    return {
      rule,
      passed,
      message: passed
        ? `Status is ${result.status}`
        : `Expected status ${rule.expected || "?"}, got ${result.status ?? "no response"}`,
    };
  }

  if (parsedBody === undefined) {
    return { rule, passed: false, message: "Response is not valid JSON" };
  }

  const resolved = resolveExtractPath(parsedBody, rule.path);

  if (rule.operator === "exists") {
    return {
      rule,
      passed: resolved.ok,
      message: resolved.ok ? `${rule.path} exists` : `${rule.path} not found in response`,
    };
  }

  if (!resolved.ok) {
    return { rule, passed: false, message: `${rule.path} not found in response` };
  }

  const actual = stringifyExtractedValue(resolved.value);
  if (rule.operator === "equals") {
    const passed = actual === rule.expected;
    return {
      rule,
      passed,
      message: passed
        ? `${rule.path} equals "${rule.expected}"`
        : `${rule.path} is "${actual}", expected "${rule.expected}"`,
    };
  }

  // contains
  const passed = actual.includes(rule.expected);
  return {
    rule,
    passed,
    message: passed
      ? `${rule.path} contains "${rule.expected}"`
      : `${rule.path} is "${actual}", doesn't contain "${rule.expected}"`,
  };
}
