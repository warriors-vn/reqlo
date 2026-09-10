import { motion } from "framer-motion";
import { CheckCircle2, ExternalLink, Heart, Pin, Play, Save, Star, Trash2 } from "lucide-react";
import { MethodBadge } from "@/components/MethodBadge";
import { cn } from "@/lib/utils";
import type { MockFromResponseResult } from "@/services/mock-from-response";
import { formatRelativeHistoryTime } from "@/features/request-history/utils/history";
import type { HistoryEntry } from "@/features/request-history/types";

/** Must stay in sync with the row's own `h-[96px]` + `mb-2` (8px) below — the
 * virtualiser (useVirtualHistoryList) positions every row at an exact
 * multiple of this and derives total scroll height from it. Kept in this file
 * rather than the panel's so the number and the class it mirrors can't be
 * changed independently. */
export const ROW_HEIGHT = 104;

interface HistoryRowProps {
  entry: HistoryEntry;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onOpenInNewTab: () => void;
  onRun: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
  onTogglePinned: () => void;
  mockEligibility: MockFromResponseResult;
  onSaveAsMock: () => void;
  compareMode: boolean;
  compareSelected: boolean;
  onToggleCompare: () => void;
}

export function HistoryRow({
  entry,
  selected,
  onSelect,
  onOpen,
  onOpenInNewTab,
  onRun,
  onDelete,
  onToggleFavorite,
  onTogglePinned,
  mockEligibility,
  onSaveAsMock,
  compareMode,
  compareSelected,
  onToggleCompare,
}: HistoryRowProps) {
  const statusTone = entry.ok ? "text-[var(--status-success)]" : "text-destructive";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.14 }}
      className={cn(
        // Fixed height, and every inner line kept to one line: the virtualiser
        // (useVirtualHistoryList) positions rows at exact ROW_HEIGHT multiples
        // and derives total scroll height from it, so a row that grows to fit a
        // long name would drift every row below it out of its slot and break
        // both the scrollbar and arrow-key scroll-into-view.
        "group mb-2 h-[96px] overflow-hidden rounded-[22px] border px-3 py-3 transition",
        selected
          ? "border-primary/25 bg-accent/55 shadow-[0_16px_42px_rgba(99,102,241,0.10)]"
          : "border-border/70 bg-background/80 hover:border-foreground/10 hover:bg-accent/30",
      )}
      onClick={onSelect}
    >
      <div className="flex items-start gap-3">
        <MethodBadge method={entry.method} className="mt-0.5 w-12 shrink-0 text-right" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpen}
              className="truncate text-left text-sm font-medium tracking-tight hover:underline"
            >
              {entry.requestName || entry.url}
            </button>
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-3xs font-medium text-muted-foreground">
              {formatRelativeHistoryTime(entry.executedAt)}
            </span>
            {entry.environmentName && (
              <span className="max-w-[10rem] shrink-0 truncate rounded-full bg-background px-2 py-0.5 text-3xs text-muted-foreground">
                {entry.environmentName}
              </span>
            )}
          </div>
          <div className="truncate font-mono text-2xs text-muted-foreground">{entry.url}</div>
          <div className="flex items-center gap-3 text-2xs">
            <span className={cn("shrink-0 font-mono font-semibold", statusTone)}>
              {entry.errorMessage ? "ERR" : (entry.status ?? "—")}
            </span>
            <span className="shrink-0 font-mono text-muted-foreground">
              {entry.durationMs.toFixed(0)} ms
            </span>
            <span className="shrink-0 font-mono text-muted-foreground">
              {Math.round((entry.sizeBytes / 1024) * 10) / 10 || 0} KB
            </span>
            {entry.responseExcerpt && (
              <span className="truncate text-muted-foreground/90">{entry.responseExcerpt}</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 opacity-100 md:opacity-0 md:transition md:group-hover:opacity-100">
          {compareMode && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onToggleCompare();
              }}
              className={actionButtonClass(compareSelected)}
              title={compareSelected ? "Selected for compare" : "Select for compare"}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onTogglePinned();
            }}
            className={actionButtonClass(entry.pinned)}
            title="Pin history item"
          >
            <Pin className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleFavorite();
            }}
            className={actionButtonClass(entry.favorite)}
            title="Favorite history item"
          >
            {entry.favorite ? (
              <Heart className="h-3.5 w-3.5 fill-current" />
            ) : (
              <Star className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRun();
            }}
            className={actionButtonClass()}
            title="Re-run request"
          >
            <Play className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenInNewTab();
            }}
            className={actionButtonClass()}
            title="Restore in new tab"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={!mockEligibility.ok}
            onClick={(event) => {
              event.stopPropagation();
              onSaveAsMock();
            }}
            className={cn(actionButtonClass(), "disabled:cursor-not-allowed disabled:opacity-40")}
            title={
              mockEligibility.ok
                ? "Save this response as the request's mock"
                : mockEligibility.reason
            }
          >
            <Save className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            className={cn(actionButtonClass(), "hover:bg-destructive/10 hover:text-destructive")}
            title="Delete history item"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function actionButtonClass(active = false) {
  return cn(
    "grid h-8 w-8 place-items-center rounded-xl transition",
    active
      ? "bg-accent text-foreground"
      : "text-muted-foreground hover:bg-accent hover:text-foreground",
  );
}
