import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, RotateCcw, XCircle } from "lucide-react";
import { Overlay } from "@/components/Overlay";
import { useStore } from "@/stores/useStore";
import {
  collectRequestsInTreeOrder,
  runSingleRequest,
  type RunSingleRequestOutcome,
  type RunTarget,
} from "@/services/runner";

interface RunRow {
  requestId: string;
  name: string;
  method: string;
  status: "pending" | "running" | "done";
  outcome?: RunSingleRequestOutcome;
}

function rowPassed(outcome: RunSingleRequestOutcome | undefined) {
  if (!outcome) return false;
  return (
    !outcome.result.error && outcome.result.ok && outcome.assertionOutcomes.every((o) => o.passed)
  );
}

export function CollectionRunnerModal() {
  const open = useStore((s) => s.overlays.runner);
  const close = () => useStore.getState().closeOverlay("runner");
  const runnerTarget = useStore((s) => s.runnerTarget);
  const lastToken = useRef(0);
  const [rows, setRows] = useState<RunRow[]>([]);
  const [targetLabel, setTargetLabel] = useState("");
  const [running, setRunning] = useState(false);

  const runNow = async (target: RunTarget) => {
    const initial = useStore.getState();
    const label =
      target.type === "collection"
        ? (initial.collections.find((c) => c.id === target.id)?.name ?? "Collection")
        : (initial.folders.find((f) => f.id === target.id)?.name ?? "Folder");
    setTargetLabel(label);

    const orderedRequests = collectRequestsInTreeOrder(target, initial.requests, initial.folders);
    setRows(
      orderedRequests.map((r) => ({
        requestId: r.id,
        name: r.name,
        method: r.method,
        status: "pending",
      })),
    );
    setRunning(true);

    for (const request of orderedRequests) {
      setRows((prev) =>
        prev.map((row) => (row.requestId === request.id ? { ...row, status: "running" } : row)),
      );

      // Re-read fresh every iteration — an Extract rule on an earlier request in
      // this same run may have just written the variable this one needs.
      const current = useStore.getState();
      const workspaceId = current.workspace?.id;
      if (!workspaceId) break;
      const environment = current.environments.find((e) => e.id === current.activeEnvId) ?? null;

      const outcome = await runSingleRequest(request, environment, {
        workspaceId,
        addHistory: current.addHistory,
        updateEnvironment: current.updateEnvironment,
      });

      setRows((prev) =>
        prev.map((row) =>
          row.requestId === request.id ? { ...row, status: "done", outcome } : row,
        ),
      );
    }

    setRunning(false);
  };

  useEffect(() => {
    if (runnerTarget && runnerTarget.token !== lastToken.current) {
      lastToken.current = runnerTarget.token;
      void runNow(runnerTarget);
    }
  }, [runnerTarget]);

  const completed = rows.filter((r) => r.status === "done");
  const passedRequests = completed.filter((r) => rowPassed(r.outcome)).length;
  const totalAssertions = completed.reduce(
    (sum, r) => sum + (r.outcome?.assertionOutcomes.length ?? 0),
    0,
  );
  const passedAssertions = completed.reduce(
    (sum, r) => sum + (r.outcome?.assertionOutcomes.filter((o) => o.passed).length ?? 0),
    0,
  );

  return (
    <Overlay
      open={open}
      onClose={close}
      title={targetLabel ? `Run: ${targetLabel}` : "Run all requests"}
      subtitle={
        running
          ? "Running…"
          : rows.length
            ? `${completed.length}/${rows.length} complete`
            : undefined
      }
      maxW="max-w-2xl"
    >
      <div className="space-y-3">
        {rows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/80 bg-muted/20 px-3 py-2 text-2xs">
            <span className="font-medium">
              {passedRequests}/{rows.length} requests passed
            </span>
            {totalAssertions > 0 && (
              <span className="text-muted-foreground">
                {passedAssertions}/{totalAssertions} tests passed
              </span>
            )}
          </div>
        )}

        <div className="max-h-[50vh] space-y-1.5 overflow-auto">
          {rows.map((row) => (
            <RunRowView key={row.requestId} row={row} />
          ))}
          {rows.length === 0 && (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 px-3 py-8 text-center text-2xs text-muted-foreground">
              Nothing to run — this collection has no requests yet.
            </div>
          )}
        </div>

        {!running && runnerTarget && rows.length > 0 && (
          <button
            type="button"
            onClick={() => void runNow(runnerTarget)}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-border/80 bg-background/80 px-3.5 text-xs font-medium transition hover:border-foreground/15 hover:bg-accent"
          >
            <RotateCcw className="size-3.5" /> Run again
          </button>
        )}
      </div>
    </Overlay>
  );
}

function RunRowView({ row }: { row: RunRow }) {
  const passed = row.status === "done" ? rowPassed(row.outcome) : null;
  const outcome = row.outcome;
  const failedAssertions = outcome?.assertionOutcomes.filter((o) => !o.passed) ?? [];

  return (
    <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-2">
      <div className="flex items-center gap-2">
        <StatusIcon status={row.status} passed={passed} />
        <span className="w-14 shrink-0 font-mono text-3xs font-semibold uppercase tracking-wide text-muted-foreground">
          {row.method}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{row.name}</span>
        {outcome && (
          <span className="shrink-0 text-3xs text-muted-foreground">
            {outcome.result.status ?? "—"} · {Math.round(outcome.result.durationMs)}ms
          </span>
        )}
      </div>
      {outcome?.result.error && (
        <p className="mt-1.5 truncate text-3xs text-[var(--status-error)]">
          {outcome.result.error}
        </p>
      )}
      {!outcome?.result.error && failedAssertions.length > 0 && (
        <p className="mt-1.5 truncate text-3xs text-[var(--status-error)]">
          {failedAssertions
            .slice(0, 2)
            .map((o) => o.message)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}

function StatusIcon({ status, passed }: { status: RunRow["status"]; passed: boolean | null }) {
  if (status === "pending") {
    return <span className="size-3.5 shrink-0 rounded-full border border-border" />;
  }
  if (status === "running") {
    return <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />;
  }
  return passed ? (
    <CheckCircle2 className="size-3.5 shrink-0 text-[var(--status-success)]" />
  ) : (
    <XCircle className="size-3.5 shrink-0 text-[var(--status-error)]" />
  );
}
