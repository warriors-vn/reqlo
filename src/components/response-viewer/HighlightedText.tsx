import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/** Renders `text` with every case-insensitive occurrence of `query` wrapped
 * in <mark>, the one at `activeIndex` styled distinctly and scrolled into
 * view. Falls back to plain text when there's no query — the common case,
 * kept cheap since response bodies can be large. */
export function HighlightedText({
  text,
  query,
  activeIndex,
}: {
  text: string;
  query: string;
  activeIndex: number;
}) {
  const activeRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIndex, query]);

  const q = query.trim();
  if (!q) return <>{text}</>;

  const lower = text.toLowerCase();
  const qLower = q.toLowerCase();
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let matchIndex = 0;
  let idx = lower.indexOf(qLower);

  while (idx !== -1) {
    if (idx > cursor) nodes.push(text.slice(cursor, idx));
    const isActive = matchIndex === activeIndex;
    nodes.push(
      <mark
        key={idx}
        ref={isActive ? activeRef : undefined}
        className={cn(
          "rounded-sm",
          isActive
            ? "bg-primary/60 text-primary-foreground"
            : "bg-[var(--status-warn)]/40 text-foreground",
        )}
      >
        {text.slice(idx, idx + q.length)}
      </mark>,
    );
    cursor = idx + q.length;
    matchIndex++;
    idx = lower.indexOf(qLower, cursor);
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));

  return <>{nodes}</>;
}
