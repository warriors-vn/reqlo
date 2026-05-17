import { isToday, isYesterday, subDays } from "date-fns";
import type {
  GroupedHistoryEntries,
  HistoryEntry,
  HistoryFilterState,
} from "@/features/request-history/types";

export function groupHistoryEntries(entries: HistoryEntry[]): GroupedHistoryEntries[] {
  const pinned = entries.filter((entry) => entry.pinned);
  const rest = entries.filter((entry) => !entry.pinned);
  const groups: GroupedHistoryEntries[] = [];
  const now = new Date();
  const lastWeek = subDays(now, 7);

  if (pinned.length) groups.push({ label: "Pinned", items: pinned });

  const today = rest.filter((entry) => isToday(entry.executedAt));
  const yesterday = rest.filter((entry) => isYesterday(entry.executedAt));
  const lastSevenDays = rest.filter(
    (entry) =>
      !isToday(entry.executedAt) &&
      !isYesterday(entry.executedAt) &&
      new Date(entry.executedAt) >= lastWeek,
  );
  const older = rest.filter((entry) => new Date(entry.executedAt) < lastWeek);

  if (today.length) groups.push({ label: "Today", items: today });
  if (yesterday.length) groups.push({ label: "Yesterday", items: yesterday });
  if (lastSevenDays.length) groups.push({ label: "Last 7 days", items: lastSevenDays });
  if (older.length) groups.push({ label: "Older", items: older });

  return groups;
}

export function fuzzyScore(query: string, text: string): number {
  if (!query) return 1;
  const normalizedQuery = query.toLowerCase().trim();
  const normalizedText = text.toLowerCase();
  if (!normalizedQuery) return 1;
  if (normalizedText.includes(normalizedQuery))
    return 1000 - normalizedText.indexOf(normalizedQuery);

  let qi = 0;
  let score = 0;
  let consecutive = 0;
  for (let i = 0; i < normalizedText.length && qi < normalizedQuery.length; i += 1) {
    if (normalizedText[i] === normalizedQuery[qi]) {
      qi += 1;
      consecutive += 1;
      score += 8 + consecutive * 4;
    } else {
      consecutive = 0;
      score -= 0.2;
    }
  }
  return qi === normalizedQuery.length ? score : -Infinity;
}

export function filterHistoryEntries(
  entries: HistoryEntry[],
  filters: HistoryFilterState,
): HistoryEntry[] {
  const base = entries.filter((entry) => {
    if (filters.method !== "ALL" && entry.method !== filters.method) return false;
    if (
      filters.status === "SUCCESS" &&
      !(entry.status && entry.status >= 200 && entry.status < 400)
    )
      return false;
    if (filters.status === "ERROR" && entry.ok) return false;
    if (filters.status === "4XX" && !(entry.status && entry.status >= 400 && entry.status < 500))
      return false;
    if (filters.status === "5XX" && !(entry.status && entry.status >= 500)) return false;
    return true;
  });

  if (!filters.query.trim()) return base;

  return base
    .map((entry) => ({ entry, score: fuzzyScore(filters.query, entry.searchText) }))
    .filter((item) => Number.isFinite(item.score) && item.score > -Infinity)
    .sort(
      (left, right) => right.score - left.score || right.entry.executedAt - left.entry.executedAt,
    )
    .map((item) => item.entry);
}

export function formatRelativeHistoryTime(timestamp: number): string {
  const deltaMs = Date.now() - timestamp;
  const deltaMinutes = Math.round(deltaMs / 60000);
  if (deltaMinutes < 1) return "Just now";
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
  const deltaHours = Math.round(deltaMinutes / 60);
  if (deltaHours < 24) return `${deltaHours}h ago`;
  const deltaDays = Math.round(deltaHours / 24);
  return `${deltaDays}d ago`;
}
