import { useStore } from "@/stores/useStore";
import type { ApiRequest } from "@/services/db";
import { LazyTextCodeEditor } from "@/features/request-body/editors/LazyTextCodeEditor";

const PLACEHOLDER = `// Runs sandboxed before the request is sent — no fetch, DOM, or storage access.
// Return (don't throw) an object shaped { headers?, environment? }.
return {
  headers: { "X-Signature": request.method + ":" + request.url },
  environment: { nonce: String(Date.now()) },
};`;

interface Props {
  request: ApiRequest;
}

export function RequestScriptEditor({ request }: Props) {
  const updateRequest = useStore((state) => state.updateRequest);
  const { preRequestScript } = request;

  const setScript = (patch: Partial<ApiRequest["preRequestScript"]>) =>
    void updateRequest(request.id, { preRequestScript: { ...preRequestScript, ...patch } });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 rounded-[24px] border border-border/80 bg-background/70 p-4">
        <div>
          <div className="text-sm font-semibold tracking-tight">Pre-request script</div>
          <p className="mt-1 text-2xs text-muted-foreground">
            Runs sandboxed (QuickJS-in-wasm) right before this request is sent — for HMAC signing, a
            timestamp nonce, or anything Extract/Tests' path rules can't express. The script
            receives <code>request</code> (<code>method</code>, <code>url</code>,{" "}
            <code>headers</code>, <code>body</code>) and <code>environment</code> as plain objects,
            and must return (not throw) <code>{"{ headers?, environment? }"}</code> — it cannot make
            network calls, read the DOM, or touch storage. A 2-second budget applies; a timeout or
            thrown error is reported without blocking the request.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 pt-0.5">
          <input
            type="checkbox"
            checked={preRequestScript.enabled}
            onChange={(event) => setScript({ enabled: event.target.checked })}
            className="h-3.5 w-3.5 accent-[var(--primary)]"
          />
          <span className="text-xs font-medium">{preRequestScript.enabled ? "On" : "Off"}</span>
        </label>
      </div>

      {preRequestScript.enabled && request.mock.enabled && (
        <p className="rounded-xl border border-[var(--status-warn)]/30 bg-[var(--status-warn)]/10 px-3 py-2 text-2xs text-[var(--status-warn)]">
          Mock is also on for this request — Send returns the saved mock response without ever
          calling the network, so this script won't run.
        </p>
      )}

      <LazyTextCodeEditor
        language="javascript"
        value={preRequestScript.source}
        onChange={(value) => setScript({ source: value })}
        placeholder={PLACEHOLDER}
        minHeight={220}
      />
    </div>
  );
}
