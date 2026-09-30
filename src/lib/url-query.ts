import { createEmptyKV, type KV } from "@/services/db";

const TEMPLATE = /(\{\{[^}]*\}\})/;

// {{var}} tokens must survive untouched — encoding them would send the
// literal "%7B%7Bvar%7D%7D" instead of the variable's value.
function encodePart(text: string): string {
  return text
    .split(TEMPLATE)
    .map((piece) => (TEMPLATE.test(piece) ? piece : encodeURIComponent(piece)))
    .join("");
}

function decodePart(text: string): string {
  if (TEMPLATE.test(text)) return text;
  try {
    return decodeURIComponent(text.replace(/\+/g, " "));
  } catch {
    return text;
  }
}

/** What the URL bar shows: the stored base URL plus the enabled query rows. */
export function composeUrl(url: string, params: KV[]): string {
  // The table always carries a trailing blank row — it isn't a param yet.
  const pairs = params
    .filter((p) => p.enabled && (p.key !== "" || p.value !== ""))
    .map((p) => `${encodePart(p.key)}=${encodePart(p.value)}`);
  if (!pairs.length) return url;
  return `${url}${url.includes("?") ? "&" : "?"}${pairs.join("&")}`;
}

/**
 * Splits text typed into the URL bar back into a base URL and query rows.
 * The query string becomes the enabled rows (reusing existing ids by position
 * so the table doesn't remount); disabled rows are kept because they aren't
 * part of the URL at all.
 */
export function splitUrl(text: string, params: KV[]): { url: string; queryParams: KV[] } {
  const at = text.indexOf("?");
  if (at === -1) {
    const disabled = params.filter((p) => !p.enabled);
    return { url: text, queryParams: disabled.length === params.length ? params : disabled };
  }
  const url = text.slice(0, at);
  const query = text.slice(at + 1);
  const existing = params.filter((p) => p.enabled);
  const parsed = query === "" ? [] : query.split("&");
  const rows = parsed.map((pair, i) => {
    const eq = pair.indexOf("=");
    const key = decodePart(eq === -1 ? pair : pair.slice(0, eq));
    const value = eq === -1 ? "" : decodePart(pair.slice(eq + 1));
    const prev = existing[i];
    return prev ? { ...prev, key, value } : createEmptyKV(key, value);
  });
  return { url, queryParams: [...rows, ...params.filter((p) => !p.enabled)] };
}
