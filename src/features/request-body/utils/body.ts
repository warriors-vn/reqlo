import {
  createDefaultBodyDrafts,
  createEmptyFormDataRow,
  createEmptyKV,
  type ApiRequest,
  type FormDataRow,
  type KV,
  type RequestBodyDrafts,
  type RequestBodyType,
  type StoredFileBlob,
} from "@/services/db";
import type { BodyEditorValidation, SerializedRequestBody } from "@/features/request-body/types";

const CONTENT_TYPE_BY_BODY_TYPE: Partial<Record<RequestBodyType, string>> = {
  json: "application/json",
  raw: "text/plain",
  xml: "application/xml",
  "x-www-form-urlencoded": "application/x-www-form-urlencoded",
  graphql: "application/json",
};

export function getDraftText(bodyType: RequestBodyType, drafts: RequestBodyDrafts): string {
  switch (bodyType) {
    case "json":
      return drafts.json;
    case "raw":
      return drafts.raw;
    case "xml":
      return drafts.xml;
    case "graphql":
      return buildGraphqlPayload(drafts).bodyText;
    case "none":
    case "form-data":
    case "x-www-form-urlencoded":
    case "binary":
      return "";
  }
}

export function resolveRequestBody(request: ApiRequest): string {
  switch (request.bodyType) {
    case "json":
      return request.bodyDrafts.json;
    case "raw":
      return request.bodyDrafts.raw;
    case "xml":
      return request.bodyDrafts.xml;
    case "graphql":
      return buildGraphqlPayload(request.bodyDrafts).bodyText;
    default:
      return request.body ?? "";
  }
}

export function hasBodyContent(request: ApiRequest): boolean {
  const { bodyType, bodyDrafts } = request;
  switch (bodyType) {
    case "none":
      return false;
    case "json":
      return !!bodyDrafts.json.trim();
    case "raw":
      return !!bodyDrafts.raw.trim();
    case "xml":
      return !!bodyDrafts.xml.trim();
    case "form-data":
      return bodyDrafts.formData.some(
        (row) =>
          row.enabled &&
          row.key.trim() &&
          (row.kind === "text" ? row.value.length > 0 : row.files.length > 0),
      );
    case "x-www-form-urlencoded":
      return bodyDrafts.urlEncoded.some((row) => row.enabled && row.key.trim());
    case "binary":
      return !!bodyDrafts.binary.file;
    case "graphql":
      return !!bodyDrafts.graphql.query.trim();
  }
}

export function getAutoContentType(bodyType: RequestBodyType): string | null {
  return CONTENT_TYPE_BY_BODY_TYPE[bodyType] ?? null;
}

export function applyBodyTypeDefaults(
  bodyType: RequestBodyType,
  drafts: RequestBodyDrafts,
): RequestBodyDrafts {
  const next = { ...createDefaultBodyDrafts(), ...drafts };
  if (bodyType === "form-data" && next.formData.length === 0)
    next.formData = [createEmptyFormDataRow("text")];
  if (bodyType === "x-www-form-urlencoded" && next.urlEncoded.length === 0)
    next.urlEncoded = [createEmptyKV()];
  return next;
}

export function serializeRequestBody(request: ApiRequest): SerializedRequestBody {
  const headers: Record<string, string> = {};

  switch (request.bodyType) {
    case "none":
      return { body: null, headers, contentType: null };
    case "json":
      return { body: request.bodyDrafts.json, headers, contentType: getAutoContentType("json") };
    case "raw":
      return { body: request.bodyDrafts.raw, headers, contentType: getAutoContentType("raw") };
    case "xml":
      return { body: request.bodyDrafts.xml, headers, contentType: getAutoContentType("xml") };
    case "x-www-form-urlencoded": {
      const params = new URLSearchParams();
      request.bodyDrafts.urlEncoded.forEach((row) => {
        if (!row.enabled || !row.key.trim()) return;
        params.append(row.key, row.value);
      });
      return {
        body: params.toString(),
        headers,
        contentType: getAutoContentType("x-www-form-urlencoded"),
      };
    }
    case "form-data": {
      const formData = new FormData();
      request.bodyDrafts.formData.forEach((row) => {
        if (!row.enabled || !row.key.trim()) return;
        if (row.kind === "file") {
          row.files.forEach((file) => {
            if (!file.blob) return;
            const blob = row.contentType
              ? new File([file.blob], file.name, {
                  type: row.contentType,
                  lastModified: file.lastModified,
                })
              : new File([file.blob], file.name, {
                  type: file.type,
                  lastModified: file.lastModified,
                });
            formData.append(row.key, blob, file.name);
          });
          return;
        }
        formData.append(row.key, row.value);
      });
      return { body: formData, headers, contentType: null };
    }
    case "binary": {
      const file = request.bodyDrafts.binary.file;
      if (!file?.blob) return { body: null, headers, contentType: null };
      return {
        body: file.blob,
        headers,
        contentType: file.type || "application/octet-stream",
      };
    }
    case "graphql": {
      const payload = buildGraphqlPayload(request.bodyDrafts);
      return { body: payload.bodyText, headers, contentType: getAutoContentType("graphql") };
    }
  }
}

