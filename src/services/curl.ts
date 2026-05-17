import { uid, type ApiRequest, type HttpMethod, type KV } from "@/services/db";

/**
 * Parse a cURL command into a partial ApiRequest.
 * Supports: -X/--request, -H/--header, -d/--data/--data-raw/--data-binary, -u/--user, URL detection.
 * Robust to multi-line backslash continuations and single/double quotes.
 */
export function parseCurl(input: string, workspaceId: string, collectionId: string | null): ApiRequest {
  const cleaned = input.replace(/\\\r?\n/g, " ").trim();
  const tokens = tokenize(cleaned);

  let method: HttpMethod = "GET";
  let url = "";
  const headers: KV[] = [];
  let body = "";
  let bodyType: "none" | "json" | "text" = "none";

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "curl") continue;
    if (t === "-X" || t === "--request") { method = (tokens[++i] || "GET").toUpperCase() as HttpMethod; continue; }
    if (t === "-H" || t === "--header") {
      const h = tokens[++i] || "";
      const idx = h.indexOf(":");
      if (idx > 0) headers.push({ id: uid(), key: h.slice(0, idx).trim(), value: h.slice(idx + 1).trim(), enabled: true });
      continue;
    }
    if (t === "-d" || t === "--data" || t === "--data-raw" || t === "--data-binary") {
      body = tokens[++i] || "";
      bodyType = looksLikeJson(body) ? "json" : "text";
      if (method === "GET") method = "POST";
      continue;
    }
    if (t === "-u" || t === "--user") {
      const cred = tokens[++i] || "";
      headers.push({ id: uid(), key: "Authorization", value: `Basic ${btoa(cred)}`, enabled: true });
      continue;
    }
    if (t.startsWith("-")) { // unknown flag, skip value if next is non-flag
      if (tokens[i + 1] && !tokens[i + 1].startsWith("-")) i++;
      continue;
    }
    if (!url && /^https?:\/\//i.test(t)) url = t;
  }

  const now = Date.now();
  return {
    id: uid(), workspaceId, collectionId,
    name: url ? new URL(url).pathname || url : "Imported cURL",
    method, url, headers, queryParams: [], body, bodyType,
    createdAt: now, updatedAt: now,
  };
}

function looksLikeJson(s: string) {
  const t = s.trim();
  return (t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"));
}

function tokenize(s: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === quote) { quote = null; continue; }
      cur += c;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (/\s/.test(c)) { if (cur) { out.push(cur); cur = ""; } continue; }
    cur += c;
  }
  if (cur) out.push(cur);
  return out;
}
