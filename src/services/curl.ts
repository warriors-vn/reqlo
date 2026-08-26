import {
  createDefaultAuth,
  createDefaultBodyDrafts,
  normalizeApiRequest,
  uid,
  type ApiRequest,
  type FormDataRow,
  type HttpMethod,
  type KV,
  type RequestBodyType,
} from "@/services/db";

/**
 * Parse a cURL command into a partial ApiRequest.
 * Supports: -X/--request, -H/--header, -d/--data/--data-raw/--data-binary,
 * --data-urlencode, -F/--form, -u/--user, -b/--cookie, -A/--user-agent,
 * -e/--referer, -G/--get, --url, and bare-positional URL detection.
 * Robust to multi-line backslash continuations and single/double quotes.
 */
export function parseCurl(
  input: string,
  workspaceId: string,
  collectionId: string | null,
): ApiRequest {
  const cleaned = input.replace(/\\\r?\n/g, " ").trim();
  const tokens = tokenize(cleaned);

  let method: HttpMethod = "GET";
  let explicitMethod = false;
  let url = "";
  const headers: KV[] = [];
  const rawBodyParts: string[] = [];
  const formRows: FormDataRow[] = [];
  let auth = createDefaultAuth();
  let sawForm = false;
  let sawDataUrlEncode = false;
  let getFlag = false;

  const pushHeader = (key: string, value: string) => {
    const existing =
      key.toLowerCase() === "cookie" ? headers.find((h) => h.key.toLowerCase() === "cookie") : null;
    if (existing) {
      existing.value = `${existing.value}; ${value}`;
      return;
    }
    headers.push({ id: uid(), key, value, enabled: true });
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "curl") continue;
    if (t === "-X" || t === "--request") {
      method = (tokens[++i] || "GET").toUpperCase() as HttpMethod;
      explicitMethod = true;
      continue;
    }
    if (t === "-H" || t === "--header") {
      const h = tokens[++i] || "";
      const idx = h.indexOf(":");
      if (idx > 0) pushHeader(h.slice(0, idx).trim(), h.slice(idx + 1).trim());
      continue;
    }
    if (t === "-d" || t === "--data" || t === "--data-raw" || t === "--data-binary") {
      rawBodyParts.push(tokens[++i] || "");
      continue;
    }
    if (t === "--data-urlencode") {
      rawBodyParts.push(tokens[++i] || "");
      sawDataUrlEncode = true;
      continue;
    }
    if (t === "-F" || t === "--form") {
      const field = tokens[++i] || "";
      const idx = field.indexOf("=");
      const key = idx > 0 ? field.slice(0, idx) : field;
      const value = idx > 0 ? field.slice(idx + 1) : "";
      sawForm = true;
      if (value.startsWith("@")) {
        formRows.push({ id: uid(), key, enabled: true, kind: "file", value: "", files: [] });
      } else {
        formRows.push({ id: uid(), key, enabled: true, kind: "text", value, files: [] });
      }
      continue;
    }
    if (t === "-u" || t === "--user") {
      const cred = tokens[++i] || "";
      const [username = "", password = ""] = cred.split(":");
      auth = { type: "basic", username, password };
      continue;
    }
    if (t === "-b" || t === "--cookie") {
      const cookie = tokens[++i] || "";
      if (cookie.includes("=")) pushHeader("Cookie", cookie);
      continue;
    }
    if (t === "-A" || t === "--user-agent") {
      pushHeader("User-Agent", tokens[++i] || "");
      continue;
    }
    if (t === "-e" || t === "--referer") {
      pushHeader("Referer", tokens[++i] || "");
      continue;
    }
    if (t === "-G" || t === "--get") {
      getFlag = true;
      continue;
    }
    if (t === "--url") {
      url = tokens[++i] || "";
      continue;
    }
    if (t.startsWith("-")) {
      // unknown flag, skip value if next is non-flag
      if (tokens[i + 1] && !tokens[i + 1].startsWith("-")) i++;
      continue;
    }
    if (!url && /^https?:\/\//i.test(t)) url = t;
  }

  let bodyType: RequestBodyType = "none";
  let body = "";
  let urlEncodedRows: KV[] = [];
  const joinedData = rawBodyParts.join("&");

  if (sawForm) {
    bodyType = "form-data";
    if (!explicitMethod) method = "POST";
    // The real multipart boundary is generated at send time — an explicit
    // Content-Type from the curl command would carry a stale boundary and
    // break the upload, so it can't be kept (same reasoning as the UI's
    // inferHeaderPatch for form-data).
    for (let i = headers.length - 1; i >= 0; i--) {
      if (headers[i].key.toLowerCase() === "content-type") headers.splice(i, 1);
    }
  } else if (getFlag && joinedData) {
    url = mergeQueryString(url, joinedData);
  } else if (joinedData) {
    body = joinedData;
    if (!explicitMethod) method = "POST";
    if (sawDataUrlEncode) {
      bodyType = "x-www-form-urlencoded";
      urlEncodedRows = parseUrlEncodedRows(joinedData);
    } else {
      bodyType = looksLikeJson(body) ? "json" : "raw";
    }
  }

  const inferredContentType =
    headers.find((header) => header.key.toLowerCase() === "content-type")?.value.toLowerCase() ??
    "";
  if (bodyType === "raw") {
    if (inferredContentType.includes("xml")) bodyType = "xml";
    if (inferredContentType.includes("x-www-form-urlencoded")) {
      bodyType = "x-www-form-urlencoded";
      urlEncodedRows = parseUrlEncodedRows(body);
    }
    if (inferredContentType.includes("graphql")) bodyType = "graphql";
  }

  const now = Date.now();
  const drafts = {
    ...createDefaultBodyDrafts(),
    json: bodyType === "json" ? body : "",
    raw: bodyType === "raw" ? body : "",
    xml: bodyType === "xml" ? body : "",
    formData: formRows,
    urlEncoded: urlEncodedRows,
    graphql:
      bodyType === "graphql"
        ? { query: body, variables: "{\n  \n}", operationName: "" }
        : createDefaultBodyDrafts().graphql,
  };

  return normalizeApiRequest({
    id: uid(),
    workspaceId,
    collectionId,
    name: url ? safePathname(url) : "Imported cURL",
    method,
    url,
    headers,
    queryParams: [],
    body,
    bodyType,
    bodyDrafts: drafts,
    auth,
    createdAt: now,
    updatedAt: now,
  });
}

function mergeQueryString(url: string, data: string): string {
  try {
    const parsed = new URL(url);
    const extra = new URLSearchParams(data);
    extra.forEach((value, key) => parsed.searchParams.append(key, value));
    return parsed.toString();
  } catch {
    const sep = url.includes("?") ? "&" : "?";
    return url ? `${url}${sep}${data}` : url;
  }
}

function parseUrlEncodedRows(data: string): KV[] {
  if (!data) return [];
  return data
    .split("&")
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.indexOf("=");
      const rawKey = idx >= 0 ? pair.slice(0, idx) : pair;
      const rawValue = idx >= 0 ? pair.slice(idx + 1) : "";
      return {
        id: uid(),
        key: safeDecodeURIComponent(rawKey),
        value: safeDecodeURIComponent(rawValue),
        enabled: true,
      };
    });
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

function safePathname(url: string): string {
  try {
    return new URL(url).pathname || url;
  } catch {
    return url;
  }
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
      if (c === quote) {
        quote = null;
        continue;
      }
      cur += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (/\s/.test(c)) {
      if (cur) {
        out.push(cur);
        cur = "";
      }
      continue;
    }
    cur += c;
  }
  if (cur) out.push(cur);
  return out;
}
