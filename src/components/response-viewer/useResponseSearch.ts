import { useEffect, useMemo, useState } from "react";

function countMatches(text: string, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const lower = text.toLowerCase();
  let count = 0;
  let idx = lower.indexOf(q);
  while (idx !== -1) {
    count++;
    idx = lower.indexOf(q, idx + q.length);
  }
  return count;
}

/** Cmd/Ctrl+F "find in response" — plain substring search over the rendered
 * body text, since the body is a plain <pre> rather than a Monaco instance
 * that would offer its own find widget. */
export function useResponseSearch(text: string) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const matchCount = useMemo(() => countMatches(text, query), [text, query]);

  // Keep the active match in range as the query changes or matches shrink.
  useEffect(() => {
    setActiveIndex(0);
  }, [query, text]);

  const goNext = () => {
    if (!matchCount) return;
    setActiveIndex((i) => (i + 1) % matchCount);
  };

  const goPrev = () => {
    if (!matchCount) return;
    setActiveIndex((i) => (i - 1 + matchCount) % matchCount);
  };

  const close = () => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  };

  return { open, setOpen, query, setQuery, activeIndex, matchCount, goNext, goPrev, close };
}
