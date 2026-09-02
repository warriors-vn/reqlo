/** Shared across every importer (curl, Postman, Insomnia, HAR) that has to
 * guess whether a raw text body is JSON when the format it's importing from
 * doesn't say so explicitly (or claims a generic "text/plain"-ish type). */
export function looksLikeJson(s: string): boolean {
  const t = s.trim();
  return (t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"));
}
