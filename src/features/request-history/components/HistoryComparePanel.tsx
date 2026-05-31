import { GitCompareArrows } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildHistoryCompareSections } from "@/features/request-history/utils/compare";
import type { HistoryEntry } from "@/features/request-history/types";

interface Props {
  left: HistoryEntry;
  right: HistoryEntry;
}

export function HistoryComparePanel({ left, right }: Props) {
  const sections = buildHistoryCompareSections(left, right);

  return (
    <div className="space-y-4">
      <div className="rounded-[24px] border border-border/80 bg-background/70 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.05)] backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl border border-border/70 bg-background/70 text-primary shadow-sm">
            <GitCompareArrows className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight">Execution compare</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              Compare two history snapshots to see how request metadata, headers, JSON fields, and
              textual response bodies changed.
            </div>
          </div>
        </div>
      </div>

      {sections.map((section) => (
        <div
          key={section.title}
          className="overflow-hidden rounded-[24px] border border-border/80 bg-[color-mix(in_oklab,var(--surface-elevated)_84%,transparent)] shadow-[0_18px_60px_rgba(15,23,42,0.05)] backdrop-blur-xl"
        >
          <div className="border-b border-border/70 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {section.title}
          </div>
          {section.description ? (
            <div className="border-b border-border/70 px-4 py-2 text-[11px] text-muted-foreground">
              {section.description}
            </div>
          ) : null}

          {section.kind === "rows" ? (
            <div className="divide-y divide-border/70">
              {section.rows.map((item) => (
                <div
                  key={item.label}
                  className="grid gap-0 md:grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)]"
                >
                  <div className="px-4 py-3 text-[11px] font-medium text-muted-foreground">
                    {item.label}
                  </div>
                  <CompareCell value={item.left} changed={item.changed} side="left" />
                  <CompareCell value={item.right} changed={item.changed} side="right" />
                </div>
              ))}
            </div>
          ) : section.kind === "diff-list" ? (
            section.entries.length ? (
              <div className="divide-y divide-border/70">
                {section.entries.map((entry) => (
                  <div
                    key={entry.key}
                    className="grid gap-0 md:grid-cols-[200px_minmax(0,1fr)_minmax(0,1fr)]"
                  >
                    <div className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                      {entry.key}
                    </div>
                    <CompareCell value={entry.left} changed={true} side="left" />
                    <CompareCell value={entry.right} changed={true} side="right" />
                  </div>
                ))}
              </div>
            ) : (
              <EmptySection label={section.emptyLabel} />
            )
          ) : section.entries.length ? (
            <div className="divide-y divide-border/70 font-mono text-[11px]">
              {section.entries.map((entry, index) => (
                <div
                  key={`${entry.leftLineNumber}-${entry.rightLineNumber}-${index}`}
                  className="grid gap-0 md:grid-cols-[72px_72px_minmax(0,1fr)_minmax(0,1fr)]"
                >
                  <div className="px-4 py-3 text-muted-foreground">
                    {entry.leftLineNumber ?? "—"}
                  </div>
                  <div className="px-4 py-3 text-muted-foreground">
                    {entry.rightLineNumber ?? "—"}
                  </div>
                  <CompareCell value={entry.left || "—"} changed={entry.changed} side="left" />
                  <CompareCell value={entry.right || "—"} changed={entry.changed} side="right" />
                </div>
              ))}
            </div>
          ) : (
            <EmptySection label={section.emptyLabel} />
          )}
        </div>
      ))}
    </div>
  );
}

function EmptySection({ label }: { label: string }) {
  return <div className="px-4 py-6 text-sm text-muted-foreground">{label}</div>;
}

function CompareCell({
  value,
  changed,
  side,
}: {
  value: string;
  changed: boolean;
  side: "left" | "right";
}) {
  return (
    <div
      className={cn(
        "min-w-0 px-4 py-3 font-mono text-[11px] whitespace-pre-wrap break-words",
        changed
          ? side === "left"
            ? "bg-amber-500/6 text-foreground"
            : "bg-primary/6 text-foreground"
          : "text-foreground/80",
      )}
    >
      {value || "—"}
    </div>
  );
}
