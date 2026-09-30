import {
  createDefaultRequestDefaults,
  createDefaultAuth,
  createDefaultBodyDrafts,
  createEmptyFormDataRow,
  normalizeApiRequest,
  uid,
  type ApiRequest,
  type Folder,
  type HttpMethod,
  type KV,
  type RequestAuth,
  type RequestDefaults,
  type RequestBodyType,
} from "@/services/db";

// OpenAPI 3.0/3.1 — only the fields this importer reads. Swagger/OpenAPI 2.0 is a
// different enough shape (body parameter + host/basePath/schemes vs.
// requestBody/components/servers) that it isn't handled here — see the shared
// flow-audit artifact's roadmap for the explicit scope note.
// https://spec.openapis.org/oas/v3.1.0

type OpenApiMethod = "get" | "put" | "post" | "delete" | "options" | "head" | "patch";
const OPENAPI_METHOD_KEYS: OpenApiMethod[] = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
];

type JsonSchemaLike = Record<string, unknown>;

interface OpenApiParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  schema?: JsonSchemaLike;
  example?: unknown;
  $ref?: string;
}

interface OpenApiMediaType {
  schema?: JsonSchemaLike;
  example?: unknown;
}

interface OpenApiRequestBody {
  content?: Record<string, OpenApiMediaType>;
  $ref?: string;
}

type OpenApiSecurityRequirement = Record<string, string[]>;

interface OpenApiSecurityScheme {
  type?: string; // "apiKey" | "http" | "oauth2" | "openIdConnect" | "mutualTLS"
  scheme?: string; // "bearer" | "basic" | ...
  in?: "header" | "query" | "cookie";
  name?: string;
  $ref?: string;
}

interface OpenApiOperation {
  summary?: string;
  operationId?: string;
  tags?: string[];
  parameters?: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
  security?: OpenApiSecurityRequirement[];
}

type OpenApiPathItem = { parameters?: OpenApiParameter[]; $ref?: string } & Partial<
  Record<OpenApiMethod | "trace", OpenApiOperation>
>;

interface OpenApiDocument {
  openapi?: string;
  info?: { title?: string };
  servers?: {
    url?: string;
    variables?: Record<string, { default?: unknown }>;
  }[];
  paths?: Record<string, OpenApiPathItem>;
  components?: {
    schemas?: Record<string, JsonSchemaLike>;
    securitySchemes?: Record<string, OpenApiSecurityScheme>;
  };
  security?: OpenApiSecurityRequirement[];
}

export interface OpenApiImportResult {
  collectionName: string;
  folders: Folder[];
  requests: ApiRequest[];
  warnings: string[];
  /** `baseUrl` from the server block, plus any path parameter the spec gives
   * an example for, so a fresh import sends something real. */
  collectionDefaults: RequestDefaults;
}

/** JSON first, then YAML — the two forms a spec file comes in. undefined when
 * it's neither. */
export async function parseSpecText(text: string): Promise<unknown> {
  try {
    return JSON.parse(text);
  } catch {
    try {
      const yaml = await import("js-yaml");
      return yaml.load(text);
    } catch {
      return undefined;
    }
  }
}

/** Why a file that isn't an OpenAPI 3 document was turned away — a Swagger 2.0
 * file is a common, fixable case and deserves better than "unrecognized". */
export function describeRejectedSpec(raw: unknown): string {
  if (raw === undefined || raw === null || typeof raw !== "object") {
    return "Couldn't read this file as JSON or YAML.";
  }
  if ((raw as { swagger?: unknown }).swagger !== undefined) {
    return "This is a Swagger 2.0 document, and reqlo imports OpenAPI 3.x. Convert it first — Swagger Editor's Edit → Convert to OpenAPI 3, or the swagger2openapi tool — then import the result.";
  }
  return "Not a recognized OpenAPI 3.0/3.1 document.";
}

export function looksLikeOpenApiDocument(raw: unknown): raw is OpenApiDocument {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  const version = typeof o.openapi === "string" ? o.openapi : "";
  return version.startsWith("3.") && !!o.paths && typeof o.paths === "object";
}

