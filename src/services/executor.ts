import { type ApiRequest, type Environment, type MockConfig } from "@/services/db";
import {
  applyPreRequestScript,
  buildResolvedRequestArtifacts,
  findMissingHostVariables,
  setHeader,
} from "@/features/code-snippets/utils/request-resolver";
import { fetchClientCredentialsToken, refreshOAuth2Token } from "@/services/oauth2";
import { isTextualResponse, type ExecutionResult, type ResponseKind } from "@/services/execution";
import {
  decodeUpstreamHeaders,
  PROXIED_HEADER,
  UPSTREAM_HEADERS_HEADER,
} from "@/services/proxy-constants";
import {
  fetchViaProxy,
  ProxyTargetError,
  ProxyUnavailableError,
  throwIfProxyError,
} from "@/services/proxy-client";
import type { RequestAncestors } from "@/services/inheritance";
import type { ScriptLogEntry, ScriptResponseContext, ScriptTestResult } from "@/services/scripting";

// Re-exported: these lived here before OAuth2 needed them too, and importing
// them from executor would be a cycle (executor already imports oauth2).
export { fetchViaProxy, ProxyUnavailableError };

export interface ExecuteRequestOptions {
  /** External cancellation source (e.g. a Cancel button) — independent of
   * the internal timeout-driven abort below; whichever fires first wins. */
  signal?: AbortSignal;
  /** Called with the response body decoded so far, every time another chunk
   * arrives — lets a caller render live progress (an SSE feed, or just "N KB
   * so far…") before the send finishes. `contentType` is passed on every
   * call for simplicity, but is always the same value. Only fires for
   * textual/JSON/HTML/event-stream responses — a binary body is still read
   * as a single `Blob` and never routed through here. */
  onStreamChunk?: (textSoFar: string, contentType: string) => void;
}

/** Runs `callback` once when `signal` aborts — immediately if it's already
 * aborted, since an already-fired signal never emits a future "abort" event. */
function onAbort(signal: AbortSignal, callback: () => void): void {
  if (signal.aborted) callback();
  else signal.addEventListener("abort", callback, { once: true });
}

/**
 * `ancestors` is positional and required rather than tucked into `options`
 * for the same reason buildResolvedRequestArtifacts takes it that way: a send
 * that silently omits its collection's headers/auth is precisely the bug this
 * feature must not ship.
 */
