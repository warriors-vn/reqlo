import type { HistoryEntry } from "@/features/request-history/types";
import { formatBytes, formatResponseKindLabel } from "@/services/execution";

export interface HistoryCompareRow {
  label: string;
  left: string;
  right: string;
  changed: boolean;
}

export interface HistoryCompareDiffEntry {
  key: string;
  left: string;
  right: string;
  state: "added" | "removed" | "changed";
}

export interface HistoryCompareTextEntry {
  leftLineNumber: number | null;
  rightLineNumber: number | null;
  left: string;
  right: string;
  changed: boolean;
}

export type HistoryCompareSection =
  | {
      title: string;
      kind: "rows";
      rows: HistoryCompareRow[];
      description?: string;
    }
  | {
      title: string;
      kind: "diff-list";
      entries: HistoryCompareDiffEntry[];
      emptyLabel: string;
      description?: string;
    }
  | {
      title: string;
      kind: "text";
      entries: HistoryCompareTextEntry[];
      emptyLabel: string;
      description?: string;
    };

export function buildHistoryCompareSections(
  left: HistoryEntry,
  right: HistoryEntry,
): HistoryCompareSection[] {
  const sections: HistoryCompareSection[] = [
    {
      title: "Overview",
      kind: "rows",
      rows: [
        row("Request", left.requestName || left.url, right.requestName || right.url),
        row("Method", left.method, right.method),
        row("URL", left.url, right.url),
        row("Environment", left.environmentName ?? "—", right.environmentName ?? "—"),
        row("Status", formatStatus(left), formatStatus(right)),
        row("Duration", `${left.durationMs.toFixed(0)} ms`, `${right.durationMs.toFixed(0)} ms`),
        row("Size", formatBytes(left.sizeBytes), formatBytes(right.sizeBytes)),
        row("Executed", formatDate(left.executedAt), formatDate(right.executedAt)),
      ],
    },
    {
      title: "Request snapshot",
      kind: "rows",
      rows: [
        row("Body Type", left.snapshot.bodyType, right.snapshot.bodyType),
        row("Auth Type", left.snapshot.auth.type, right.snapshot.auth.type),
        row(
          "Headers",
          `${enabledCount(left.snapshot.headers)} enabled`,
          `${enabledCount(right.snapshot.headers)} enabled`,
        ),
        row(
          "Query Params",
          `${enabledCount(left.snapshot.queryParams)} enabled`,
          `${enabledCount(right.snapshot.queryParams)} enabled`,
        ),
      ],
    },
    {
      title: "Request headers",
      kind: "diff-list",
      entries: diffKeyValueLists(left.snapshot.headers, right.snapshot.headers),
      emptyLabel: "No request header differences.",
      description: "Only enabled headers are compared.",
    },
    {
      title: "Request query params",
      kind: "diff-list",
      entries: diffKeyValueLists(left.snapshot.queryParams, right.snapshot.queryParams),
      emptyLabel: "No request query parameter differences.",
      description: "Only enabled params are compared.",
    },
    buildBodySection(
      "Request body",
      left.snapshot.body,
      right.snapshot.body,
      left.snapshot.bodyType === "json" && right.snapshot.bodyType === "json",
      left.snapshot.bodyType,
      right.snapshot.bodyType,
    ),
    {
      title: "Response metadata",
      kind: "rows",
      rows: [
        row("OK", left.ok ? "true" : "false", right.ok ? "true" : "false"),
        row("Error", left.errorMessage ?? "—", right.errorMessage ?? "—"),
        row("Excerpt", left.responseExcerpt?.trim() || "—", right.responseExcerpt?.trim() || "—"),
        row(
          "Kind",
          formatResponseKindLabel(left.responseKind),
          formatResponseKindLabel(right.responseKind),
        ),
        row("Content Type", left.responseContentType || "—", right.responseContentType || "—"),
        row(
          "Stored Body",
          summarizeStoredBody(left.responseBody, left.responseBodyTruncated),
          summarizeStoredBody(right.responseBody, right.responseBodyTruncated),
        ),
      ],
    },
    {
      title: "Response headers",
      kind: "diff-list",
      entries: diffRecords(left.responseHeaders, right.responseHeaders),
      emptyLabel: "No response header differences.",
    },
    buildBodySection(
      "Response body",
      left.responseBody,
      right.responseBody,
      left.responseKind === "json" && right.responseKind === "json",
      left.responseKind,
      right.responseKind,
      left.responseBodyTruncated || right.responseBodyTruncated
        ? "Stored textual bodies may be truncated for large responses."
        : undefined,
    ),
  ];

  return sections.filter((section) => {
    if (section.kind === "rows")
      return section.rows.some((item) => item.left !== "—" || item.right !== "—");
    if (section.kind === "diff-list") return section.entries.length > 0 || !!section.emptyLabel;
    return section.entries.length > 0 || !!section.emptyLabel;
  });
}

function buildBodySection(
  title: string,
  leftBody: string,
  rightBody: string,
  preferJson: boolean,
  leftKind: string,
  rightKind: string,
  description?: string,
): HistoryCompareSection {
  const trimmedLeft = leftBody.trim();
  const trimmedRight = rightBody.trim();

  if (!trimmedLeft && !trimmedRight) {
    return {
      title,
      kind: "rows",
      rows: [row("Body", "—", "—")],
      description,
    };
  }

  if (preferJson) {
    const leftJson = parseJson(trimmedLeft);
    const rightJson = parseJson(trimmedRight);
    if (leftJson && rightJson) {
      return {
        title,
        kind: "diff-list",
        entries: diffJsonValues(leftJson, rightJson),
        emptyLabel: "No JSON body differences.",
        description,
      };
    }
  }

  return {
    title,
    kind: "text",
    entries: diffTextBlocks(trimmedLeft || "(empty body)", trimmedRight || "(empty body)"),
    emptyLabel: `No ${title.toLowerCase()} differences for ${leftKind} → ${rightKind}.`,
    description,
  };
}

