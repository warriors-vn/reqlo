import type { OAuth2CachedToken } from "@/services/db";

export type ResponseKind =
  | "empty"
  | "json"
  | "text"
  | "html"
  | "stream"
  | "image"
  | "pdf"
  | "binary";

export interface ExecutionResult {
  status: number | null;
  statusText: string;
  durationMs: number;
  sizeBytes: number;
  headers: Record<string, string>;
  body: string;
  contentType: string;
  ok: boolean;
  responseKind: ResponseKind;
  blob: Blob | null;
  fileName: string | null;
  error?: string;
  /** True when this result came from a saved mock instead of a real network call. */
  mocked?: boolean;
  /** Environment variables a pre-request script set, for the caller to persist. */
  scriptEnvironmentPatch?: Record<string, string>;
  /** Set when the pre-request script threw, timed out, or returned something invalid. */
  scriptError?: string;
  /** A cached OAuth2 token auto-refreshed before sending, for the caller to persist. */
  refreshedOAuth2Token?: OAuth2CachedToken;
  /** Set when a cached OAuth2 token was expired and refreshing it was unavailable or failed — the request was not sent. */
  oauth2RefreshError?: string;
  /** `{{VAR}}` names this send referenced that the active environment had no
   * value for — each substituted an empty string, so the request that went out
   * isn't the one the user wrote. Absent when everything resolved. */
  unresolvedVariables?: string[];
  /** True when a likely-CORS failure on the direct request was retried
   * through reqlo's own same-origin proxy (see executor.ts), and that retry
   * is what actually produced this result. */
  viaProxy?: boolean;
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function getExecutionResultExcerpt(result: ExecutionResult, maxLength = 200) {
  const trimmed = result.body.trim();
  if (trimmed) return trimmed.slice(0, maxLength);
  if (result.error) return result.error;
  if (result.responseKind === "empty") return "(empty response)";
  return `[${formatResponseKindLabel(result.responseKind)} • ${formatBytes(result.sizeBytes)}]`;
}

export function formatResponseKindLabel(kind: ResponseKind) {
  switch (kind) {
    case "json":
      return "JSON";
    case "text":
      return "Text";
    case "html":
      return "HTML";
    case "stream":
      return "Stream";
    case "image":
      return "Image";
    case "pdf":
      return "PDF";
    case "binary":
      return "Binary";
    case "empty":
      return "Empty";
  }
}

export function isTextualResponse(kind: ResponseKind) {
  return kind === "json" || kind === "text" || kind === "html" || kind === "stream";
}
