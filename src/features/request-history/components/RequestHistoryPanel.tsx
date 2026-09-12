import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AnimatePresence } from "framer-motion";
import { Eraser, GitCompareArrows, Search, Download, Trash2, X } from "lucide-react";
import { LazyConfirmDeleteDialog as ConfirmDeleteDialog } from "@/components/LazyConfirmDeleteDialog";
import { cn } from "@/lib/utils";
import { useStore } from "@/stores/useStore";
import { createDefaultMock } from "@/services/db";
import { buildMockFromResponse, type MockFromResponseResult } from "@/services/mock-from-response";
import { useDebouncedValue } from "@/features/request-history/hooks/useDebouncedValue";
import { useVirtualHistoryList } from "@/features/request-history/hooks/useVirtualHistoryList";
import { useRequestHistoryStore } from "@/features/request-history/stores/useRequestHistoryStore";
import { HistoryComparePanel } from "@/features/request-history/components/HistoryComparePanel";
import { HistoryRow, ROW_HEIGHT } from "@/features/request-history/components/HistoryRow";
import {
  filterHistoryEntries,
  groupHistoryEntries,
} from "@/features/request-history/utils/history";
import type {
  HistoryEntry,
  HistoryMethodFilter,
  HistoryStatusFilter,
} from "@/features/request-history/types";

const METHOD_FILTERS: HistoryMethodFilter[] = [
  "ALL",
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];
const STATUS_FILTERS: HistoryStatusFilter[] = ["ALL", "SUCCESS", "ERROR", "4XX", "5XX"];