export async function executeRequest(
  req: ApiRequest,
  environment: Environment | null | undefined,
  ancestors: RequestAncestors,
  options?: ExecuteRequestOptions,
): Promise<ExecutionResult> {
  if (req.mock.enabled) {
    const mocked = await buildMockResult(req.mock, options?.signal);
    // Tests run against a mock too. A mock exists precisely to stand in for a
    // response, so tests that only ever run against the network would be
    // unusable exactly where the mock is being relied on.
    if (mocked.error) return mocked;
    const resolved = buildResolvedRequestArtifacts(req, environment, ancestors);
    const post = await applyPostResponseScript(req, resolved, {
      status: mocked.status,
      statusText: mocked.statusText,
      ok: mocked.ok,
      durationMs: mocked.durationMs,
      headers: mocked.headers,
      body: mocked.body,
    });
    return {
      ...mocked,
      scriptEnvironmentPatch: post.environmentPatch,
      postScriptError: post.error,
      scriptTests: post.tests,
      scriptLogs: post.logs,
    };
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
    onAbort(options.signal, () =>
      controller.abort(new DOMException("Request cancelled.", "AbortError")),
    );
  }

  let effectiveReq = req;
  let refreshedOAuth2Token: ExecutionResult["refreshedOAuth2Token"];
  let scriptEnvironmentPatch: Record<string, string> | undefined;
  let scriptError: string | undefined;
  let preScriptLogs: ScriptLogEntry[] | undefined;
  let unresolvedVariables: string[] | undefined;
  let resolvedUrl: string | undefined;
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
    const initialResolve = buildResolvedRequestArtifacts(effectiveReq, environment, ancestors);
    const scriptOutcome = await applyPreRequestScript(
      effectiveReq,
      environment,
      initialResolve,
      {
        method: effectiveReq.method,
        headers: initialResolve.resolvedHeaders,
        body:
          typeof initialResolve.serializedBody.body === "string"
            ? initialResolve.serializedBody.body
            : null,
      },
      ancestors,
    );
    const { resolved, scriptHeaderPatch } = scriptOutcome;
    scriptEnvironmentPatch = scriptOutcome.scriptEnvironmentPatch;
    scriptError = scriptOutcome.scriptError;
    preScriptLogs = scriptOutcome.scriptLogs;

    const { url, resolvedHeaders: headers, serializedBody } = resolved;
    resolvedUrl = maskQueryCredential(url, effectiveReq.auth);
    unresolvedVariables = resolved.unresolvedVariables.length
      ? resolved.unresolvedVariables
      : undefined;
    if (scriptHeaderPatch) {
      for (const [name, value] of Object.entries(scriptHeaderPatch))
        setHeader(headers, name, value);
    }
    const init: RequestInit = { method: effectiveReq.method, headers };

    if (
      effectiveReq.method !== "GET" &&
      effectiveReq.method !== "HEAD" &&
      serializedBody.body !== undefined &&
      serializedBody.body !== null
    ) {
      init.body = serializedBody.body;
    }

    const missingHost = findMissingHostVariables(
      effectiveReq.url,
      url,
      resolved.unresolvedVariables,
    );
    if (missingHost.length) throw new MissingHostError(missingHost);

    // A URL that can't even be parsed is the user's to fix, not a sign the
    // server is down — say so before the proxy fetch turns it into a TypeError
    // that reads exactly like a network failure.
    try {
      new URL(url, globalThis.location?.origin);
    } catch {
      throw new InvalidUrlError(url);
    }

    // Every send goes through reqlo's own server. Nothing is attempted
    // directly from the browser first — see fetchViaProxy for why.
    const res = await fetchViaProxy(url, init, controller.signal);
    if (!res.headers.has(PROXIED_HEADER)) {
      throw new ProxyUnavailableError();
    }
    await throwIfProxyError(res);
    // The target's own headers, as the proxy recorded them. The headers on
    // `res` itself also carry the browser↔reqlo hop (cache-control: no-store,
    // connection, vary, the proxy markers) and never carry set-cookie. The
    // fallback is for a proxy that left the copy off as too large.
    let respHeaders = decodeUpstreamHeaders(res.headers.get(UPSTREAM_HEADERS_HEADER));
    if (!respHeaders) {
      respHeaders = {};
      const raw = respHeaders;
      res.headers.forEach((v, k) => {
        raw[k] = v;
      });
    }
    const contentType = respHeaders["content-type"] || "";
    const { blob, body, sizeBytes } = await readResponseBody(res, contentType, (text) =>
      options?.onStreamChunk?.(text, contentType),
    );
    const responseKind = detectResponseKind(contentType, res.status, sizeBytes);
    // Taken here, before the post-response script: that script lazy-loads
    // QuickJS on first use and may run for up to 2s, and none of that is the
    // API's response time.
    const durationMs = performance.now() - started;

    const post = await applyPostResponseScript(effectiveReq, resolved, {
      status: res.status,
      statusText: res.statusText,
      ok: res.ok,
      durationMs,
      headers: respHeaders,
      body: isTextualResponse(responseKind) ? body : "",
    });
    // Post wins on a key collision: it ran later and saw the response, so its
    // value is the more informed one.
    if (post.environmentPatch) {
      scriptEnvironmentPatch = { ...scriptEnvironmentPatch, ...post.environmentPatch };
    }

    return {
      status: res.status,
      statusText: res.statusText,
      durationMs,
      sizeBytes,
      headers: respHeaders,
      body: isTextualResponse(responseKind) ? body : "",
      contentType,
      ok: res.ok,
      responseKind,
      blob,
      fileName: getDownloadFilename(respHeaders["content-disposition"]),
      scriptEnvironmentPatch,
      scriptError,
      refreshedOAuth2Token,
      unresolvedVariables,
      resolvedUrl,
      postScriptError: post.error,
      scriptTests: post.tests,
      scriptLogs: joinLogs(preScriptLogs, post.logs),
    };
  } catch (e: unknown) {
    const isAbort =
      e instanceof DOMException && (e.name === "AbortError" || e.name === "TimeoutError");
    return {
      ...emptyFailureResult(started),
      error: isAbort ? (e instanceof Error ? e.message : String(e)) : describeSendFailure(e),
      scriptEnvironmentPatch,
      scriptError,
      scriptLogs: preScriptLogs,
      refreshedOAuth2Token,
      unresolvedVariables,
      resolvedUrl,
    };
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

/** An API key sent as a query parameter is a credential; history is stored,
 * searched and exported, so its value never goes in there. */
export function maskQueryCredential(url: string, auth: ApiRequest["auth"]): string {
  if (auth.type !== "api-key" || auth.addTo !== "query" || !auth.key) return url;
  const name = encodeURIComponent(auth.key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return url.replace(new RegExp(`([?&]${name}=)[^&#]*`, "g"), "$1•••");
}

function joinLogs(...groups: (ScriptLogEntry[] | undefined)[]): ScriptLogEntry[] | undefined {
  const all = groups.flatMap((group) => group ?? []);
  return all.length ? all : undefined;
}

interface PostResponseOutcome {
  environmentPatch?: Record<string, string>;
  tests?: ScriptTestResult[];
  logs?: ScriptLogEntry[];
  error?: string;
}

/**
 * Runs a request's post-response script, if it has one enabled. Kept beside
 * the send rather than in runner.ts so a mocked result gets tests too — a test
 * that only runs against the network is no use for the case mocks exist for.
 *
 * A failure here never invalidates the response: the request already happened
 * and its result is real, so a broken script surfaces as postScriptError next
 * to the response rather than replacing it.
 */
async function applyPostResponseScript(
  request: ApiRequest,
  resolved: { envMap: Map<string, string>; url: string; resolvedHeaders: Record<string, string> },
  response: ScriptResponseContext,
): Promise<PostResponseOutcome> {
  const script = request.postResponseScript;
  if (!script?.enabled || !script.source.trim()) return {};

  const { runPostResponseScript } = await import("@/services/scripting");
  const outcome = await runPostResponseScript(
    script.source,
    {
      method: request.method,
      url: resolved.url,
      headers: resolved.resolvedHeaders,
      body: null,
      environment: Object.fromEntries(resolved.envMap),
    },
    response,
  );

  const logs = outcome.logs?.length ? outcome.logs : undefined;
  if (outcome.error) return { error: outcome.error, tests: outcome.tests, logs };
  return {
    environmentPatch:
      outcome.environment && Object.keys(outcome.environment).length
        ? outcome.environment
        : undefined,
    tests: outcome.tests?.length ? outcome.tests : undefined,
    logs,
  };
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

/**
 * A cross-origin CORS block and a plain DNS/connection failure both surface
 * from `fetch` as the exact same `TypeError` with no status — browsers
 * deliberately don't expose which one happened, to avoid leaking whether a
 * blocked origin is even reachable. So this can only ever narrow down a
 * *likely* cause, never confirm one; the two cases below are hedged
 * accordingly, and anything that doesn't match either falls back to the
 * original generic wording.
 */
function describeSendFailure(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);

  if (
    e instanceof ProxyUnavailableError ||
    e instanceof InvalidUrlError ||
    e instanceof MissingHostError ||
    e instanceof ProxyTargetError
  ) {
    return e.message;
  }

  // Only a TypeError can be the browser's "fetch failed" for the same-origin
  // call to /api/proxy. Anything else is a bug or bad input on this side, and
  // telling the user to check that reqlo is running would send them looking
  // in the wrong place.
  if (!(e instanceof TypeError)) return `Couldn't send this request: ${msg}`;

  if (globalThis.navigator?.onLine === false) {
    return (
      "Couldn't send — this browser is currently offline, so nothing went out. " +
      "Your saved requests, collections, and history are stored locally and still work."
    );
  }

  // The only fetch this describes is the same-origin one to /api/proxy, so
  // CORS can't apply and the target's own scheme is the server's problem, not
  // the browser's. A failure here means reqlo's own server didn't answer.
  return `Couldn't reach reqlo's own server to send this request: ${msg}. Check that reqlo is still running.`;
}

/** The URL starts with a variable that has no value, so there is no host to
 * send to. Thrown before the fetch, since the fetch would go to reqlo itself. */
export class MissingHostError extends Error {
  constructor(names: string[]) {
    const list = names.map((name) => `{{${name}}}`).join(", ");
    super(
      `${list} ${names.length > 1 ? "aren't" : "isn't"} defined, so this request has no host to send to. Add ${names.length > 1 ? "them" : "it"} to the active environment or to the globals.`,
    );
    this.name = "MissingHostError";
  }
}

/** The resolved URL isn't something `new URL` can parse (e.g. "http://"). */
export class InvalidUrlError extends Error {
  constructor(url: string) {
    super(
      `"${url}" isn't a valid URL. Check it for typos, or a variable that resolved to nothing.`,
    );
    this.name = "InvalidUrlError";
  }
}

async function buildMockResult(mock: MockConfig, signal?: AbortSignal): Promise<ExecutionResult> {
  const started = performance.now();
  if (mock.delayMs > 0) {
    // The delay is the only awaited step in a mocked send — without listening
    // for the external signal here, Cancel/Stop would have to wait out the
    // full delay before a mocked request could ever be interrupted.
    const cancelled = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(false), mock.delayMs);
      if (!signal) return;
      onAbort(signal, () => {
        clearTimeout(timeout);
        resolve(true);
      });
    });
    if (cancelled) {
      return { ...emptyFailureResult(started), error: "Request cancelled." };
    }
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

/** The subset of `detectResponseKind` decidable from content-type alone,
 * before any bytes are read — `readResponseBody` below combines this with
 * `isTextualResponse` to decide whether to stream the body as text (and call
 * `onStreamChunk`) or read it as an opaque `Blob`, without waiting for the
 * response to finish first. Returns `null` for anything not recognized here,
 * which `detectResponseKind` then resolves to `"binary"`. */
function classifyByContentType(contentType: string): ResponseKind | null {
  const normalized = contentType.toLowerCase();
  if (normalized.includes("text/event-stream")) return "stream";
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
  return null;
}

function detectResponseKind(contentType: string, status: number, sizeBytes: number): ResponseKind {
  if (status === 204 || status === 205 || status === 304 || sizeBytes === 0) return "empty";
  return classifyByContentType(contentType) ?? "binary";
}

/**
 * Reads a fetch `Response` body. A textual/JSON/HTML/event-stream content
 * type is read progressively via the stream reader, decoding and reporting
 * through `onChunk` as bytes arrive — the live-progress mechanism `Cancel`
 * already gets for free, since aborting `controller` here ends the same
 * `fetch` this reader is attached to. Everything else (images, PDFs,
 * arbitrary binary) is read as a single opaque `Blob`, exactly as before —
 * this never touches or decodes those bytes as text.
 *
 * Either way the full body is also reconstructed as a `Blob` (from the
 * accumulated chunks, in the streaming case) so Download/preview keep
 * working unchanged for a streamed response too.
 */
async function readResponseBody(
  res: Response,
  contentType: string,
  onChunk: (textSoFar: string) => void,
): Promise<{ blob: Blob; body: string; sizeBytes: number }> {
  const contentTypeKind = classifyByContentType(contentType);
  const isStreamCandidate = contentTypeKind !== null && isTextualResponse(contentTypeKind);
  if (!isStreamCandidate || !res.body) {
    const blob = await res.blob();
    return { blob, body: "", sizeBytes: blob.size };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const chunks: Uint8Array[] = [];
  let text = "";
  let sizeBytes = 0;
  // Bounds how often the live callback fires — not how much of the body it
  // ever sees. An earlier version gated the call itself on `text.length <=
  // MAX_RESPONSE_RENDER_LENGTH`, which stopped it *permanently* once a long
  // stream crossed that cap: the live view would freeze mid-stream and look
  // hung even though data kept arriving. Time-based throttling keeps it live
  // for the whole connection while still capping the update rate — the real
  // cost this guards against (a full SSE re-parse on every single chunk) is
  // about frequency, not body size, and `text` always carries everything
  // regardless — assertions/extract/history each apply the exact same cap
  // themselves, against the real untruncated length.
  let lastEmit = 0;
  const EMIT_INTERVAL_MS = 80;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    sizeBytes += value.byteLength;
    text += decoder.decode(value, { stream: true });
    const now = performance.now();
    if (now - lastEmit >= EMIT_INTERVAL_MS) {
      lastEmit = now;
      onChunk(text);
    }
  }
  text += decoder.decode();
  // Guarantee the caller sees the final state at least once, even if the
  // last chunk arrived inside the throttle window of the previous emit.
  onChunk(text);

  return { blob: new Blob(chunks as BlobPart[], { type: contentType }), body: text, sizeBytes };
}

function getDownloadFilename(contentDisposition?: string) {
  if (!contentDisposition) return null;

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      // A malformed %-escape must not turn a successful response into an
      // error — fall through to the plain filename, or none.
    }
  }

  const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1] ?? null;
}