export function buildGraphqlPayload(drafts: RequestBodyDrafts): {
  bodyText: string;
  variablesObject: unknown;
} {
  let variablesObject: unknown = {};
  const rawVariables = drafts.graphql.variables.trim();
  if (rawVariables) {
    try {
      variablesObject = JSON.parse(rawVariables);
    } catch {
      variablesObject = rawVariables;
    }
  }
  return {
    variablesObject,
    bodyText: JSON.stringify(
      {
        query: drafts.graphql.query,
        variables: variablesObject,
        operationName: drafts.graphql.operationName || undefined,
      },
      null,
      2,
    ),
  };
}

export function inferBodyTypeFromHeaders(headers: KV[]): RequestBodyType | null {
  const contentType =
    headers
      .find((header) => header.enabled && header.key.toLowerCase() === "content-type")
      ?.value.toLowerCase() ?? "";
  if (!contentType) return null;
  if (contentType.includes("application/json")) return "json";
  if (contentType.includes("application/graphql") || contentType.includes("graphql"))
    return "graphql";
  if (contentType.includes("application/xml") || contentType.includes("text/xml")) return "xml";
  if (contentType.includes("multipart/form-data")) return "form-data";
  if (contentType.includes("application/x-www-form-urlencoded")) return "x-www-form-urlencoded";
  if (contentType.includes("text/plain")) return "raw";
  return null;
}

export function inferHeaderPatch(request: ApiRequest): KV[] {
  const autoContentType = getAutoContentType(request.bodyType);
  const nextHeaders = request.headers.map((header) => ({ ...header }));
  const contentTypeIndex = nextHeaders.findIndex(
    (header) => header.key.toLowerCase() === "content-type",
  );

  if (request.bodyType === "form-data") {
    if (
      contentTypeIndex >= 0 &&
      nextHeaders[contentTypeIndex].value.toLowerCase().includes("multipart/form-data")
    ) {
      nextHeaders.splice(contentTypeIndex, 1);
    }
    return nextHeaders;
  }

  if (request.bodyType === "none" || !autoContentType) {
    return nextHeaders;
  }

  if (contentTypeIndex >= 0) {
    nextHeaders[contentTypeIndex] = {
      ...nextHeaders[contentTypeIndex],
      value: autoContentType,
      enabled: nextHeaders[contentTypeIndex].enabled ?? true,
    };
    return nextHeaders;
  }

  return [...nextHeaders, createEmptyKV("Content-Type", autoContentType)];
}

export function updateDraftValue(
  drafts: RequestBodyDrafts,
  bodyType: RequestBodyType,
  value: string,
): RequestBodyDrafts {
  switch (bodyType) {
    case "json":
      return { ...drafts, json: value };
    case "raw":
      return { ...drafts, raw: value };
    case "xml":
      return { ...drafts, xml: value };
    case "graphql":
      return { ...drafts, graphql: { ...drafts.graphql, query: value } };
    default:
      return drafts;
  }
}

export function validateBody(
  bodyType: RequestBodyType,
  drafts: RequestBodyDrafts,
): BodyEditorValidation | null {
  if (bodyType === "json" && drafts.json.trim()) {
    try {
      JSON.parse(drafts.json);
      return { tone: "success", label: "Valid JSON" };
    } catch (error) {
      return {
        tone: "error",
        label: "Invalid JSON",
        detail: error instanceof Error ? error.message : "Unable to parse JSON",
      };
    }
  }

  if (bodyType === "graphql" && drafts.graphql.variables.trim()) {
    try {
      JSON.parse(drafts.graphql.variables);
      return { tone: "default", label: "Variables ready" };
    } catch (error) {
      return {
        tone: "error",
        label: "Variables JSON invalid",
        detail: error instanceof Error ? error.message : "Unable to parse GraphQL variables",
      };
    }
  }

  if (bodyType === "form-data") {
    const missingFile = drafts.formData.some(
      (row) =>
        row.enabled &&
        row.kind === "file" &&
        row.key.trim() &&
        row.files.length > 0 &&
        row.files.some((file) => !file.blob),
    );
    if (missingFile) {
      return {
        tone: "error",
        label: "Some files need to be re-attached",
        detail: "One or more file rows only have metadata available.",
      };
    }
  }

  return null;
}

export async function filesToStoredBlobs(files: FileList | File[]): Promise<StoredFileBlob[]> {
  const list = Array.from(files);
  return Promise.all(
    list.map(async (file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified,
      blob: file,
    })),
  );
}

export function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const next = items.slice();
  const [item] = next.splice(fromIndex, 1);
  if (!item) return items;
  next.splice(toIndex, 0, item);
  return next;
}

export function formatJson(input: string): string {
  try {
    return JSON.stringify(JSON.parse(input), null, 2);
  } catch {
    return input;
  }
}

export function readableFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function ensureNonEmptyFormRows(rows: FormDataRow[]): FormDataRow[] {
  return rows.length ? rows : [createEmptyFormDataRow("text")];
}

export function ensureNonEmptyUrlRows(rows: KV[]): KV[] {
  return rows.length ? rows : [createEmptyKV()];
}
