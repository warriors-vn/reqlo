import type { ExecutionResult } from "@/services/execution";

/** Saves the response to disk, preferring the blob the executor already
 * captured (binary responses) over re-wrapping the decoded text. Falls back
 * to a name derived from the response kind when the server sent no
 * Content-Disposition filename. */
export function downloadResponse(result: ExecutionResult) {
  const blob = result.blob ?? new Blob([result.body], { type: result.contentType || "text/plain" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = result.fileName ?? buildFallbackFilename(result);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildFallbackFilename(result: ExecutionResult) {
  const extension =
    result.responseKind === "json"
      ? "json"
      : result.responseKind === "html"
        ? "html"
        : result.responseKind === "text" || result.responseKind === "stream"
          ? "txt"
          : result.responseKind === "image"
            ? inferImageExtension(result.contentType)
            : result.responseKind === "pdf"
              ? "pdf"
              : "bin";
  return `response.${extension}`;
}

function inferImageExtension(contentType: string) {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("gif")) return "gif";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("svg")) return "svg";
  return "img";
}
