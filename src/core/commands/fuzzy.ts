import type { CommandDescriptor } from "./types";

/** Lightweight subsequence-fuzzy scorer. Higher is better; 0 = no match. */
export function fuzzyScore(needle: string, haystack: string): number {
  if (!needle) return 1;
  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();
  if (h.includes(n)) return 1000 - h.indexOf(n);

  let score = 0;
  let hi = 0;
  let streak = 0;
  for (let i = 0; i < n.length; i++) {
    const c = n[i];
    const found = h.indexOf(c, hi);
    if (found === -1) return 0;
    streak = found === hi ? streak + 1 : 1;
    score += 10 + streak * 2;
    hi = found + 1;
  }
  return score;
}

export function scoreCommand(cmd: CommandDescriptor, query: string): number {
  if (!query) return 1;
  const fields = [cmd.title, cmd.description ?? "", ...(cmd.keywords ?? []), cmd.id];
  let best = 0;
  for (const f of fields) {
    const s = fuzzyScore(query, f);
    if (s > best) best = s;
  }
  return best;
}
