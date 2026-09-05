import { serializeRequestBody } from "@/features/request-body/utils/body";
import type { SerializedRequestBody } from "@/features/request-body/types";
import {
  mergeEnvironmentVariables,
  type ApiRequest,
  type Environment,
  type KV,
  type RequestBodyDrafts,
} from "@/services/db";
import {
  applyInheritedDefaults,
  collectInheritedVariables,
  type RequestAncestors,
} from "@/services/inheritance";

export interface ResolvedRequestArtifacts {
  envMap: Map<string, string>;
  url: string;
  resolvedQueryParams: KV[];
  resolvedHeaders: Record<string, string>;
  resolvedRequest: ApiRequest;
  serializedBody: SerializedRequestBody;
  /** `{{VAR}}` names referenced anywhere in this request that the active
   * environment (plus globals) had no value for — each one substituted an
   * empty string. */
  unresolvedVariables: string[];
}

export function createEnvironmentMap(environment?: Environment | null) {
  return new Map(
    (environment?.variables ?? [])
      .filter((item) => item.enabled && item.key)
      .map((item) => [item.key, item.value]),
  );
}

/**
 * Merges workspace-level globals into an environment's variable list before
 * it's handed to createEnvironmentMap/buildResolvedRequestArtifacts/etc. —
 * every resolution function downstream stays a plain Environment | null
 * consumer with no idea globals exist. Environment-specific variables win
 * over a global with the same key: they're listed after the globals here,
 * and createEnvironmentMap's `new Map(...)` gives later duplicates
 * precedence. Globals still apply with no environment selected at all
 * (the whole point of "always-active"), by synthesizing a minimal
 * Environment wrapping just the globals.
 */
export function mergeGlobalsIntoEnvironment(
  environment: Environment | null,
  globals: KV[],
): Environment | null {
  if (!globals.length) return environment;
  return {
    id: environment?.id ?? "__globals__",
    workspaceId: environment?.workspaceId ?? "",
    name: environment?.name ?? "Globals",
    createdAt: environment?.createdAt ?? 0,
    variables: [...globals, ...(environment?.variables ?? [])],
  };
}

/**
 * The collection/folder counterpart to mergeGlobalsIntoEnvironment, and it
 * stacks on top of it: ancestor variables are listed after the globals the
 * caller already merged in but before the environment's own, so the final
 * precedence is workspace globals < collection < folders (outer→inner) <
 * environment — createEnvironmentMap's `new Map(...)` giving later duplicates
 * precedence is what actually enforces it.
 */
export function mergeInheritedVariablesIntoEnvironment(
  environment: Environment | null,
  ancestors: RequestAncestors,
): Environment | null {
  const inherited = collectInheritedVariables(ancestors);
  if (!inherited.length) return environment;
  return {
    id: environment?.id ?? "__inherited__",
    workspaceId: environment?.workspaceId ?? "",
    name: environment?.name ?? "Inherited",
    createdAt: environment?.createdAt ?? 0,
    variables: [...inherited, ...(environment?.variables ?? [])],
  };
}

/**
 * Substitutes `{{VAR}}` from the environment map. A key with no value still
 * resolves to an empty string — that's deliberate, since half-substituted
 * output would be worse — but every miss is recorded in `misses` when one is
 * passed, so callers can tell the user which variables silently vanished
 * instead of letting an empty URL segment or a blank auth token look like a
 * successful send.
 */
export function resolveTemplate(input: string, envMap: Map<string, string>, misses?: Set<string>) {
  return input.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key: string) => {
    const value = envMap.get(key);
    if (value === undefined) {
      misses?.add(key);
      return "";
    }
    return value;
  });
}

/**
 * A URL with no scheme is resolved by `fetch` against the app's own origin, so
 * "api.example.com/todos" silently fetches reqlo's own dev server and returns
 * its 404 page as if it were the API's response. Prepend a scheme when the
 * text looks like a bare host, matching what Postman and Insomnia do — http
 * for loopback (a local dev server almost never speaks TLS), https otherwise.
 * An explicitly relative URL (leading "/") is left alone: that one is
 * unambiguous about wanting the current origin.
 *
 * The scheme test deliberately requires "://" rather than a bare colon —
 * "localhost:8080" would otherwise parse as scheme "localhost" with path
 * "8080" and be left to hit the app's own origin, which is the exact bug this
 * function exists to prevent.
 */
