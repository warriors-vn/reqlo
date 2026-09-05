import { useState } from "react";
import { useStore } from "@/stores/useStore";
import type { ApiRequest, ScriptConfig } from "@/services/db";
import { LazyTextCodeEditor } from "@/features/request-body/editors/LazyTextCodeEditor";
import { cn } from "@/lib/utils";

type Phase = "pre" | "post";

const PRE_PLACEHOLDER = `// Runs sandboxed before the request is sent — no fetch, DOM, or storage access.
// Return (don't throw) an object shaped { headers?, environment? }.
return {
  headers: { "X-Signature": request.method + ":" + request.url },
  environment: { nonce: String(Date.now()) },
};`;

const POST_PLACEHOLDER = `// Runs sandboxed after the response arrives.
// Declare checks with test(); a test fails by throwing.
test("responds 200", () => expect(response.status).toBe(200));
test("returns a token", () => {
  const body = JSON.parse(response.body);
  expect(body.token).toBeTruthy();
});

// Optionally feed a value into later requests:
return { environment: { authToken: JSON.parse(response.body).token } };`;

interface Props {
  request: ApiRequest;
}

export function RequestScriptEditor({ request }: Props) {
  const updateRequest = useStore((state) => state.updateRequest);
  const [phase, setPhase] = useState<Phase>("pre");

  const script: ScriptConfig =
    phase === "pre" ? request.preRequestScript : request.postResponseScript;
  const field = phase === "pre" ? "preRequestScript" : "postResponseScript";

  const setScript = (patch: Partial<ScriptConfig>) =>
    void updateRequest(request.id, { [field]: { ...script, ...patch } });

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Script phase"
        className="inline-flex gap-1 rounded-full border border-border/70 bg-muted/40 p-1"
      >
        {(
          [
            { id: "pre" as const, label: "Pre-request", on: request.preRequestScript.enabled },
            { id: "post" as const, label: "Post-response", on: request.postResponseScript.enabled },
          ] satisfies { id: Phase; label: string; on: boolean }[]
        ).map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={phase === item.id}
            onClick={() => setPhase(item.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition",
              phase === item.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
            {item.on && (
              <span
                className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]"
                aria-label="enabled"
                title="Enabled"
              />
            )}
          </button>
        ))}
      </div>

      <div className="flex items-start justify-between gap-4 rounded-[24px] border border-border/80 bg-background/70 p-4">
        <div>
          <div className="text-sm font-semibold tracking-tight">
            {phase === "pre" ? "Pre-request script" : "Post-response script"}
          </div>
          {phase === "pre" ? (
            <p className="mt-1 text-2xs text-muted-foreground">
              Runs sandboxed (QuickJS-in-wasm) right before this request is sent — for HMAC signing,
              a timestamp nonce, or anything Extract/Tests' path rules can't express. The script
              receives <code>request</code> (<code>method</code>, <code>url</code>,{" "}
              <code>headers</code>, <code>body</code>) and <code>environment</code> as plain
              objects, and must return (not throw) <code>{"{ headers?, environment? }"}</code> — it
              cannot make network calls, read the DOM, or touch storage. A 2-second budget applies;
              a timeout or thrown error is reported without blocking the request.
            </p>
          ) : (
            <p className="mt-1 text-2xs text-muted-foreground">
              Runs in the same sandbox once a response arrives. Adds <code>response</code> (
              <code>status</code>, <code>statusText</code>, <code>ok</code>, <code>headers</code>,{" "}
              <code>body</code>, <code>durationMs</code>) plus <code>test(name, fn)</code> and{" "}
              <code>expect(value)</code> with <code>toBe</code>, <code>toEqual</code>,{" "}
              <code>toContain</code> and <code>toBeTruthy</code>. A test fails by throwing, and
              every test still runs even after one fails. Return <code>{"{ environment? }"}</code>{" "}
              to feed a value into later requests. The response is never invalidated by a failing
              script — it already happened.
            </p>
          )}
        </div>
        <label className="flex shrink-0 items-center gap-2 pt-0.5">
          <input
            type="checkbox"
            checked={script.enabled}
            onChange={(event) => setScript({ enabled: event.target.checked })}
            className="h-3.5 w-3.5 accent-[var(--primary)]"
          />
          <span className="text-xs font-medium">{script.enabled ? "On" : "Off"}</span>
        </label>
      </div>

      {phase === "pre" && request.preRequestScript.enabled && request.mock.enabled && (
        <p className="rounded-xl border border-[var(--status-warn)]/30 bg-[var(--status-warn)]/10 px-3 py-2 text-2xs text-[var(--status-warn)]">
          Mock is also on for this request — Send returns the saved mock response without ever
          calling the network, so this script won't run. (A post-response script still does: it runs
          against the mock.)
        </p>
      )}

      <LazyTextCodeEditor
        language="javascript"
        value={script.source}
        onChange={(value) => setScript({ source: value })}
        placeholder={phase === "pre" ? PRE_PLACEHOLDER : POST_PLACEHOLDER}
        minHeight={220}
      />
    </div>
  );
}
