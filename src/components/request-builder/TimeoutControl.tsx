import { Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

function formatTimeoutBadge(timeoutMs: number) {
  if (timeoutMs % 1000 === 0) return `${timeoutMs / 1000}s`;
  return `${timeoutMs}ms`;
}

export function TimeoutControl({
  timeoutMs,
  onChange,
}: {
  timeoutMs: number;
  onChange: (timeoutMs: number) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={
            timeoutMs > 0 ? `Times out after ${formatTimeoutBadge(timeoutMs)}` : "No timeout set"
          }
          className={cn(
            "flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-2xs font-medium transition",
            timeoutMs > 0
              ? "border-primary/25 bg-primary/8 text-primary"
              : "border-border/80 bg-background/70 text-muted-foreground hover:border-foreground/15 hover:bg-accent/30",
          )}
        >
          <Timer className="h-3.5 w-3.5" />
          {timeoutMs > 0 ? formatTimeoutBadge(timeoutMs) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-64 space-y-2 p-3">
        <div>
          <div className="text-xs font-semibold tracking-tight">Timeout</div>
          <p className="mt-0.5 text-2xs text-muted-foreground">
            Auto-cancel this request if it hasn't finished within this many milliseconds.
          </p>
        </div>
        <input
          value={timeoutMs || ""}
          onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))}
          placeholder="No timeout"
          inputMode="numeric"
          className="h-9 w-full rounded-lg border border-border/80 bg-background/80 px-3 font-mono text-xs outline-none transition focus:border-foreground/15"
        />
      </PopoverContent>
    </Popover>
  );
}
