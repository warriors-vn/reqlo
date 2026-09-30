import { Route } from "lucide-react";
import { cn } from "@/lib/utils";

/** Off is the unusual state, so it is the one that gets a visible badge — a
 * request that stops at a 3xx shouldn't look like every other request. */
export function FollowRedirectsControl({
  follow,
  onChange,
}: {
  follow: boolean;
  onChange: (follow: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={!follow}
      aria-label="Don't follow redirects"
      title={
        follow
          ? "Redirects are followed. Click to stop at the 3xx response instead."
          : "Not following redirects — the 3xx response is shown as-is. Click to follow them."
      }
      onClick={() => onChange(!follow)}
      className={cn(
        "flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-2xs font-medium transition",
        follow
          ? "border-border/80 bg-background/70 text-muted-foreground hover:border-foreground/15 hover:bg-accent/30"
          : "border-primary/25 bg-primary/8 text-primary",
      )}
    >
      <Route className="h-3.5 w-3.5" />
      {follow ? null : "No redirects"}
    </button>
  );
}
