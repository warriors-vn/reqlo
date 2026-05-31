import type { HistoryEntry } from "@/features/request-history/types";

export interface HistoryCompareRow {
  label: string;
  left: string;
  right: string;
  changed: boolean;
}

export interface HistoryCompareSection {
  title: string;
  rows: HistoryCompareRow[];
}

export function buildHistoryCompareSections(
  left: HistoryEntry,
  right: HistoryEntry,
): HistoryCompareSection[] {
  const overview: HistoryCompareRow[] = [
    row("Request", left.requestName || left.url, right.requestName || right.url),
    row("Method", left.method, right.method),
    row("URL", left.url, right.url),
    row("Environment", left.environmentName ?? "—", right.environmentName ?? "—"),
    row("Status", formatStatus(left), formatStatus(right)),
    row("Duration", `${left.durationMs.toFixed(0)} ms`, `${right.durationMs.toFixed(0)} ms`),
    row("Size", formatSize(left.sizeBytes), formatSize(right.sizeBytes)),
    row("Executed", formatDate(left.executedAt), formatDate(right.executedAt)),
  ];

  const snapshot: HistoryCompareRow[] = [
    row("Body Type", left.snapshot.bodyType, right.snapshot.bodyType),
    row("Auth Type", left.snapshot.auth.type, right.snapshot.auth.type),
    row("Headers", summarizeList(left.snapshot.headers), summarizeList(right.snapshot.headers)),
    row(
      "Query Params",
      summarizeList(left.snapshot.queryParams),
      summarizeList(right.snapshot.queryParams),
    ),
    row("Body", summarizeBody(left.snapshot.body), summarizeBody(right.snapshot.body)),
  ];

  const response: HistoryCompareRow[] = [
    row("OK", left.ok ? "true" : "false", right.ok ? "true" : "false"),
    row("Error", left.errorMessage ?? "—", right.errorMessage ?? "—"),
    row("Excerpt", left.responseExcerpt?.trim() || "—", right.responseExcerpt?.trim() || "—"),
  ];

  return [
    { title: "Overview", rows: overview },
    { title: "Snapshot", rows: snapshot },
    { title: "Response", rows: response },
  ].filter((section) => section.rows.some((item) => item.left !== "—" || item.right !== "—"));
}

function row(label: string, left: string, right: string): HistoryCompareRow {
  return { label, left, right, changed: left !== right };
}

function summarizeList(items: Array<{ key: string; value: string; enabled?: boolean }>) {
  const enabled = items.filter((item) => item.enabled ?? true);
  if (!enabled.length) return "—";
  return enabled.map((item) => `${item.key}: ${item.value}`).join("\n");
}

function summarizeBody(body: string) {
  const trimmed = body.trim();
  if (!trimmed) return "—";
  return trimmed.length > 280 ? `${trimmed.slice(0, 277)}...` : trimmed;
}

function formatStatus(entry: HistoryEntry) {
  if (entry.errorMessage) return `ERR · ${entry.errorMessage}`;
  return entry.status === null ? "—" : String(entry.status);
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}
