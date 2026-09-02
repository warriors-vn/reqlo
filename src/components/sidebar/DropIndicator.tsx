import { cn } from "@/lib/utils";

export function DropIndicator({
  label,
  tone = "primary",
  compact = false,
}: {
  label: string;
  tone?: "primary" | "muted";
  compact?: boolean;
}) {
  return (
    <div className={cn("px-2", compact ? "py-1" : "py-1.5")}>
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "h-px flex-1",
            tone === "primary" ? "bg-primary/45" : "bg-muted-foreground/35",
          )}
        />
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-3xs font-medium",
            tone === "primary"
              ? "border-primary/25 bg-primary/8 text-primary"
              : "border-border bg-background/70 text-muted-foreground",
          )}
        >
          {label}
        </span>
        <div
          className={cn(
            "h-px flex-1",
            tone === "primary" ? "bg-primary/45" : "bg-muted-foreground/35",
          )}
        />
      </div>
    </div>
  );
}
