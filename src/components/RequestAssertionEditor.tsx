import { useStore } from "@/stores/useStore";
import {
  createEmptyAssertionRule,
  type ApiRequest,
  type AssertionKind,
  type AssertionOperator,
} from "@/services/db";
import { evaluateAssertions } from "@/services/assertions";
import type { ExecutionResult } from "@/services/execution";
import { CheckCircle2, XCircle, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  request: ApiRequest;
  result: ExecutionResult | null;
}

export function RequestAssertionEditor({ request, result }: Props) {
  const updateRequest = useStore((state) => state.updateRequest);

  const update = (id: string, patch: Partial<(typeof request.assertions)[number]>) =>
    void updateRequest(request.id, {
      assertions: request.assertions.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
    });
  const remove = (id: string) =>
    void updateRequest(request.id, {
      assertions: request.assertions.filter((rule) => rule.id !== id),
    });
  const add = () =>
    void updateRequest(request.id, {
      assertions: [...request.assertions, createEmptyAssertionRule()],
    });

  const outcomes = evaluateAssertions(request.assertions, result);
  const outcomeByRuleId = new Map(outcomes.map((outcome) => [outcome.rule.id, outcome]));

  return (
    <div className="space-y-3">
      <p className="text-2xs text-muted-foreground">
        A structured check, not a script — "status is 200" or "body has field X" covers most of what
        people reach for Postman's test scripts for. Rules run after every Send. For anything these
        can't express, the Script tab's post-response phase runs real{" "}
        <code className="font-mono">test()</code> calls; their results show below.
      </p>

      {!!result?.scriptTests?.length && (
        <div className="space-y-1.5 rounded-xl border border-border/80 bg-background/70 px-3 py-2">
          <div className="text-3xs font-medium uppercase tracking-wide text-muted-foreground">
            From the post-response script
          </div>
          {result.scriptTests.map((test, index) => (
            <div key={`${test.name}-${index}`} className="flex items-start gap-2 text-xs">
              <span
                className={cn(
                  "mt-0.5 shrink-0 font-semibold",
                  test.passed ? "text-[var(--status-ok)]" : "text-destructive",
                )}
              >
                {test.passed ? "PASS" : "FAIL"}
              </span>
              <span className="min-w-0">
                <span className="text-foreground">{test.name}</span>
                {!test.passed && test.message && (
                  <span className="ml-1.5 text-muted-foreground">— {test.message}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {result?.postScriptError && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-2xs text-destructive">
          Post-response script failed: {result.postScriptError}
        </p>
      )}

      {request.assertions.length === 0 && (
        <div className="rounded-[24px] border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
          No test rules yet. Nothing is checked after sending this request.
        </div>
      )}

      {request.assertions.map((rule) => {
        const outcome = result ? outcomeByRuleId.get(rule.id) : undefined;
        return (
          <div
            key={rule.id}
            className="space-y-2 rounded-xl border border-border/80 bg-background/70 px-3 py-2"
          >
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="checkbox"
                checked={rule.enabled}
                onChange={(event) => update(rule.id, { enabled: event.target.checked })}
                className="h-3.5 w-3.5 accent-[var(--primary)]"
              />
              <select
                value={rule.kind}
                onChange={(event) => update(rule.id, { kind: event.target.value as AssertionKind })}
                className="h-8 rounded-lg border border-border/80 bg-background px-2 text-xs outline-none"
              >
                <option value="status">Status</option>
                <option value="jsonBody">Body field</option>
              </select>

              {rule.kind === "status" ? (
                <>
                  <span className="text-2xs text-muted-foreground">is</span>
                  <input
                    value={rule.expected}
                    onChange={(event) => update(rule.id, { expected: event.target.value })}
                    placeholder="200"
                    inputMode="numeric"
                    className="h-8 w-20 rounded-lg border border-transparent bg-transparent px-2 font-mono text-xs outline-none focus:border-border focus:bg-background"
                  />
                </>
              ) : (
                <>
                  <input
                    value={rule.path}
                    onChange={(event) => update(rule.id, { path: event.target.value })}
                    placeholder="data.id"
                    spellCheck={false}
                    className="h-8 flex-1 rounded-lg border border-transparent bg-transparent px-2 font-mono text-xs outline-none focus:border-border focus:bg-background"
                  />
                  <select
                    value={rule.operator}
                    onChange={(event) =>
                      update(rule.id, { operator: event.target.value as AssertionOperator })
                    }
                    className="h-8 rounded-lg border border-border/80 bg-background px-2 text-xs outline-none"
                  >
                    <option value="exists">exists</option>
                    <option value="equals">equals</option>
                    <option value="contains">contains</option>
                  </select>
                  {rule.operator !== "exists" && (
                    <input
                      value={rule.expected}
                      onChange={(event) => update(rule.id, { expected: event.target.value })}
                      placeholder="expected value"
                      className="h-8 flex-1 rounded-lg border border-transparent bg-transparent px-2 font-mono text-xs outline-none focus:border-border focus:bg-background"
                    />
                  )}
                </>
              )}

              <button
                onClick={() => remove(rule.id)}
                aria-label={
                  rule.kind === "jsonBody" && rule.path
                    ? `Remove rule for ${rule.path}`
                    : "Remove test rule"
                }
                className="ml-auto grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </div>

            {outcome && (
              <div
                className={cn(
                  "flex items-center gap-1.5 text-2xs",
                  outcome.passed ? "text-[var(--status-success)]" : "text-destructive",
                )}
              >
                {outcome.passed ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 shrink-0" />
                )}
                <span>{outcome.message}</span>
              </div>
            )}
          </div>
        );
      })}

      <button
        onClick={add}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Plus className="h-3 w-3" /> Add test
      </button>
    </div>
  );
}
