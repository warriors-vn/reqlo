import { maskPreview } from "@/lib/mask";
import type { ApiRequest, KV } from "@/services/db";

export function extractTemplateTokens(request: ApiRequest | null) {
  if (!request) return [];

  const tokens = new Set<string>();
  const collect = (value?: string) => {
    if (!value) return;
    const matches = value.matchAll(/\{\{\s*([\w.-]+)\s*}}/g);
    for (const match of matches) {
      if (match[1]) tokens.add(match[1]);
    }
  };

  collect(request.url);
  request.headers.forEach((item) => {
    collect(item.key);
    collect(item.value);
  });
  request.queryParams.forEach((item) => {
    collect(item.key);
    collect(item.value);
  });
  collect(request.body);
  collect(request.bodyDrafts.json);
  collect(request.bodyDrafts.raw);
  collect(request.bodyDrafts.xml);
  request.bodyDrafts.urlEncoded.forEach((item) => {
    collect(item.key);
    collect(item.value);
  });
  request.bodyDrafts.formData.forEach((item) => {
    collect(item.key);
    collect(item.value);
  });
  collect(request.bodyDrafts.graphql.query);
  collect(request.bodyDrafts.graphql.variables);
  collect(request.bodyDrafts.graphql.operationName);
  collect(request.auth.username);
  collect(request.auth.password);
  collect(request.auth.token);
  collect(request.auth.key);
  collect(request.auth.value);

  return [...tokens].sort((left, right) => left.localeCompare(right));
}

export function formatResolvedAuth(
  request: ApiRequest,
  headers: Record<string, string>,
  queryParams: Array<{ key: string; value: string }>,
) {
  const authorization = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === "authorization",
  );

  if (authorization) {
    return `${authorization[0]}: ${maskPreview(authorization[1])}`;
  }

  if (request.auth.type === "api-key") {
    const key = request.auth.key ?? "";
    const queryMatch = queryParams.find((item) => item.key === key);
    if (queryMatch) return `${queryMatch.key}=${maskPreview(queryMatch.value)}`;
    if (key && headers[key] !== undefined) return `${key}: ${maskPreview(headers[key])}`;
  }

  return null;
}

/** Replaces any literal occurrence of a secret variable's value with its masked form. */
export function redactSecretValues(text: string, variables: KV[]) {
  let out = text;
  for (const variable of variables) {
    if (!variable.secret || !variable.value) continue;
    out = out.split(variable.value).join(maskPreview(variable.value));
  }
  return out;
}
