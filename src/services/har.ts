import {
  createDefaultBodyDrafts,
  createEmptyFormDataRow,
  normalizeApiRequest,
  uid,
  type ApiRequest,
  type Folder,
  type HttpMethod,
  type KV,
  type RequestBodyType,
} from "@/services/db";
import { looksLikeJson } from "@/services/import-shared";

// HAR (HTTP Archive) 1.2 — a browser devtools "Save all as HAR" export. Only
// the fields this importer reads. http://www.softwareishard.com/blog/har-12-spec/
// Unlike Postman/Insomnia, a HAR has no folder/name structure of its own —
// it's a flat list of captured network entries — so this importer invents
// both: one folder per request origin, one request name per method+path.

interface HarNameValue {
  name?: string;
  value?: string;
}

interface HarPostDataParam extends HarNameValue {
  fileName?: string;
}

interface HarPostData {
  mimeType?: string;
  text?: string;
  params?: HarPostDataParam[];
}

interface HarRequest {
  method?: string;
  url?: string;
  headers?: HarNameValue[];
  queryString?: HarNameValue[];
  postData?: HarPostData;
}

interface HarEntry {
  request?: HarRequest;
}

interface HarDocument {
  log?: {
    entries?: HarEntry[];
  };
}

export interface HarImportResult {
  collectionName: string;
  folders: Folder[];
  requests: ApiRequest[];
  warnings: string[];
}

// A HAR entry's URL can legitimately be one of these without being a real
// API call reqlo can send — a browser extension's own network activity, or
// devtools-internal traffic that happened to get captured alongside the page.
const SKIPPED_PROTOCOLS = new Set([
  "data:",
  "chrome-extension:",
  "moz-extension:",
  "safari-extension:",
  "ms-browser-extension:",
  "about:",
  "chrome:",
  "devtools:",
]);

export function looksLikeHarLog(raw: unknown): raw is HarDocument {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  const log = o.log as Record<string, unknown> | undefined;
  return !!log && Array.isArray(log.entries);
}

export function parseHarLog(raw: HarDocument, workspaceId: string): HarImportResult {
  const entries = raw.log?.entries ?? [];
  const folders: Folder[] = [];
  const requests: ApiRequest[] = [];
  const warnings: string[] = [];
  const now = Date.now();

  const folderIdByOrigin = new Map<string, string>();
  const positionByFolder = new Map<string, number>();
  const nextPosition = (folderId: string) => {
    const position = positionByFolder.get(folderId) ?? 0;
    positionByFolder.set(folderId, position + 1);
    return position;
  };

  let skipped = 0;

  for (const entry of entries) {
    const rawUrl = entry.request?.url;
    if (!rawUrl) {
      skipped++;
      continue;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      skipped++;
      continue;
    }
    if (SKIPPED_PROTOCOLS.has(parsedUrl.protocol)) {
      skipped++;
      continue;
    }

    const origin = parsedUrl.origin;
    let folderId = folderIdByOrigin.get(origin);
    if (!folderId) {
      const folder: Folder = {
        id: uid(),
        workspaceId,
        collectionId: "",
        parentFolderId: null,
        name: origin,
        position: folderIdByOrigin.size,
        createdAt: now,
      };
      folders.push(folder);
      folderId = folder.id;
      folderIdByOrigin.set(origin, folderId);
    }

    requests.push(
      convertRequest(entry.request!, parsedUrl, folderId, nextPosition(folderId), warnings),
    );
  }

  if (skipped > 0) {
    warnings.push(
      `${skipped} ${skipped === 1 ? "entry was" : "entries were"} skipped (no usable URL, or a browser-internal/data: URL).`,
    );
  }
  if (requests.length > 0) {
    warnings.push(
      "HAR files often contain live cookies and auth headers captured from a real browsing session — review the imported requests before sharing this collection with anyone.",
    );
  }

  return { collectionName: "Imported from HAR", folders, requests, warnings };
}

function convertRequest(
  request: HarRequest,
  parsedUrl: URL,
  folderId: string,
  position: number,
  warnings: string[],
): ApiRequest {
  const now = Date.now();
  const method = (request.method || "GET").toUpperCase() as HttpMethod;
  const name = `${method} ${parsedUrl.pathname || "/"}`;

  const headers = (request.headers ?? [])
    // HTTP/2 pseudo-headers (":authority", ":method", ...) aren't real
    // header fields — sending one back via fetch() throws.
    .filter((h) => h.name && !h.name.startsWith(":"))
    .map((h) => ({ id: uid(), key: h.name!, value: h.value ?? "", enabled: true }) satisfies KV);

  const queryStringSource = request.queryString?.length
    ? request.queryString
    : Array.from(parsedUrl.searchParams.entries()).map(([qName, value]) => ({
        name: qName,
        value,
      }));
  const queryParams = queryStringSource
    .filter((q) => q.name)
    .map((q) => ({ id: uid(), key: q.name!, value: q.value ?? "", enabled: true }) satisfies KV);

  const { bodyType, body, bodyDrafts } = convertBody(request.postData, warnings, name);

  return normalizeApiRequest({
    id: uid(),
    workspaceId: "",
    collectionId: "",
    folderId,
    position,
    name,
    method,
    // The query string is captured separately above — drop it here so
    // sending doesn't append it a second time.
    url: `${parsedUrl.origin}${parsedUrl.pathname}`,
    headers,
    queryParams,
    body,
    bodyType,
    bodyDrafts,
    createdAt: now,
    updatedAt: now,
  });
}

function convertBody(
  postData: HarPostData | undefined,
  warnings: string[],
  requestName: string,
): {
  bodyType: RequestBodyType;
  body: string;
  bodyDrafts: ReturnType<typeof createDefaultBodyDrafts>;
} {
  const drafts = createDefaultBodyDrafts();
  const mimeType = (postData?.mimeType ?? "").split(";")[0].trim().toLowerCase();
  if (!postData || !mimeType) return { bodyType: "none", body: "", bodyDrafts: drafts };

  if (mimeType === "application/x-www-form-urlencoded" && postData.params?.length) {
    drafts.urlEncoded = postData.params
      .filter((p) => p.name)
      .map((p) => ({ id: uid(), key: p.name!, value: p.value ?? "", enabled: true }) satisfies KV);
    return { bodyType: "x-www-form-urlencoded", body: "", bodyDrafts: drafts };
  }

  if (mimeType === "multipart/form-data") {
    let skippedFiles = 0;
    drafts.formData = (postData.params ?? []).map((p) => {
      const isFile = Boolean(p.fileName);
      if (isFile) skippedFiles++;
      const empty = createEmptyFormDataRow(isFile ? "file" : "text");
      return {
        ...empty,
        key: p.name ?? "",
        value: isFile ? "" : (p.value ?? ""),
        enabled: true,
      };
    });
    if (skippedFiles > 0) {
      warnings.push(
        `"${requestName}": ${skippedFiles} form-data file field(s) need to be re-attached — HAR captures don't include file contents.`,
      );
    }
    return { bodyType: "form-data", body: "", bodyDrafts: drafts };
  }

  const text = postData.text ?? "";
  const bodyType: RequestBodyType =
    mimeType === "application/json" || (mimeType.startsWith("text/") && looksLikeJson(text))
      ? "json"
      : mimeType === "application/xml" || mimeType === "text/xml"
        ? "xml"
        : "raw";
  if (bodyType === "json") drafts.json = text;
  else if (bodyType === "xml") drafts.xml = text;
  else drafts.raw = text;
  return { bodyType, body: text, bodyDrafts: drafts };
}
