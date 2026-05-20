import { buildResolvedRequestArtifacts } from "@/features/code-snippets/utils/request-resolver";
import type { SnippetContext, SnippetMultipartEntry } from "@/features/code-snippets/types";
import type { ApiRequest, Environment } from "@/services/db";

export function buildSnippetContext(
  request: ApiRequest,
  environment?: Environment | null,
): SnippetContext {
  const { url, resolvedHeaders, resolvedQueryParams, resolvedRequest, serializedBody } =
    buildResolvedRequestArtifacts(request, environment);

  const headers = Object.entries(resolvedHeaders).map(([key, value]) => ({ key, value }));
  const queryParams = resolvedQueryParams.map((item) => ({ key: item.key, value: item.value }));
  const canSendBody = request.method !== "GET" && request.method !== "HEAD";

  const body = (() => {
    switch (request.bodyType) {
      case "none":
        return { kind: "none", contentType: null } as const;
      case "json":
      case "raw":
      case "xml":
      case "graphql":
        return {
          kind: "text",
          bodyType: request.bodyType,
          text: typeof serializedBody.body === "string" ? serializedBody.body : "",
          contentType: serializedBody.contentType,
        } as const;
      case "x-www-form-urlencoded":
        return {
          kind: "urlencoded",
          entries: resolvedRequest.bodyDrafts.urlEncoded
            .filter((row) => row.enabled && row.key.trim())
            .map((row) => ({ key: row.key, value: row.value })),
          encoded: typeof serializedBody.body === "string" ? serializedBody.body : "",
          contentType: serializedBody.contentType ?? "application/x-www-form-urlencoded",
        } as const;
      case "form-data": {
        const entries: SnippetMultipartEntry[] = resolvedRequest.bodyDrafts.formData
          .filter((row) => row.enabled && row.key.trim())
          .flatMap((row) => {
            if (row.kind === "file") {
              return row.files.map((file) => ({
                key: row.key,
                kind: "file" as const,
                value: file.name,
                fileName: file.name,
                mimeType: row.contentType || file.type || "application/octet-stream",
                hasBlob: !!file.blob,
              }));
            }
            return [
              {
                key: row.key,
                kind: "text" as const,
                value: row.value,
              },
            ];
          });
        return { kind: "multipart", entries, contentType: null } as const;
      }
      case "binary": {
        const file = resolvedRequest.bodyDrafts.binary.file;
        return {
          kind: "binary",
          fileName: file?.name ?? "payload.bin",
          mimeType: file?.type || "application/octet-stream",
          size: file?.size ?? 0,
          hasBlob: !!file?.blob,
          contentType: (serializedBody.contentType ?? file?.type) || "application/octet-stream",
        } as const;
      }
    }
  })();

  return {
    requestName: request.name || "Untitled request",
    method: request.method,
    url,
    headers,
    queryParams,
    body,
    canSendBody,
    authType: request.auth.type,
    request,
    environment: environment ?? null,
  };
}