function row(label: string, left: string, right: string): HistoryCompareRow {
  return { label, left, right, changed: left !== right };
}

function enabledCount(items: Array<{ enabled?: boolean }>) {
  return items.filter((item) => item.enabled ?? true).length;
}

function diffKeyValueLists(
  left: Array<{ key: string; value: string; enabled?: boolean }>,
  right: Array<{ key: string; value: string; enabled?: boolean }>,
) {
  return diffRecords(toRecord(left), toRecord(right));
}

function toRecord(items: Array<{ key: string; value: string; enabled?: boolean }>) {
  return Object.fromEntries(
    items
      .filter((item) => (item.enabled ?? true) && item.key)
      .map((item) => [item.key, item.value]),
  );
}

function diffRecords(
  left: Record<string, string>,
  right: Record<string, string>,
): HistoryCompareDiffEntry[] {
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort((a, b) =>
    a.localeCompare(b),
  );
  const entries: HistoryCompareDiffEntry[] = [];

  keys.forEach((key) => {
    const leftValue = left[key];
    const rightValue = right[key];
    if (leftValue === rightValue) return;

    entries.push({
      key,
      left: leftValue ?? "—",
      right: rightValue ?? "—",
      state: leftValue === undefined ? "added" : rightValue === undefined ? "removed" : "changed",
    });
  });

  return entries;
}

function diffJsonValues(
  left: unknown,
  right: unknown,
  path = "$",
  depth = 0,
): HistoryCompareDiffEntry[] {
  if (depth > 10) {
    return [
      { key: path, left: summarizeValue(left), right: summarizeValue(right), state: "changed" },
    ];
  }

  if (isPlainObject(left) && isPlainObject(right)) {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort((a, b) =>
      a.localeCompare(b),
    );
    return keys.flatMap((key) => {
      if (!(key in left)) {
        return [
          {
            key: `${path}.${key}`,
            left: "—",
            right: summarizeValue(right[key]),
            state: "added" as const,
          },
        ];
      }
      if (!(key in right)) {
        return [
          {
            key: `${path}.${key}`,
            left: summarizeValue(left[key]),
            right: "—",
            state: "removed" as const,
          },
        ];
      }
      return diffJsonValues(left[key], right[key], `${path}.${key}`, depth + 1);
    });
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    const length = Math.max(left.length, right.length);
    return Array.from({ length }, (_, index) => {
      const nextPath = `${path}[${index}]`;
      if (index >= left.length) {
        return [
          {
            key: nextPath,
            left: "—",
            right: summarizeValue(right[index]),
            state: "added" as const,
          },
        ];
      }
      if (index >= right.length) {
        return [
          {
            key: nextPath,
            left: summarizeValue(left[index]),
            right: "—",
            state: "removed" as const,
          },
        ];
      }
      return diffJsonValues(left[index], right[index], nextPath, depth + 1);
    }).flat();
  }

  if (stableStringify(left) === stableStringify(right)) return [];
  return [
    { key: path, left: summarizeValue(left), right: summarizeValue(right), state: "changed" },
  ];
}

function diffTextBlocks(left: string, right: string): HistoryCompareTextEntry[] {
  const leftLines = left.split(/\r?\n/).slice(0, 120);
  const rightLines = right.split(/\r?\n/).slice(0, 120);
  const dp = Array.from({ length: leftLines.length + 1 }, () =>
    Array(rightLines.length + 1).fill(0),
  );

  for (let i = leftLines.length - 1; i >= 0; i -= 1) {
    for (let j = rightLines.length - 1; j >= 0; j -= 1) {
      dp[i][j] =
        leftLines[i] === rightLines[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const entries: HistoryCompareTextEntry[] = [];
  let i = 0;
  let j = 0;
  while (i < leftLines.length || j < rightLines.length) {
    if (i < leftLines.length && j < rightLines.length && leftLines[i] === rightLines[j]) {
      i += 1;
      j += 1;
      continue;
    }

    if (j < rightLines.length && (i === leftLines.length || dp[i][j + 1] >= dp[i + 1]?.[j])) {
      entries.push({
        leftLineNumber: null,
        rightLineNumber: j + 1,
        left: "",
        right: rightLines[j],
        changed: true,
      });
      j += 1;
      continue;
    }

    if (i < leftLines.length) {
      entries.push({
        leftLineNumber: i + 1,
        rightLineNumber: null,
        left: leftLines[i],
        right: "",
        changed: true,
      });
      i += 1;
    }
  }

  return entries;
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function summarizeStoredBody(body: string, truncated: boolean) {
  if (!body.trim()) return "—";
  return truncated
    ? `Stored (${formatBytes(body.length)}) · truncated`
    : `Stored (${formatBytes(body.length)})`;
}

function summarizeValue(value: unknown) {
  if (typeof value === "string") return value || "(empty)";
  if (value === null) return "null";
  if (value === undefined) return "—";
  if (typeof value === "object") return stableStringify(value);
  return String(value);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(", ")}]`;
  if (isPlainObject(value)) {
    const entries = Object.keys(value)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => `${JSON.stringify(key)}: ${stableStringify(value[key])}`);
    return `{ ${entries.join(", ")} }`;
  }
  return JSON.stringify(value) ?? String(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatStatus(entry: HistoryEntry) {
  if (entry.errorMessage) return `ERR · ${entry.errorMessage}`;
  return entry.status === null ? "—" : String(entry.status);
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}
