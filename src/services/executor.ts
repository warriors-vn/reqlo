import type { ApiRequest, Environment } from "@/services/db";
import type { ExecutionResult } from "@/components/ResponseViewer";
import { buildResolvedRequestArtifacts } from "@/features/code-snippets/utils/request-resolver";

export async function executeRequest(
  req: ApiRequest,
  environment?: Environment | null,
): Promise<ExecutionResult> {
  const started = performance.now();
  try {
    const {
      url,
      resolvedHeaders: headers,
      serializedBody,
    } = buildResolvedRequestArtifacts(req, environment);
    const init: RequestInit = { method: req.method, headers };

    if (
      req.method !== "GET" &&
      req.method !== "HEAD" &&
      serializedBody.body !== undefined &&
      serializedBody.body !== null
    ) {
      init.body = serializedBody.body;
    }

    const res = await fetch(url, init);
    const text = await res.text();
    const respHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      respHeaders[k] = v;
    });

    return {
      status: res.status,
      statusText: res.statusText,
      durationMs: performance.now() - started,
      sizeBytes: new Blob([text]).size,
      headers: respHeaders,
      body: text,
      contentType: respHeaders["content-type"] || "",
      ok: res.ok,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      status: null,
      statusText: "",
      durationMs: performance.now() - started,
      sizeBytes: 0,
      headers: {},
      body: "",
      contentType: "",
      ok: false,
      error: `Request failed: ${msg}. Check the URL, CORS, or network connection.`,
    };
  }
}
