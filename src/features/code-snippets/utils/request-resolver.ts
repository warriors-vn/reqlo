import { serializeRequestBody } from "@/features/request-body/utils/body";
import type { SerializedRequestBody } from "@/features/request-body/types";
import type { ApiRequest, Environment, KV, RequestBodyDrafts } from "@/services/db";

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
