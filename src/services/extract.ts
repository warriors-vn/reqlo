// A minimal dot/bracket path resolver for pulling one field out of a parsed
// JSON response — e.g. "data.token" or "items[0].id". Deliberately not a
// JS expression evaluator (no eval, no filters, no functions): request
// chaining should stay a config field, not a scripting surface.

export type PathSegment = string | number;

export function parseExtractPath(path: string): PathSegment[] | null {
  const trimmed = path.trim();
  if (!trimmed) return null;

  const segments: PathSegment[] = [];
  for (const part of trimmed.split(".")) {
    if (!part) return null;
    const match = part.match(/^([a-zA-Z0-9_$]*)((?:\[\d+\])*)$/);
    if (!match) return null;
    const [, key, brackets] = match;
    if (key) segments.push(key);
    const indices = brackets.match(/\[\d+\]/g) ?? [];
    for (const index of indices) segments.push(Number(index.slice(1, -1)));
  }
  return segments.length ? segments : null;
}

export type ExtractResult = { ok: true; value: unknown } | { ok: false };

export function resolveExtractPath(data: unknown, path: string): ExtractResult {
  const segments = parseExtractPath(path);
  if (!segments) return { ok: false };

  let current: unknown = data;
  for (const segment of segments) {
    if (current === null || current === undefined) return { ok: false };
    if (typeof segment === "number") {
      if (!Array.isArray(current)) return { ok: false };
      current = current[segment];
    } else {
      if (typeof current !== "object") return { ok: false };
      current = (current as Record<string, unknown>)[segment];
    }
  }
  return current === undefined ? { ok: false } : { ok: true, value: current };
}

export function stringifyExtractedValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}
