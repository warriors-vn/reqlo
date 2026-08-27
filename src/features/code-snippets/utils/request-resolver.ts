import { serializeRequestBody } from "@/features/request-body/utils/body";
import type { SerializedRequestBody } from "@/features/request-body/types";
import {
  mergeEnvironmentVariables,
  type ApiRequest,
  type Environment,
  type KV,
  type RequestBodyDrafts,
} from "@/services/db";

export interface ResolvedRequestArtifacts {
  envMap: Map<string, string>;
  url: string;
  resolvedQueryParams: KV[];
  resolvedHeaders: Record<string, string>;
  resolvedRequest: ApiRequest;
  serializedBody: SerializedRequestBody;
}

export function createEnvironmentMap(environment?: Environment | null) {
  return new Map(
    (environment?.variables ?? [])
      .filter((item) => item.enabled && item.key)
      .map((item) => [item.key, item.value]),
  );
}

export function resolveTemplate(input: string, envMap: Map<string, string>) {
  return input.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key: string) => envMap.get(key) ?? "");
}

export function resolveKvList(list: KV[], envMap: Map<string, string>) {
  return list
    .filter((item) => item.enabled && item.key)
    .map((item) => ({
      ...item,
      key: resolveTemplate(item.key, envMap),
      value: resolveTemplate(item.value, envMap),
    }))
    .filter((item) => item.key.trim());
}

export function resolveRequestDrafts(
  request: ApiRequest,
  envMap: Map<string, string>,
): RequestBodyDrafts {
  return {
    ...request.bodyDrafts,
    json: resolveTemplate(request.bodyDrafts.json, envMap),
    raw: resolveTemplate(request.bodyDrafts.raw, envMap),
    xml: resolveTemplate(request.bodyDrafts.xml, envMap),
    urlEncoded: request.bodyDrafts.urlEncoded.map((row) => ({
      ...row,
      key: resolveTemplate(row.key, envMap),
      value: resolveTemplate(row.value, envMap),
    })),
    formData: request.bodyDrafts.formData.map((row) => ({
      ...row,
      key: resolveTemplate(row.key, envMap),
      value: resolveTemplate(row.value, envMap),
    })),
    graphql: {
      ...request.bodyDrafts.graphql,
      query: resolveTemplate(request.bodyDrafts.graphql.query, envMap),
      variables: resolveTemplate(request.bodyDrafts.graphql.variables, envMap),
      operationName: resolveTemplate(request.bodyDrafts.graphql.operationName, envMap),
    },
  };
}

export function applyResolvedAuth(
  request: ApiRequest,
  envMap: Map<string, string>,
  headers: Record<string, string>,
  queryParams: KV[],
) {
  switch (request.auth.type) {
    case "basic": {
      const username = resolveTemplate(request.auth.username ?? "", envMap);
      const password = resolveTemplate(request.auth.password ?? "", envMap);
      if (username || password) headers.Authorization = `Basic ${btoa(`${username}:${password}`)}`;
      return;
    }
    case "bearer": {
      const token = resolveTemplate(request.auth.token ?? "", envMap);
      if (token) headers.Authorization = `Bearer ${token}`;
      return;
    }
    case "api-key": {
      const key = resolveTemplate(request.auth.key ?? "", envMap);
      const value = resolveTemplate(request.auth.value ?? "", envMap);
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
    case "none":
      return;
  }
}

export function buildResolvedRequestArtifacts(
  request: ApiRequest,
  environment?: Environment | null,
): ResolvedRequestArtifacts {
  const envMap = createEnvironmentMap(environment);
  const resolvedQueryParams = resolveKvList(request.queryParams, envMap);
  const headers = Object.fromEntries(
    resolveKvList(request.headers, envMap).map((item) => [item.key, item.value]),
  );

  applyResolvedAuth(request, envMap, headers, resolvedQueryParams);

  const searchParams = new URLSearchParams();
  resolvedQueryParams.forEach((item) => searchParams.append(item.key, item.value));
  const baseUrl = resolveTemplate(request.url.trim(), envMap);
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
    bodyDrafts: resolveRequestDrafts(request, envMap),
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
    nextResolved = buildResolvedRequestArtifacts(request, patchedEnvironment);
  }

  return {
    resolved: nextResolved,
    scriptHeaderPatch: scriptResult.headers,
    scriptEnvironmentPatch,
  };
}
