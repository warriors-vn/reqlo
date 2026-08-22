import type { ApiRequest, Environment, MockConfig } from "@/services/db";
import { buildResolvedRequestArtifacts } from "@/features/code-snippets/utils/request-resolver";
import type { ExecutionResult, ResponseKind } from "@/services/execution";

export async function executeRequest(
  req: ApiRequest,
  environment?: Environment | null,
): Promise<ExecutionResult> {
  if (req.mock.enabled) {
    return buildMockResult(req.mock);
  }

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
    const respHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      respHeaders[k] = v;
    });
    const contentType = respHeaders["content-type"] || "";
    const blob = await res.blob();
    const responseKind = detectResponseKind(contentType, res.status, blob.size);
    const body = isTextualResponse(responseKind) ? await blob.text() : "";

    return {
      status: res.status,
      statusText: res.statusText,
      durationMs: performance.now() - started,
      sizeBytes: blob.size,
      headers: respHeaders,
      body,
      contentType,
      ok: res.ok,
      responseKind,
      blob,
      fileName: getDownloadFilename(respHeaders["content-disposition"]),
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
      responseKind: "empty",
      blob: null,
      fileName: null,
      error: `Request failed: ${msg}. Check the URL, CORS, or network connection.`,
    };
  }
}

async function buildMockResult(mock: MockConfig): Promise<ExecutionResult> {
  const started = performance.now();
  if (mock.delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, mock.delayMs));
  }

  const bytes = new TextEncoder().encode(mock.body).length;
  const responseKind = detectResponseKind(mock.contentType, mock.status, bytes);

  return {
    status: mock.status,
    statusText: "",
    durationMs: performance.now() - started,
    sizeBytes: bytes,
    headers: mock.contentType ? { "content-type": mock.contentType } : {},
    body: isTextualResponse(responseKind) ? mock.body : "",
    contentType: mock.contentType,
    ok: mock.status >= 200 && mock.status < 300,
    responseKind,
    blob: new Blob([mock.body], { type: mock.contentType || "text/plain" }),
    fileName: null,
    mocked: true,
  };
}

function detectResponseKind(contentType: string, status: number, sizeBytes: number): ResponseKind {
  const normalized = contentType.toLowerCase();
  if (status === 204 || status === 205 || status === 304 || sizeBytes === 0) return "empty";
  if (normalized.includes("application/json") || normalized.includes("+json")) return "json";
  if (normalized.includes("text/html")) return "html";
  if (normalized.startsWith("image/")) return "image";
  if (normalized.includes("application/pdf")) return "pdf";
  if (
    normalized.startsWith("text/") ||
    normalized.includes("application/xml") ||
    normalized.includes("text/xml") ||
    normalized.includes("application/javascript") ||
    normalized.includes("application/x-www-form-urlencoded")
  ) {
    return "text";
  }
  return "binary";
}

function isTextualResponse(kind: ResponseKind) {
  return kind === "json" || kind === "text" || kind === "html";
}

function getDownloadFilename(contentDisposition?: string) {
  if (!contentDisposition) return null;

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);

  const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1] ?? null;
}
