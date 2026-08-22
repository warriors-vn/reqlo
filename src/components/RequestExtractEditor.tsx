import { useStore } from "@/stores/useStore";
import { createEmptyExtractRule, type ApiRequest } from "@/services/db";
import { resolveExtractPath, stringifyExtractedValue } from "@/services/extract";
import type { ExecutionResult } from "@/services/execution";
import { Plus, X } from "lucide-react";

interface Props {
  request: ApiRequest;
  result: ExecutionResult | null;
}

export function RequestExtractEditor({ request, result }: Props) {
  const updateRequest = useStore((state) => state.updateRequest);

  const update = (id: string, patch: Partial<(typeof request.extracts)[number]>) =>
    void updateRequest(request.id, {
      extracts: request.extracts.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
    });
  const remove = (id: string) =>
    void updateRequest(request.id, {
      extracts: request.extracts.filter((rule) => rule.id !== id),
    });
  const add = () =>
    void updateRequest(request.id, { extracts: [...request.extracts, createEmptyExtractRule()] });

  return (
    <div className="space-y-3">
      <p className="text-2xs text-muted-foreground">
        After this request sends, pull a field out of the JSON response straight into an environment
        variable — the usual reason people reach for scripting is just chaining an auth token into
        the next request.
      </p>

      {request.extracts.length === 0 && (
        <div className="rounded-[24px] border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
          No extract rules yet. Nothing is saved after sending this request.
        </div>
      )}

      {request.extracts.map((rule) => (
        <div
          key={rule.id}
          className="grid items-center gap-2 rounded-xl border border-border/80 bg-background/70 px-3 py-2 md:grid-cols-[auto_1fr_auto_1fr_auto]"
        >
          <input
            type="checkbox"
            checked={rule.enabled}
            onChange={(event) => update(rule.id, { enabled: event.target.checked })}
            className="h-3.5 w-3.5 accent-[var(--primary)]"
          />
          <input
            value={rule.path}
            onChange={(event) => update(rule.id, { path: event.target.value })}
            placeholder="data.token"
            spellCheck={false}
            className="h-8 rounded-lg border border-transparent bg-transparent px-2 font-mono text-xs outline-none focus:border-border focus:bg-background"
          />
          <span className="justify-self-center text-3xs uppercase tracking-wide text-muted-foreground">
            into
          </span>
          <input
            value={rule.variableName}
            onChange={(event) => update(rule.id, { variableName: event.target.value })}
            placeholder="AUTH_TOKEN"
            spellCheck={false}
            className="h-8 rounded-lg border border-transparent bg-transparent px-2 font-mono text-xs outline-none focus:border-border focus:bg-background"
          />
          <button
            onClick={() => remove(rule.id)}
            className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}

      <button
        onClick={add}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Plus className="h-3 w-3" /> Add extract rule
      </button>

      <LastResponsePreview request={request} result={result} />
    </div>
  );
}

function LastResponsePreview({
  request,
  result,
}: {
  request: ApiRequest;
  result: ExecutionResult | null;
}) {
  if (!result || result.responseKind !== "json" || !result.body || !request.extracts.length) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.body);
  } catch {
    return null;
  }

  return (
    <div className="rounded-[24px] border border-border/80 bg-background/70 p-4 shadow-[0_10px_32px_rgba(15,23,42,0.04)]">
      <div className="text-sm font-semibold tracking-tight">Last response preview</div>
      <div className="mt-3 space-y-2 text-2xs">
        {request.extracts
          .filter((rule) => rule.enabled && rule.path.trim())
          .map((rule) => {
            const resolved = resolveExtractPath(parsed, rule.path);
            return (
              <div
                key={rule.id}
                className="grid gap-2 rounded-xl border border-border/70 bg-background/70 px-3 py-2 md:grid-cols-[120px_1fr]"
              >
                <span className="truncate text-muted-foreground">{rule.path || "—"}</span>
                <span className="truncate font-mono text-foreground/90">
                  {resolved.ok
                    ? stringifyExtractedValue(resolved.value)
                    : "Not found in last response"}
                </span>
              </div>
            );
          })}
      </div>
    </div>
  );
}
