import type { AssertionRule } from "@/services/db";
import type { ExecutionResult } from "@/services/execution";
import { resolveExtractPath, stringifyExtractedValue } from "@/services/extract";
import { MAX_RESPONSE_RENDER_LENGTH } from "@/lib/response-body-view";

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
  // JSON.parse on a body this large is itself the tab-freezing operation the
  // response-render cap was meant to prevent — skip parsing rather than
  // block the main thread on it. jsonBody rules below report why explicitly,
  // same as the "not valid JSON" case does.
  const tooLargeToParse = result.body.length > MAX_RESPONSE_RENDER_LENGTH;
  if (result.responseKind === "json" && result.body && !tooLargeToParse) {
    try {
      parsedBody = JSON.parse(result.body);
    } catch {
      parsedBody = undefined;
    }
  }

  return rules
    .filter((rule) => rule.enabled)
    .map((rule) => evaluateOne(rule, result, parsedBody, tooLargeToParse));
}

function evaluateOne(
  rule: AssertionRule,
  result: ExecutionResult,
  parsedBody: unknown,
  tooLargeToParse: boolean,
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
    return {
      rule,
      passed: false,
      message: tooLargeToParse ? "Response is too large to evaluate" : "Response is not valid JSON",
    };
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
