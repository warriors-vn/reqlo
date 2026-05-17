import { serializeRequestBody } from "@/features/request-body/utils/body";
import type { ApiRequest, Environment } from "@/services/db";
import type { ExecutionResult } from "@/components/ResponseViewer";

export async function executeRequest(
  req: ApiRequest,
  environment?: Environment | null,
): Promise<ExecutionResult> {
  const started = performance.now();
  try {
    const envMap = new Map(
      (environment?.variables ?? [])
        .filter((item) => item.enabled && item.key)
        .map((item) => [item.key, item.value]),
    );
    let url = resolveTemplate(req.url.trim(), envMap);
    const enabledParams = req.queryParams.filter((p) => p.enabled && p.key);
    if (enabledParams.length) {
      const sp = new URLSearchParams();
      enabledParams.forEach((p) =>
        sp.append(resolveTemplate(p.key, envMap), resolveTemplate(p.value, envMap)),
      );
      url += (url.includes("?") ? "&" : "?") + sp.toString();
    }

    const headers: Record<string, string> = {};
    req.headers
      .filter((h) => h.enabled && h.key)
      .forEach((h) => {
        headers[resolveTemplate(h.key, envMap)] = resolveTemplate(h.value, envMap);
      });

    applyAuth(headers, req, envMap);

    const init: RequestInit = { method: req.method, headers };
    const serializedBody = serializeRequestBody({
      ...req,
      url,
      headers: req.headers.map((header) => ({
        ...header,
        key: resolveTemplate(header.key, envMap),
        value: resolveTemplate(header.value, envMap),
      })),
      bodyDrafts: {
        ...req.bodyDrafts,
        json: resolveTemplate(req.bodyDrafts.json, envMap),
        raw: resolveTemplate(req.bodyDrafts.raw, envMap),
        xml: resolveTemplate(req.bodyDrafts.xml, envMap),
        urlEncoded: req.bodyDrafts.urlEncoded.map((row) => ({
          ...row,
          key: resolveTemplate(row.key, envMap),
          value: resolveTemplate(row.value, envMap),
        })),
        formData: req.bodyDrafts.formData.map((row) => ({
          ...row,
          key: resolveTemplate(row.key, envMap),
          value: resolveTemplate(row.value, envMap),
        })),
        graphql: {
          ...req.bodyDrafts.graphql,
          query: resolveTemplate(req.bodyDrafts.graphql.query, envMap),
          variables: resolveTemplate(req.bodyDrafts.graphql.variables, envMap),
          operationName: resolveTemplate(req.bodyDrafts.graphql.operationName, envMap),
        },
      },
    });

    if (
      serializedBody.contentType &&
      !Object.keys(headers).some((k) => k.toLowerCase() === "content-type")
    ) {
      headers["Content-Type"] = serializedBody.contentType;
    }
    if (req.bodyType === "form-data") {
      Object.keys(headers).forEach((key) => {
        if (
          key.toLowerCase() === "content-type" &&
          headers[key].toLowerCase().includes("multipart/form-data")
        )
          delete headers[key];
      });
    }

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

function resolveTemplate(input: string, envMap: Map<string, string>) {
  return input.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key: string) => envMap.get(key) ?? "");
}

function applyAuth(
  headers: Record<string, string>,
  request: ApiRequest,
  envMap: Map<string, string>,
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
      if (request.auth.addTo === "header" && request.auth.key) {
        headers[request.auth.key] = resolveTemplate(request.auth.value ?? "", envMap);
      }
      return;
    }
    case "none":
      return;
  }
}
