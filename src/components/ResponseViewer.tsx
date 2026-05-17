import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Copy, Check } from "lucide-react";

export interface ExecutionResult {
  status: number | null;
  statusText: string;
  durationMs: number;
  sizeBytes: number;
  headers: Record<string, string>;
  body: string;
  contentType: string;
  ok: boolean;
  error?: string;
}

export function ResponseViewer({ result, loading }: { result: ExecutionResult | null; loading: boolean }) {
  const [tab, setTab] = useState<"body" | "headers">("body");
  const [copied, setCopied] = useState(false);

  const prettyBody = useMemo(() => {
    if (!result) return "";
    if (result.contentType.includes("json")) {
      try { return JSON.stringify(JSON.parse(result.body), null, 2); } catch { return result.body; }
    }
    return result.body;
  }, [result]);

  if (loading && !result) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          Sending request…
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
        <div className="text-xs font-medium text-foreground/70">No response yet</div>
        <div className="text-[11px] text-muted-foreground">
          Press <kbd className="rounded border border-border bg-[var(--surface)] px-1 font-mono">⌘ ↵</kbd> to send
        </div>
      </div>
    );
  }

  const statusColor =
    result.error ? "text-destructive" :
    result.status && result.status >= 200 && result.status < 300 ? "text-[var(--status-success)]" :
    result.status && result.status >= 400 ? "text-destructive" :
    "text-[var(--status-warn)]";

  return (
    <div className="flex h-full flex-col">
      {/* Status bar */}
      <div className="flex h-9 items-center gap-4 border-b border-border bg-[var(--surface)] px-4 text-[11px]">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Status</span>
          <span className={cn("font-mono font-semibold", statusColor)}>
            {result.error ? "ERROR" : `${result.status} ${result.statusText}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Time</span>
          <span className="font-mono">{result.durationMs.toFixed(0)} ms</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Size</span>
          <span className="font-mono">{formatBytes(result.sizeBytes)}</span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {(["body", "headers"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-md px-2 py-1 text-[11px] font-medium transition",
                tab === t ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60",
              )}
            >
              {t === "body" ? "Body" : `Headers (${Object.keys(result.headers).length})`}
            </button>
          ))}
          <button
            onClick={() => {
              navigator.clipboard.writeText(tab === "body" ? prettyBody : JSON.stringify(result.headers, null, 2));
              setCopied(true); setTimeout(() => setCopied(false), 1200);
            }}
            className="ml-1 grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Copy"
          >
            {copied ? <Check className="h-3 w-3 text-[var(--status-success)]" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-auto bg-[var(--surface-elevated)]">
        {result.error ? (
          <div className="p-4">
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              {result.error}
            </div>
          </div>
        ) : tab === "body" ? (
          <pre className="p-4 font-mono text-[12px] leading-relaxed text-foreground/90">{prettyBody || <span className="text-muted-foreground">(empty body)</span>}</pre>
        ) : (
          <div className="divide-y divide-border">
            {Object.entries(result.headers).map(([k, v]) => (
              <div key={k} className="grid grid-cols-[180px_1fr] gap-3 px-4 py-2 font-mono text-[11px]">
                <span className="truncate text-muted-foreground">{k}</span>
                <span className="break-all text-foreground/90">{v}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
