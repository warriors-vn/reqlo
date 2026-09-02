import { cn } from "@/lib/utils";
import type { HttpMethod } from "@/services/db";

const COLOR: Record<HttpMethod, string> = {
  GET: "text-[var(--method-get)]",
  POST: "text-[var(--method-post)]",
  PUT: "text-[var(--method-put)]",
  PATCH: "text-[var(--method-patch)]",
  DELETE: "text-[var(--method-delete)]",
  HEAD: "text-muted-foreground",
  OPTIONS: "text-muted-foreground",
};

export function MethodBadge({ method, className }: { method: HttpMethod; className?: string }) {
  // `method` is typed as HttpMethod, but legacy/imported/hand-edited request
  // records can carry a value outside that union at runtime — fall back to a
  // muted placeholder instead of rendering an undefined color/blank label.
  const color = COLOR[method] ?? "text-muted-foreground";
  const label = method in COLOR ? method : "—";

  return (
    <span
      className={cn("font-mono text-3xs font-semibold tracking-wider uppercase", color, className)}
    >
      {label}
    </span>
  );
}
