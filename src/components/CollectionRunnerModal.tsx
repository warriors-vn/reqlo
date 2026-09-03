import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, RotateCcw, Square, XCircle } from "lucide-react";
import { Overlay } from "@/components/Overlay";
import { useStore } from "@/stores/useStore";
import {
  collectRequestsInTreeOrder,
  runSingleRequest,
  type RunSingleRequestOutcome,
  type RunTarget,
} from "@/services/runner";
import { mergeGlobalsIntoEnvironment } from "@/features/code-snippets/utils/request-resolver";

interface RunRow {
  requestId: string;
  name: string;
  method: string;
  status: "pending" | "running" | "done";
  outcome?: RunSingleRequestOutcome;
}

/** Turns a thrown write failure (see the catch around runSingleRequest below)
 * into the same outcome shape a normal row gets, so RunRowView's existing
 * `outcome.result.error` rendering shows it with no extra cases to handle. */
function writeFailureOutcome(error: unknown): RunSingleRequestOutcome {
  const message = error instanceof Error ? error.message : "Couldn't save this request's result.";
  return {
    result: {
      status: null,
      statusText: "",
      durationMs: 0,
      sizeBytes: 0,
      headers: {},
      body: "",
      contentType: "",
      ok: false,
      responseKind: "empty",
      blob: null,
      fileName: null,
      error: message,
    },
    assertionOutcomes: [],
    extractedVariables: [],
    extractFailures: [],
    noActiveEnvironment: false,
    scriptEnvironmentDropped: false,
  };
}

function rowPassed(outcome: RunSingleRequestOutcome | undefined) {
  if (!outcome) return false;
  return (
    !outcome.result.error &&
    !outcome.result.scriptError &&
    outcome.result.ok &&
    outcome.assertionOutcomes.every((o) => o.passed)
  );
}

export function CollectionRunnerModal() {
  const open = useStore((s) => s.overlays.runner);
  const close = () => useStore.getState().closeOverlay("runner");
  const runnerTarget = useStore((s) => s.runnerTarget);
  const activeRun = useStore((s) => s.activeRun);
  const running = !!activeRun;
  const lastToken = useRef(0);
  const [rows, setRows] = useState<RunRow[]>([]);
  const [targetLabel, setTargetLabel] = useState("");

  const runNow = async (target: RunTarget, token: number, signal: AbortSignal) => {
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

    try {
      for (const request of orderedRequests) {
        if (signal.aborted) break;

        setRows((prev) =>
          prev.map((row) => (row.requestId === request.id ? { ...row, status: "running" } : row)),
        );

        // Re-read fresh every iteration — an Extract rule on an earlier request in
        // this same run may have just written the variable this one needs.
        const current = useStore.getState();
        const workspaceId = current.workspace?.id;
        if (!workspaceId) break;
        const rawEnvironment =
          current.environments.find((e) => e.id === current.activeEnvId) ?? null;
        const environment = mergeGlobalsIntoEnvironment(
          rawEnvironment,
          current.workspace?.globals ?? [],
        );

        // A write failure inside runSingleRequest (history/environment/request
        // persistence) now throws instead of failing silently — without this
        // catch, that row's status would stay stuck at "running" forever even
        // though the `finally` below already stops the run overall, and the
        // rest of an unattended batch run would never get a chance to execute.
        let outcome: RunSingleRequestOutcome;
        try {
          outcome = await runSingleRequest(
            request,
            environment,
            {
              workspaceId,
              addHistory: current.addHistory,
              updateEnvironment: current.updateEnvironment,
              updateRequest: current.updateRequest,
            },
            { signal },
          );
        } catch (error) {
          outcome = writeFailureOutcome(error);
        }

        setRows((prev) =>
          prev.map((row) =>
            row.requestId === request.id ? { ...row, status: "done", outcome } : row,
          ),
        );
      }
    } finally {
      useStore.getState().finishRun(token);
    }
  };

  useEffect(() => {
    // runnerTarget and activeRun are always set together by startRun, with
    // the same token — runnerTarget carries the {type, id} activeRun itself
    // doesn't duplicate.
    if (
      activeRun &&
      runnerTarget?.token === activeRun.token &&
      activeRun.token !== lastToken.current
    ) {
      lastToken.current = activeRun.token;
      void runNow(runnerTarget, activeRun.token, activeRun.controller.signal);
    }
  }, [activeRun, runnerTarget]);

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

        {running && (
          <button
            type="button"
            onClick={() => useStore.getState().stopRun()}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 text-xs font-medium text-destructive transition hover:bg-destructive/15"
          >
            <Square className="size-3 fill-current" /> Stop
          </button>
        )}

        {!running && runnerTarget && rows.length > 0 && (
          <button
            type="button"
            onClick={() => useStore.getState().startRun(runnerTarget)}
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
      {!outcome?.result.error && outcome?.result.scriptError && (
        <p className="mt-1.5 truncate text-3xs text-[var(--status-error)]">
          Script: {outcome.result.scriptError}
        </p>
      )}
      {/* `> 0` rather than a bare `.length`: an empty array would make the
          guard evaluate to 0, which React renders as a literal "0". */}
      {!outcome?.result.error && (outcome?.result.unresolvedVariables?.length ?? 0) > 0 && (
        <p className="mt-1.5 truncate text-3xs text-[var(--status-warn)]">
          Sent empty: {outcome?.result.unresolvedVariables?.map((name) => `{{${name}}}`).join(", ")}
        </p>
      )}
      {!outcome?.result.error &&
        !outcome?.result.scriptError &&
        outcome?.scriptEnvironmentDropped && (
          <p className="mt-1.5 truncate text-3xs text-[var(--status-error)]">
            Script's environment variable(s) not saved — no active environment.
          </p>
        )}
      {!outcome?.result.error &&
        !outcome?.result.scriptError &&
        !outcome?.scriptEnvironmentDropped &&
        failedAssertions.length > 0 && (
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
