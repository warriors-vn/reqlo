import type { HistoryEntry, HttpMethod, RequestSnapshot } from "@/services/db";

export type { HistoryEntry, HttpMethod, RequestSnapshot };

export type HistoryMethodFilter = HttpMethod | "ALL";
export type HistoryStatusFilter = "ALL" | "SUCCESS" | "ERROR" | "4XX" | "5XX";
export type HistoryGroupLabel = "Pinned" | "Today" | "Yesterday" | "Last 7 days" | "Older";

export interface HistoryFilterState {
  query: string;
  method: HistoryMethodFilter;
  status: HistoryStatusFilter;
}

export interface GroupedHistoryEntries {
  label: HistoryGroupLabel;
  items: HistoryEntry[];
}
