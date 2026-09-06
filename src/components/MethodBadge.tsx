import { cn } from "@/lib/utils";
import type { HttpMethod, RequestProtocol } from "@/services/db";

const COLOR: Record<HttpMethod, string> = {
  GET: "text-[var(--method-get)]",
  POST: "text-[var(--method-post)]",
  PUT: "text-[var(--method-put)]",
  PATCH: "text-[var(--method-patch)]",
  DELETE: "text-[var(--method-delete)]",
  HEAD: "text-muted-foreground",
  OPTIONS: "text-muted-foreground",
};

export function MethodBadge({
  method,
  protocol = "http",
  className,
}: {
  method: HttpMethod;
  /** A WebSocket's `method` is always GET and says nothing useful, so the
   * badge shows the protocol instead — the sidebar, tab bar and palette all
   * need to tell the two kinds of request apart at a glance. */
  protocol?: RequestProtocol;
  className?: string;
}) {
  if (protocol === "websocket") {
    return (
      <span
        className={cn(
          "font-mono text-3xs font-semibold uppercase tracking-wider text-primary",
          className,
        )}
      >
        WS
      </span>
    );
  }

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
