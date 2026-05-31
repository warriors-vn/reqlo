export type ResponseKind = "empty" | "json" | "text" | "html" | "image" | "pdf" | "binary";

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
  return kind === "json" || kind === "text" || kind === "html";
}
