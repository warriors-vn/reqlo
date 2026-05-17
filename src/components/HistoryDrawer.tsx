import { Overlay } from "./Overlay";
import { useStore } from "@/stores/useStore";
import { MethodBadge } from "./MethodBadge";
import { cn } from "@/lib/utils";

export function HistoryDrawer() {
  const open = useStore(s => s.overlays.history);
  const close = () => useStore.getState().closeOverlay("history");
  const history = useStore(s => s.history);
  const requests = useStore(s => s.requests);
  const openRequest = useStore(s => s.openRequest);

  return (
    <Overlay open={open} onClose={close} title="History" subtitle={`${history.length} executions`} maxW="max-w-2xl">
      {history.length === 0 ? (
        <div className="py-10 text-center text-xs text-muted-foreground">No history yet. Send a request to get started.</div>
      ) : (
        <div className="divide-y divide-border">
          {history.map(h => {
            const req = h.requestId ? requests.find(r => r.id === h.requestId) : null;
            const status = h.errorMessage ? "ERR" : h.status ?? "—";
            const ok = h.ok;
            return (
              <button
                key={h.id}
                onClick={() => { if (req) { openRequest(req.id); close(); } }}
                className="flex w-full items-center gap-3 px-1 py-2.5 text-left transition hover:bg-accent/50"
              >
                <MethodBadge method={h.method} className="w-12 shrink-0 text-right" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-[11px]">{h.url}</div>
                  <div className="text-[10px] text-muted-foreground">{new Date(h.executedAt).toLocaleString()}</div>
                </div>
                <span className={cn(
                  "font-mono text-[11px] tabular-nums",
                  ok ? "text-[var(--status-success)]" : "text-destructive",
                )}>{status}</span>
                <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{h.durationMs.toFixed(0)}ms</span>
              </button>
            );
          })}
        </div>
      )}
    </Overlay>
  );
}