export function RequestHistoryPanel() {
  const open = useStore((state) => state.overlays.history);
  const history = useStore((state) => state.history);
  const requests = useStore((state) => state.requests);
  const updateRequest = useStore((state) => state.updateRequest);
  const restoreHistoryEntry = useStore((state) => state.restoreHistoryEntry);
  const toggleHistoryFavorite = useStore((state) => state.toggleHistoryFavorite);
  const toggleHistoryPinned = useStore((state) => state.toggleHistoryPinned);
  const deleteHistoryEntry = useStore((state) => state.deleteHistoryEntry);
  const clearHistory = useStore((state) => state.clearHistory);
  const exportHistoryAsHar = useStore((state) => state.exportHistoryAsHar);

  const filters = useRequestHistoryStore((state) => state.filters);
  const query = filters.query;
  const method = filters.method;
  const status = filters.status;
  const setQuery = useRequestHistoryStore((state) => state.setQuery);
  const setMethod = useRequestHistoryStore((state) => state.setMethod);
  const setStatus = useRequestHistoryStore((state) => state.setStatus);
  const resetFilters = useRequestHistoryStore((state) => state.resetFilters);
  const selectedId = useRequestHistoryStore((state) => state.selectedId);
  const setSelectedId = useRequestHistoryStore((state) => state.setSelectedId);
  const selectNext = useRequestHistoryStore((state) => state.selectNext);
  const selectPrevious = useRequestHistoryStore((state) => state.selectPrevious);

  const debouncedQuery = useDebouncedValue(query, 120);
  const filteredHistory = useMemo(
    () => filterHistoryEntries(history, { query: debouncedQuery, method, status }),
    [debouncedQuery, history, method, status],
  );
  const grouped = useMemo(() => groupHistoryEntries(filteredHistory), [filteredHistory]);
  const flatRows = useMemo(
    () =>
      grouped.flatMap((group) => [
        { id: `header-${group.label}`, type: "header" as const, label: group.label },
        ...group.items.map((item) => ({ id: item.id, type: "item" as const, item })),
      ]),
    [grouped],
  );
  const itemIds = filteredHistory.map((entry) => entry.id);
  const selectedRowIndex = useMemo(
    () => flatRows.findIndex((row) => row.type === "item" && row.item.id === selectedId),
    [flatRows, selectedId],
  );

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(520);
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingMockOverwriteId, setPendingMockOverwriteId] = useState<string | null>(null);

  const compareEntries = useMemo(
    () =>
      compareIds
        .map((id) => history.find((entry) => entry.id === id))
        .filter(Boolean) as HistoryEntry[],
    [compareIds, history],
  );

  useEffect(() => {
    if (!open) return;
    if (selectedId && itemIds.includes(selectedId)) return;
    setSelectedId(itemIds[0] ?? null);
  }, [itemIds, open, selectedId, setSelectedId]);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    const update = () => setViewportHeight(node.clientHeight || 520);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [open]);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!open || !node || selectedRowIndex < 0) return;

    const rowTop = selectedRowIndex * ROW_HEIGHT;
    const rowBottom = rowTop + ROW_HEIGHT;
    const viewportTop = node.scrollTop;
    const viewportBottom = viewportTop + node.clientHeight;

    if (rowTop < viewportTop) {
      node.scrollTo({ top: rowTop });
      return;
    }

    if (rowBottom > viewportBottom) {
      node.scrollTo({ top: Math.max(0, rowBottom - node.clientHeight) });
    }
  }, [open, selectedRowIndex]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inEditable =
        !!target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable);
      if (event.key === "ArrowDown" && !inEditable) {
        event.preventDefault();
        selectNext(itemIds);
      }
      if (event.key === "ArrowUp" && !inEditable) {
        event.preventDefault();
        selectPrevious(itemIds);
      }
      if (event.key === "Enter" && selectedId && !inEditable) {
        event.preventDefault();
        void restoreHistoryEntry(selectedId, { rerun: event.metaKey || event.ctrlKey });
      }
      if ((event.key === "Backspace" || event.key === "Delete") && selectedId && !inEditable) {
        event.preventDefault();
        setPendingDeleteId(selectedId);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [itemIds, open, restoreHistoryEntry, selectNext, selectPrevious, selectedId]);

  const virtualRows = useVirtualHistoryList({
    items: flatRows,
    itemHeight: ROW_HEIGHT,
    scrollTop,
    viewportHeight,
  });

  const toggleCompareSelection = (id: string) => {
    setCompareIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length === 2) return [current[1], id];
      return [...current, id];
    });
  };

  const exitCompareMode = () => {
    setCompareMode(false);
    setCompareIds([]);
  };

  const mockEligibilityFor = (entry: HistoryEntry): MockFromResponseResult => {
    const target = entry.requestId ? requests.find((r) => r.id === entry.requestId) : undefined;
    if (!target) {
      return { ok: false, reason: "The original request no longer exists." };
    }
    return buildMockFromResponse({
      status: entry.status,
      contentType: entry.responseContentType,
      body: entry.responseBody,
      responseKind: entry.responseKind,
      truncated: entry.responseBodyTruncated,
      hasError: Boolean(entry.errorMessage),
    });
  };

  const applyMockSave = (entry: HistoryEntry) => {
    const target = requests.find((r) => r.id === entry.requestId);
    const eligibility = mockEligibilityFor(entry);
    if (!target || !eligibility.ok) return;
    void updateRequest(target.id, { mock: { ...target.mock, ...eligibility.mock } });
    toast.success(`Saved as mock for "${target.name || "this request"}"`, {
      description: target.mock.enabled
        ? "Mock is already on — Send will return this."
        : "Open the Mock tab to turn mocking on.",
    });
  };

  const saveAsMock = (entry: HistoryEntry) => {
    const target = requests.find((r) => r.id === entry.requestId);
    if (!target || !mockEligibilityFor(entry).ok) return;
    // Same "is there really something to lose" check ResponseViewer's own
    // Save-as-mock uses — every request starts with a non-empty placeholder
    // mock body, so a plain non-empty check would confirm on every first save.
    const hasCustomMockBody =
      target.mock.body.trim() && target.mock.body !== createDefaultMock().body;
    if (hasCustomMockBody) {
      setPendingMockOverwriteId(entry.id);
      return;
    }
    applyMockSave(entry);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-[24px] border border-border/80 bg-background/70 p-3 shadow-[0_18px_60px_rgba(15,23,42,0.05)] backdrop-blur-xl">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus={open}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by URL, method, status, environment, response excerpt…"
              aria-label="Search history"
              className="h-11 w-full rounded-2xl border border-border/80 bg-background/80 pl-10 pr-4 text-sm outline-none transition focus:border-foreground/15"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={method}
              aria-label="Filter by method"
              onChange={(event) => setMethod(event.target.value as HistoryMethodFilter)}
              className="h-11 rounded-2xl border border-border/80 bg-background/80 px-3 text-xs outline-none"
            >
              {METHOD_FILTERS.map((value) => (
                <option key={value} value={value}>
                  {value === "ALL" ? "All methods" : value}
                </option>
              ))}
            </select>
            <select
              value={status}
              aria-label="Filter by status"
              onChange={(event) => setStatus(event.target.value as HistoryStatusFilter)}
              className="h-11 rounded-2xl border border-border/80 bg-background/80 px-3 text-xs outline-none"
            >
              {STATUS_FILTERS.map((value) => (
                <option key={value} value={value}>
                  {value === "ALL" ? "All statuses" : value}
                </option>
              ))}
            </select>
            <button
              onClick={resetFilters}
              className="inline-flex h-11 items-center gap-2 rounded-2xl border border-border/80 px-3 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <Eraser className="h-3.5 w-3.5" /> Reset
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-2xs text-muted-foreground">
          <div>
            {filteredHistory.length} matches · ⌘⇧H opens history · ⌘Enter re-runs selected item
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                if (compareMode) {
                  exitCompareMode();
                  return;
                }
                setCompareMode(true);
              }}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 font-medium transition",
                compareMode
                  ? "border-primary/25 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {compareMode ? (
                <X className="h-3.5 w-3.5" />
              ) : (
                <GitCompareArrows className="h-3.5 w-3.5" />
              )}
              {compareMode
                ? `Exit compare${compareIds.length ? ` (${compareIds.length}/2)` : ""}`
                : "Compare executions"}
            </button>
            <button
              onClick={() => void exportHistoryAsHar()}
              disabled={history.length === 0}
              title="Save every recorded execution as a HAR file — the format browser devtools and HAR viewers read"
              className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-1.5 font-medium transition hover:bg-accent disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" /> Export as HAR
            </button>
            <button
              onClick={() => void clearHistory()}
              disabled={history.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-1.5 font-medium transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear history
            </button>
          </div>
        </div>
      </div>

      {compareMode && compareEntries.length === 2 && (
        <HistoryComparePanel left={compareEntries[0]} right={compareEntries[1]} />
      )}

      {compareMode && compareEntries.length < 2 && (
        <div className="rounded-[24px] border border-dashed border-border bg-background/60 px-4 py-4 text-sm text-muted-foreground">
          Select {2 - compareEntries.length} more history{" "}
          {compareEntries.length === 1 ? "entry" : "entries"} to compare snapshots, headers, JSON
          fields, and textual response bodies.
        </div>
      )}

      {filteredHistory.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-border bg-muted/20 px-4 py-14 text-center text-sm text-muted-foreground">
          No history matches yet. Send a request to build a local timeline.
        </div>
      ) : (
        <div
          ref={scrollerRef}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          className="max-h-[62vh] overflow-auto rounded-[26px] border border-border/80 bg-[color-mix(in_oklab,var(--surface-elevated)_82%,transparent)] shadow-[0_20px_80px_rgba(15,23,42,0.06)] backdrop-blur-xl"
        >
          <div style={{ height: virtualRows.totalHeight, position: "relative" }}>
            <div
              style={{ transform: `translateY(${virtualRows.offsetY}px)` }}
              className="px-2 py-2"
            >
              <AnimatePresence initial={false}>
                {virtualRows.visibleItems.map((row) =>
                  row.type === "header" ? (
                    <div
                      key={row.id}
                      className="sticky top-0 z-10 flex h-[56px] items-center px-3 text-2xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/80"
                    >
                      {row.label}
                    </div>
                  ) : (
                    <HistoryRow
                      key={row.id}
                      entry={row.item}
                      selected={selectedId === row.item.id}
                      onSelect={() => setSelectedId(row.item.id)}
                      onOpen={() => void restoreHistoryEntry(row.item.id)}
                      onOpenInNewTab={() =>
                        void restoreHistoryEntry(row.item.id, { openInNewTab: true })
                      }
                      onRun={() => void restoreHistoryEntry(row.item.id, { rerun: true })}
                      onDelete={() => setPendingDeleteId(row.item.id)}
                      onToggleFavorite={() =>
                        void toggleHistoryFavorite(row.item.id).catch(() => {})
                      }
                      onTogglePinned={() => void toggleHistoryPinned(row.item.id).catch(() => {})}
                      mockEligibility={mockEligibilityFor(row.item)}
                      onSaveAsMock={() => saveAsMock(row.item)}
                      compareMode={compareMode}
                      compareSelected={compareIds.includes(row.item.id)}
                      onToggleCompare={() => toggleCompareSelection(row.item.id)}
                    />
                  ),
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}

      <ConfirmDeleteDialog
        open={pendingDeleteId !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setPendingDeleteId(null);
        }}
        title="Delete history entry"
        description={
          pendingDeleteId
            ? `"${history.find((entry) => entry.id === pendingDeleteId)?.requestName ?? "This entry"}" will be permanently removed from history. This can't be undone.`
            : ""
        }
        onConfirm={() => {
          if (pendingDeleteId) void deleteHistoryEntry(pendingDeleteId).catch(() => {});
          setPendingDeleteId(null);
        }}
      />

      <ConfirmDeleteDialog
        open={pendingMockOverwriteId !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setPendingMockOverwriteId(null);
        }}
        title="Replace mock body?"
        description={(() => {
          const entry = history.find((item) => item.id === pendingMockOverwriteId);
          const target = entry ? requests.find((r) => r.id === entry.requestId) : undefined;
          return `"${target?.name || "This request"}"'s current mock body will be replaced with this response. This can't be undone.`;
        })()}
        confirmLabel="Replace"
        onConfirm={() => {
          const entry = history.find((item) => item.id === pendingMockOverwriteId);
          if (entry) applyMockSave(entry);
          setPendingMockOverwriteId(null);
        }}
      />
    </div>
  );
}