export function parseOpenApiDocument(
  raw: OpenApiDocument,
  workspaceId: string,
): OpenApiImportResult {
  const doc = raw;
  const warnings: string[] = [];
  let externalRefWarned = false;

  function resolveRef<T>(node: unknown, depth = 0): T | undefined {
    if (depth > 20 || !node || typeof node !== "object") return node as T | undefined;
    const ref = (node as { $ref?: unknown }).$ref;
    if (typeof ref !== "string") return node as T;
    if (!ref.startsWith("#/")) {
      if (!externalRefWarned) {
        warnings.push(
          "This spec references external $ref files/URLs — those aren't resolved, so affected fields were left empty.",
        );
        externalRefWarned = true;
      }
      return undefined;
    }
    const segments = ref
      .slice(2)
      .split("/")
      .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
    let current: unknown = doc;
    for (const segment of segments) {
      if (!current || typeof current !== "object") return undefined;
      current = (current as Record<string, unknown>)[segment];
    }
    return resolveRef<T>(current, depth + 1);
  }

  function schemaToExample(schemaLike: unknown, depth = 0): unknown {
    if (depth > 6) return null;
    const schema = resolveRef<JsonSchemaLike>(schemaLike);
    if (!schema) return null;
    if ("example" in schema) return schema.example;
    if ("default" in schema) return schema.default;
    if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];

    const composed = (schema.allOf ?? schema.oneOf ?? schema.anyOf) as unknown[] | undefined;
    if (Array.isArray(composed) && composed.length) return schemaToExample(composed[0], depth + 1);

    const type = schema.type as string | undefined;
    if (type === "object" || schema.properties) {
      const properties = (schema.properties ?? {}) as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(properties))
        out[key] = schemaToExample(value, depth + 1);
      return out;
    }
    if (type === "array") {
      if (!schema.items) return [];
      const item = schemaToExample(schema.items, depth + 1);
      return item === null ? [] : [item];
    }
    if (type === "integer" || type === "number") return 0;
    if (type === "boolean") return false;
    if (type === "string") return "";
    return null;
  }

  function paramValue(p: OpenApiParameter): string {
    if (p.example !== undefined) return stringifyValue(p.example);
    if (p.schema) return stringifyValue(schemaToExample(p.schema));
    return "";
  }

  function mergeParameters(
    pathParams: OpenApiParameter[],
    opParams: OpenApiParameter[],
  ): OpenApiParameter[] {
    const map = new Map<string, OpenApiParameter>();
    for (const raw of [...pathParams, ...opParams]) {
      const resolved = resolveRef<OpenApiParameter>(raw);
      if (!resolved) continue;
      map.set(`${resolved.in}:${resolved.name}`, resolved);
    }
    return [...map.values()];
  }

  function paramsToQueryAndHeaders(params: OpenApiParameter[]): {
    queryParams: KV[];
    headers: KV[];
  } {
    const queryParams: KV[] = [];
    const headers: KV[] = [];
    for (const p of params) {
      if (p.in !== "query" && p.in !== "header") continue;
      const kv: KV = { id: uid(), key: p.name, value: paramValue(p), enabled: p.required === true };
      if (p.in === "query") queryParams.push(kv);
      else headers.push(kv);
    }
    return { queryParams, headers };
  }

  function convertPathParams(template: string): string {
    return template.replace(/\{([^}]+)\}/g, (_, name: string) => `{{${name}}}`);
  }

  /**
   * The first server, with `{name}` filled from that server's variable
   * defaults. Kept out of every request URL and put in a `baseUrl` variable
   * instead: a relative or missing server used to leave `/v1/users`, which
   * fetch aims at reqlo's own origin, and a templated one left `{{region}}`
   * with nothing defining it. Empty (and warned about) unless it is absolute.
   */
  function resolveServerUrl(): string {
    const server = doc.servers?.[0];
    if (!server?.url) {
      warnings.push(
        "This spec declares no server, so {{baseUrl}} was left empty — set it in your environment or the collection's variables.",
      );
      return "";
    }
    const url = server.url.replace(/\{([^}]+)\}/g, (_, name: string) => {
      const fallback = server.variables?.[name]?.default;
      return fallback === undefined || fallback === null ? `{{${name}}}` : String(fallback);
    });
    if (!/^https?:\/\//i.test(url)) {
      warnings.push(
        `The server "${server.url}" isn't an absolute URL, so {{baseUrl}} was left empty — set it to the full address, e.g. https://host${url.startsWith("/") ? url : `/${url}`}.`,
      );
      return "";
    }
    return url;
  }

  function buildBody(
    requestBody: OpenApiRequestBody | undefined,
    requestName: string,
  ): {
    bodyType: RequestBodyType;
    body: string;
    bodyDrafts: ReturnType<typeof createDefaultBodyDrafts>;
  } {
    const drafts = createDefaultBodyDrafts();
    const resolvedBody = requestBody ? resolveRef<OpenApiRequestBody>(requestBody) : undefined;
    const content = resolvedBody?.content;
    if (!content) return { bodyType: "none", body: "", bodyDrafts: drafts };

    if (content["application/json"]) {
      const media = content["application/json"];
      const example = media.example ?? schemaToExample(media.schema);
      const json = JSON.stringify(example ?? {}, null, 2);
      drafts.json = json;
      return { bodyType: "json", body: json, bodyDrafts: drafts };
    }

    if (content["application/x-www-form-urlencoded"]) {
      const schema = resolveRef<JsonSchemaLike>(
        content["application/x-www-form-urlencoded"].schema,
      );
      const properties = (schema?.properties ?? {}) as Record<string, unknown>;
      drafts.urlEncoded = Object.entries(properties).map(([key, propSchema]) => ({
        id: uid(),
        key,
        value: stringifyValue(schemaToExample(propSchema)),
        enabled: true,
      }));
      return { bodyType: "x-www-form-urlencoded", body: "", bodyDrafts: drafts };
    }

    if (content["multipart/form-data"]) {
      const schema = resolveRef<JsonSchemaLike>(content["multipart/form-data"].schema);
      const properties = (schema?.properties ?? {}) as Record<string, unknown>;
      let skippedFiles = 0;
      drafts.formData = Object.entries(properties).map(([key, propSchema]) => {
        const resolvedProp = resolveRef<JsonSchemaLike>(propSchema);
        const isFile = resolvedProp?.type === "string" && resolvedProp?.format === "binary";
        const empty = createEmptyFormDataRow(isFile ? "file" : "text");
        if (isFile) {
          skippedFiles++;
          return { ...empty, key };
        }
        return { ...empty, key, value: stringifyValue(schemaToExample(propSchema)) };
      });
      if (skippedFiles > 0) {
        warnings.push(
          `"${requestName}": ${skippedFiles} file field(s) need to be attached manually — specs don't include file contents.`,
        );
      }
      return { bodyType: "form-data", body: "", bodyDrafts: drafts };
    }

    const contentTypes = Object.keys(content);
    if (contentTypes.length) {
      warnings.push(
        `"${requestName}": request body content type(s) ${contentTypes.join(", ")} aren't supported yet — left empty.`,
      );
    }
    return { bodyType: "none", body: "", bodyDrafts: drafts };
  }

  function resolveAuth(
    operationSecurity: OpenApiSecurityRequirement[] | undefined,
    requestName: string,
  ): RequestAuth {
    const requirements = operationSecurity ?? doc.security ?? [];
    if (!requirements.length) return createDefaultAuth();
    const schemeName = Object.keys(requirements[0])[0];
    if (!schemeName) return createDefaultAuth();
    const scheme = resolveRef<OpenApiSecurityScheme>(doc.components?.securitySchemes?.[schemeName]);
    if (!scheme) return createDefaultAuth();

    if (scheme.type === "http" && scheme.scheme === "bearer") return { type: "bearer", token: "" };
    if (scheme.type === "http" && scheme.scheme === "basic") {
      return { type: "basic", username: "", password: "" };
    }
    if (scheme.type === "apiKey") {
      return {
        type: "api-key",
        key: scheme.name ?? "",
        value: "",
        addTo: scheme.in === "query" ? "query" : "header",
      };
    }

    warnings.push(
      `"${requestName}": security scheme "${scheme.type ?? schemeName}" isn't supported yet — reset to no auth.`,
    );
    return createDefaultAuth();
  }

  const folders: Folder[] = [];
  const requests: ApiRequest[] = [];
  const pathParamVariables = new Map<string, string>();
  const baseUrl = resolveServerUrl();
  const tagFolderIds = new Map<string, string>();
  const positionCounters = new Map<string | null, number>();

  function nextPosition(key: string | null): number {
    const current = positionCounters.get(key) ?? 0;
    positionCounters.set(key, current + 1);
    return current;
  }

  function folderIdForTag(tag: string | undefined): string | null {
    if (!tag) return null;
    const existing = tagFolderIds.get(tag);
    if (existing) return existing;
    const folder: Folder = {
      id: uid(),
      workspaceId,
      collectionId: "",
      parentFolderId: null,
      name: tag,
      position: tagFolderIds.size,
      defaults: createDefaultRequestDefaults(),
      createdAt: Date.now(),
    };
    folders.push(folder);
    tagFolderIds.set(tag, folder.id);
    return folder.id;
  }

  function buildRequestFromOperation(
    method: HttpMethod,
    path: string,
    operation: OpenApiOperation,
    sharedParams: OpenApiParameter[],
    folderId: string | null,
    position: number,
  ): ApiRequest {
    const name = operation.summary || operation.operationId || `${method} ${path}`;
    const mergedParams = mergeParameters(sharedParams, operation.parameters ?? []);
    const urlPath = convertPathParams(path);
    for (const param of mergedParams) {
      if (param.in !== "path" || pathParamVariables.has(param.name)) continue;
      const value = paramValue(param);
      if (value) pathParamVariables.set(param.name, value);
    }
    const { queryParams, headers } = paramsToQueryAndHeaders(mergedParams);
    const { bodyType, body, bodyDrafts } = buildBody(operation.requestBody, name);
    const auth = resolveAuth(operation.security, name);
    const now = Date.now();

    return normalizeApiRequest({
      id: uid(),
      workspaceId,
      collectionId: "",
      folderId,
      position,
      name,
      method,
      url: `{{baseUrl}}${urlPath}`,
      headers,
      queryParams,
      body,
      bodyType,
      bodyDrafts,
      auth,
      createdAt: now,
      updatedAt: now,
    });
  }

  const paths = doc.paths ?? {};
  for (const [path, pathItemRaw] of Object.entries(paths)) {
    const pathItem = resolveRef<OpenApiPathItem>(pathItemRaw);
    if (!pathItem) continue;
    const sharedParams = pathItem.parameters ?? [];

    for (const methodKey of OPENAPI_METHOD_KEYS) {
      const operation = pathItem[methodKey];
      if (!operation) continue;
      const method = methodKey.toUpperCase() as HttpMethod;
      const folderId = folderIdForTag(operation.tags?.[0]);
      const position = nextPosition(folderId);
      requests.push(
        buildRequestFromOperation(method, path, operation, sharedParams, folderId, position),
      );
    }

    if (pathItem.trace) {
      warnings.push(`"${path}": the TRACE method isn't supported — skipped.`);
    }
  }

  const variables: KV[] = [];
  if (baseUrl) variables.push({ id: uid(), key: "baseUrl", value: baseUrl, enabled: true });
  for (const [key, value] of pathParamVariables) {
    if (key !== "baseUrl") variables.push({ id: uid(), key, value, enabled: true });
  }

  return {
    collectionName: doc.info?.title || "Imported from OpenAPI",
    folders,
    requests,
    warnings,
    collectionDefaults: { ...createDefaultRequestDefaults(), variables },
  };
}

function stringifyValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}
