/** Above this many characters, formatting or rendering the full body in a
 * single DOM node is what locks up the tab — cap both at this length. */
export const MAX_RESPONSE_RENDER_LENGTH = 1_000_000;

/** `JSON.parse` on a body this large is itself the tab-freezing operation the
 * cap above exists to prevent — every caller that would otherwise parse a
 * response body (assertions, extract rules, ...) should skip parsing rather
 * than block the main thread on it once the body crosses this line. */
export function isTooLargeToParse(body: string): boolean {
  return body.length > MAX_RESPONSE_RENDER_LENGTH;
}

/** Pretty-prints JSON bodies, but only below the render cap — parsing and
 * re-stringifying an already-oversized body just to throw most of it away
 * wastes the exact work this cap exists to avoid. Also falls back to the raw
 * body if pretty-printing itself blows past the cap: indentation can expand
 * a compact array of many short elements into several times its raw size,
 * and that inflated string is what would otherwise get held onto (as the
 * copy-to-clipboard value) even though the render is truncated. */
export function buildPrettyBody(body: string, contentType: string): string {
  if (isTooLargeToParse(body)) return body;
  if (!contentType.includes("json")) return body;
  try {
    const pretty = JSON.stringify(JSON.parse(body), null, 2);
    return isTooLargeToParse(pretty) ? body : pretty;
  } catch {
    return body;
  }
}

export interface RenderableBody {
  text: string;
  truncated: boolean;
  totalLength: number;
}

/** Slices `text` down to the render cap. The full, untruncated string is
 * still whatever the caller already has (e.g. for Download or Copy) — this
 * only bounds what actually goes into the DOM. */
export function truncateForRender(text: string): RenderableBody {
  const totalLength = text.length;
  if (!isTooLargeToParse(text)) {
    return { text, truncated: false, totalLength };
  }
  // Don't cut a UTF-16 surrogate pair in half — back off one code unit if
  // the cut would land right after a high surrogate.
  let cut = MAX_RESPONSE_RENDER_LENGTH;
  const codeUnit = text.charCodeAt(cut - 1);
  if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) cut -= 1;
  return { text: text.slice(0, cut), truncated: true, totalLength };
}
