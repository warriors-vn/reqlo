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
              Compare two history snapshots to see how the request, auth, timing, and response
              changed.
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
        </div>
      ))}
    </div>
  );
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
