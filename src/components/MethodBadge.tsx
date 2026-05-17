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
  return (
    <span
      className={cn(
        "font-mono text-[10px] font-semibold tracking-wider uppercase",
        COLOR[method],
        className,
      )}
    >
      {method}
    </span>
  );
}
