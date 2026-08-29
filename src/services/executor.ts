import { type ApiRequest, type Environment, type MockConfig } from "@/services/db";
import {
  applyPreRequestScript,
  buildResolvedRequestArtifacts,
} from "@/features/code-snippets/utils/request-resolver";
import { fetchClientCredentialsToken, refreshOAuth2Token } from "@/services/oauth2";
import type { ExecutionResult, ResponseKind } from "@/services/execution";

export interface ExecuteRequestOptions {
  /** External cancellation source (e.g. a Cancel button) — independent of
   * the internal timeout-driven abort below; whichever fires first wins. */
  signal?: AbortSignal;
}

export async function executeRequest(
  req: ApiRequest,
  environment?: Environment | null,
  options?: ExecuteRequestOptions,
): Promise<ExecutionResult> {
  if (req.mock.enabled) {
    return buildMockResult(req.mock);
  }

  const started = performance.now();
  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  if (req.timeoutMs > 0) {
    timeoutHandle = setTimeout(() => {
      controller.abort(
        new DOMException(`Request timed out after ${req.timeoutMs}ms.`, "TimeoutError"),
      );
    }, req.timeoutMs);
  }
  if (options?.signal) {
    const cancel = () => controller.abort(new DOMException("Request cancelled.", "AbortError"));
    // An already-aborted signal never fires a future "abort" event — check
    // the current state directly too, or a cancel that raced ahead of this
    // call (unlikely today given callers create a fresh controller per send,
    // but not guaranteed) would silently never propagate.
    if (options.signal.aborted) cancel();
    else options.signal.addEventListener("abort", cancel, { once: true });
  }

  let effectiveReq = req;
  let refreshedOAuth2Token: ExecutionResult["refreshedOAuth2Token"];
  let scriptEnvironmentPatch: Record<string, string> | undefined;
  let scriptError: string | undefined;
  try {
    if (req.auth.type === "oauth2" && req.auth.oauth2?.cachedToken) {
      const oauth2Config = req.auth.oauth2;
      const cached = req.auth.oauth2.cachedToken;
      const expired = cached.expiresAt !== null && cached.expiresAt <= Date.now();
      if (expired) {
        try {
          // Client Credentials needs no user interaction to re-fetch, so it
          // never needs (or gets) a refresh token — treat expiry as "get a
          // fresh token" rather than requiring one, mirroring the manual
          // "Get New Access Token" button's own grant-type branching.
          const refreshed =
            oauth2Config.grantType === "client_credentials"
              ? await fetchClientCredentialsToken(oauth2Config, environment, controller.signal)
              : cached.refreshToken
                ? await refreshOAuth2Token(oauth2Config, environment, controller.signal)
                : null;
          if (!refreshed) {
            return oauth2FailureResult(
              started,
              "OAuth2 access token expired and no refresh token is available — get a new access token.",
            );
          }
          refreshedOAuth2Token = refreshed;
          effectiveReq = {
            ...req,
            auth: { ...req.auth, oauth2: { ...oauth2Config, cachedToken: refreshed } },
          };
        } catch (e) {
          const isAbort =
            e instanceof DOMException && (e.name === "AbortError" || e.name === "TimeoutError");
          const msg = e instanceof Error ? e.message : String(e);
          return oauth2FailureResult(
            started,
            isAbort ? msg : `Couldn't refresh the expired OAuth2 token: ${msg}`,
          );
        }
      }
    }

    // Resolved once up front — reused as-is unless a script actually patches
    // the environment, in which case it's the only case that needs a second,
    // re-interpolated resolve (avoids doubling body/FormData serialization
    // on every send just to give the script a preview).
    const initialResolve = buildResolvedRequestArtifacts(effectiveReq, environment);
    const scriptOutcome = await applyPreRequestScript(effectiveReq, environment, initialResolve, {
      method: effectiveReq.method,
      headers: initialResolve.resolvedHeaders,
      body:
        typeof initialResolve.serializedBody.body === "string"
          ? initialResolve.serializedBody.body
          : null,
    });
    const { resolved, scriptHeaderPatch } = scriptOutcome;
    scriptEnvironmentPatch = scriptOutcome.scriptEnvironmentPatch;
    scriptError = scriptOutcome.scriptError;

    const { url, resolvedHeaders: headers, serializedBody } = resolved;
    if (scriptHeaderPatch) Object.assign(headers, scriptHeaderPatch);
    const init: RequestInit = { method: effectiveReq.method, headers };

    if (
      effectiveReq.method !== "GET" &&
      effectiveReq.method !== "HEAD" &&
      serializedBody.body !== undefined &&
      serializedBody.body !== null
    ) {
      init.body = serializedBody.body;
    }

    const res = await fetch(url, { ...init, signal: controller.signal });
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
      scriptEnvironmentPatch,
      scriptError,
      refreshedOAuth2Token,
    };
  } catch (e: unknown) {
    const isAbort =
      e instanceof DOMException && (e.name === "AbortError" || e.name === "TimeoutError");
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ...emptyFailureResult(started),
      error: isAbort ? msg : `Request failed: ${msg}. Check the URL, CORS, or network connection.`,
      scriptEnvironmentPatch,
      scriptError,
      refreshedOAuth2Token,
    };
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

/** Shared shape for a result with no real response — the request never went
 * out at all, so every field describing one is empty/null. */
function emptyFailureResult(started: number): ExecutionResult {
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
  };
}

function oauth2FailureResult(started: number, message: string): ExecutionResult {
  return { ...emptyFailureResult(started), error: message, oauth2RefreshError: message };
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
