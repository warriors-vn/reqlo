import { cn } from "@/lib/utils";

/** One labelled cell in the response's meta row — status, time, size, type. */
export function MetaPill({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-2.5 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-mono font-medium text-foreground/90", tone)}>{value}</span>
    </div>
  );
}