const LOOPBACK_HOSTS = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i;

export function normalizeRequestUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed || /^[a-zA-Z][\w+.-]*:\/\//.test(trimmed) || trimmed.startsWith("/")) {
    return trimmed;
  }
  const host = trimmed.split(/[/?#]/, 1)[0];
  if (LOOPBACK_HOSTS.test(host)) return `http://${trimmed}`;
  if (host.includes(".")) return `https://${trimmed}`;
  return trimmed;
}

export function resolveKvList(list: KV[], envMap: Map<string, string>, misses?: Set<string>) {
  return list
    .filter((item) => item.enabled && item.key)
    .map((item) => ({
      ...item,
      key: resolveTemplate(item.key, envMap, misses),
      value: resolveTemplate(item.value, envMap, misses),
    }))
    .filter((item) => item.key.trim());
}

export function resolveRequestDrafts(
  request: ApiRequest,
  envMap: Map<string, string>,
  misses?: Set<string>,
): RequestBodyDrafts {
  return {
    ...request.bodyDrafts,
    json: resolveTemplate(request.bodyDrafts.json, envMap, misses),
    raw: resolveTemplate(request.bodyDrafts.raw, envMap, misses),
    xml: resolveTemplate(request.bodyDrafts.xml, envMap, misses),
    urlEncoded: request.bodyDrafts.urlEncoded.map((row) => ({
      ...row,
      key: resolveTemplate(row.key, envMap, misses),
      value: resolveTemplate(row.value, envMap, misses),
    })),
    formData: request.bodyDrafts.formData.map((row) => ({
      ...row,
      key: resolveTemplate(row.key, envMap, misses),
      value: resolveTemplate(row.value, envMap, misses),
    })),
    graphql: {
      ...request.bodyDrafts.graphql,
      query: resolveTemplate(request.bodyDrafts.graphql.query, envMap, misses),
      variables: resolveTemplate(request.bodyDrafts.graphql.variables, envMap, misses),
      operationName: resolveTemplate(request.bodyDrafts.graphql.operationName, envMap, misses),
    },
  };
}

export function applyResolvedAuth(
  request: ApiRequest,
  envMap: Map<string, string>,
  headers: Record<string, string>,
  queryParams: KV[],
  misses?: Set<string>,
) {
  switch (request.auth.type) {
    case "basic": {
      const username = resolveTemplate(request.auth.username ?? "", envMap, misses);
      const password = resolveTemplate(request.auth.password ?? "", envMap, misses);
      if (username || password) headers.Authorization = `Basic ${btoa(`${username}:${password}`)}`;
      return;
    }
    case "bearer": {
      const token = resolveTemplate(request.auth.token ?? "", envMap, misses);
      if (token) headers.Authorization = `Bearer ${token}`;
      return;
    }
    case "api-key": {
      const key = resolveTemplate(request.auth.key ?? "", envMap, misses);
      const value = resolveTemplate(request.auth.value ?? "", envMap, misses);
      if (!key) return;
      if (request.auth.addTo === "query") {
        queryParams.push({ id: `auth-${key}`, key, value, enabled: true });
        return;
      }
      headers[key] = value;
      return;
    }
    case "oauth2": {
      const cached = request.auth.oauth2?.cachedToken;
      if (!cached) return;
      if (cached.expiresAt !== null && cached.expiresAt <= Date.now()) return;
      headers.Authorization = `${cached.tokenType} ${cached.accessToken}`;
      return;
    }
    // applyInheritedDefaults has already turned "inherit" into whatever the
    // ancestor chain resolved to (or an explicit "none"), so by the time auth
    // is applied there is nothing left to inherit.
    case "inherit":
    case "none":
      return;
  }
}

/**
 * `ancestors` is required rather than optional on purpose: this is the one
 * function every send, snippet preview and auth preview goes through, and an
 * optional parameter is exactly how a call site quietly ends up resolving a
 * request without the collection headers it will really be sent with. Pass
 * NO_ANCESTORS for a request that genuinely has none.
 */
export function buildResolvedRequestArtifacts(
  rawRequest: ApiRequest,
  environment: Environment | null | undefined,
  ancestors: RequestAncestors,
): ResolvedRequestArtifacts {
  const request = applyInheritedDefaults(rawRequest, ancestors);
  const envMap = createEnvironmentMap(
    mergeInheritedVariablesIntoEnvironment(environment ?? null, ancestors),
  );
  const unresolved = new Set<string>();
  const resolvedQueryParams = resolveKvList(request.queryParams, envMap, unresolved);
  const headers = Object.fromEntries(
    resolveKvList(request.headers, envMap, unresolved).map((item) => [item.key, item.value]),
  );

  applyResolvedAuth(request, envMap, headers, resolvedQueryParams, unresolved);

  const searchParams = new URLSearchParams();
  resolvedQueryParams.forEach((item) => searchParams.append(item.key, item.value));
  // Normalize after substitution, not before — "{{BASE_URL}}/todos" only has
  // a scheme once BASE_URL has been filled in.
  const baseUrl = normalizeRequestUrl(resolveTemplate(request.url.trim(), envMap, unresolved));
  const url = searchParams.size
    ? `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}${searchParams.toString()}`
    : baseUrl;

  const resolvedRequest: ApiRequest = {
    ...request,
    url,
    headers: Object.entries(headers).map(([key, value], index) => ({
      id: `resolved-header-${index}`,
      key,
      value,
      enabled: true,
    })),
    queryParams: resolvedQueryParams,
    bodyDrafts: resolveRequestDrafts(request, envMap, unresolved),
  };

  const serializedBody = serializeRequestBody(resolvedRequest);
  if (
    serializedBody.contentType &&
    !Object.keys(headers).some((key) => key.toLowerCase() === "content-type")
  ) {
    headers["Content-Type"] = serializedBody.contentType;
  }

  if (request.bodyType === "form-data") {
    Object.keys(headers).forEach((key) => {
      if (
        key.toLowerCase() === "content-type" &&
        headers[key].toLowerCase().includes("multipart/form-data")
      ) {
        delete headers[key];
      }
    });
  }

  return {
    envMap,
    url,
    resolvedQueryParams,
    resolvedHeaders: headers,
    resolvedRequest,
    serializedBody,
    unresolvedVariables: [...unresolved],
  };
}

export interface PreRequestScriptOutcome {
  resolved: ResolvedRequestArtifacts;
  scriptHeaderPatch?: Record<string, string>;
  scriptEnvironmentPatch?: Record<string, string>;
  scriptError?: string;
}

/**
 * Runs a request's pre-request script (if enabled) and, on success, re-resolves
 * with any environment patch it returned — the same two-pass shape executor.ts
 * and graphql-introspection.ts both need, factored out so a fix to one (e.g.
 * surfacing scriptError) can't silently drift out of sync with the other.
 * `context` carries the caller's own method/headers/body since executor.ts
 * sends the request's real serialized body while graphql-introspection.ts
 * sends its own fixed introspection query — only the resolution/re-resolution
 * logic is shared, not the request shape itself.
 */
export async function applyPreRequestScript(
  request: ApiRequest,
  environment: Environment | null | undefined,
  resolved: ResolvedRequestArtifacts,
  context: { method: string; headers: Record<string, string>; body: string | null },
  ancestors: RequestAncestors,
): Promise<PreRequestScriptOutcome> {
  if (!request.preRequestScript.enabled || !request.preRequestScript.source.trim()) {
    return { resolved };
  }

  const { runPreRequestScript } = await import("@/services/scripting");
  const scriptResult = await runPreRequestScript(request.preRequestScript.source, {
    method: context.method,
    url: resolved.url,
    headers: context.headers,
    body: context.body,
    environment: Object.fromEntries(resolved.envMap),
  });

  if (scriptResult.error) {
    return { resolved, scriptError: scriptResult.error };
  }

  let nextResolved = resolved;
  let scriptEnvironmentPatch: Record<string, string> | undefined;
  if (scriptResult.environment && Object.keys(scriptResult.environment).length) {
    scriptEnvironmentPatch = scriptResult.environment;
    const updates = Object.entries(scriptResult.environment).map(([key, value]) => ({
      key,
      value,
    }));
    const patchedEnvironment = environment
      ? { ...environment, variables: mergeEnvironmentVariables(environment.variables, updates) }
      : environment;
    nextResolved = buildResolvedRequestArtifacts(request, patchedEnvironment, ancestors);
  }

  return {
    resolved: nextResolved,
    scriptHeaderPatch: scriptResult.headers,
    scriptEnvironmentPatch,
  };
}
