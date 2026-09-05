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
  type RequestBodyType,
} from "@/services/db";
import { looksLikeJson } from "@/services/import-shared";

// Insomnia v4 export format — a flat `resources` array linked by `parentId`,
// not a nested tree like Postman's `item`. Only the fields this importer
// reads. https://docs.insomnia.rest/insomnia/import-export-data

interface InsomniaKV {
  name?: string;
  value?: string;
  disabled?: boolean;
}

interface InsomniaFormParam extends InsomniaKV {
  type?: "text" | "file";
  fileName?: string;
}

interface InsomniaBody {
  mimeType?: string;
  text?: string;
  params?: InsomniaFormParam[];
  fileName?: string;
}

interface InsomniaAuthentication {
  type?: string;
  disabled?: boolean;
  username?: string;
  password?: string;
  token?: string;
}

interface InsomniaResource {
  _id: string;
  _type: string;
  parentId?: string;
  name?: string;
  metaSortKey?: number;
  method?: string;
  url?: string;
  headers?: InsomniaKV[];
  parameters?: InsomniaKV[];
  body?: InsomniaBody;
  authentication?: InsomniaAuthentication;
}

interface InsomniaExport {
  _type?: string;
  __export_format?: number;
  resources?: InsomniaResource[];
}

export interface InsomniaImportResult {
  collectionName: string;
  folders: Folder[];
  requests: ApiRequest[];
  warnings: string[];
}

export function looksLikeInsomniaExport(raw: unknown): raw is InsomniaExport {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  return o._type === "export" && Array.isArray(o.resources);
}

export function parseInsomniaExport(
  raw: InsomniaExport,
  workspaceId: string,
): InsomniaImportResult {
  const resources = raw.resources ?? [];
  const folders: Folder[] = [];
  const requests: ApiRequest[] = [];
  const warnings: string[] = [];
  const now = Date.now();

  const byId = new Map(resources.map((r) => [r._id, r]));
  const byParent = new Map<string, InsomniaResource[]>();
  for (const resource of resources) {
    if (!resource.parentId) continue;
    const siblings = byParent.get(resource.parentId) ?? [];
    siblings.push(resource);
    byParent.set(resource.parentId, siblings);
  }
  const sortKey = (r: InsomniaResource) => r.metaSortKey ?? 0;

  function walk(parentId: string, folderId: string | null) {
    const children = (byParent.get(parentId) ?? []).slice().sort((a, b) => sortKey(a) - sortKey(b));
    children.forEach((child, index) => {
      if (child._type === "request_group") {
        const folder: Folder = {
          id: uid(),
          workspaceId,
          collectionId: "",
          parentFolderId: folderId,
          name: child.name || "Untitled folder",
          position: index,
          defaults: createDefaultRequestDefaults(),
          createdAt: now,
        };
        folders.push(folder);
        walk(child._id, folder.id);
        return;
      }
      if (child._type === "request") {
        requests.push(convertRequest(child, folderId, index, warnings));
      }
    });
  }

  // A "root" is any parentId referenced by something in this export that
  // itself names either an included workspace, or nothing in the export at
  // all. The latter covers Insomnia's "export just this folder/request"
  // option: the exported item keeps its original parentId even though the
  // workspace it belonged to isn't included — treating that as a root
  // (rather than requiring a `workspace` resource to exist) is what keeps
  // that data from being silently dropped. Anything else is an ordinary
  // nested folder, reached by `walk` from its own ancestor root instead.
  const rootParentIds = Array.from(
    new Set(resources.filter((r) => r.parentId).map((r) => r.parentId!)),
  ).filter((parentId) => {
    const parent = byId.get(parentId);
    return !parent || parent._type === "workspace";
  });
  const namedRoots = rootParentIds
    .map((parentId) => byId.get(parentId))
    .filter((r): r is InsomniaResource => Boolean(r));

  if (rootParentIds.length === 1) {
    walk(rootParentIds[0], null);
  } else if (rootParentIds.length > 1) {
    rootParentIds.forEach((parentId, index) => {
      const named = byId.get(parentId);
      if (!named) {
        // No name to wrap a detached root with — its children land directly
        // at the top level instead of behind an unnamed folder.
        walk(parentId, null);
        return;
      }
      const folder: Folder = {
        id: uid(),
        workspaceId,
        collectionId: "",
        parentFolderId: null,
        name: named.name || "Untitled workspace",
        position: index,
        defaults: createDefaultRequestDefaults(),
        createdAt: now,
      };
      folders.push(folder);
      walk(parentId, folder.id);
    });
    if (namedRoots.length > 1) {
      warnings.push(
        `This export has ${namedRoots.length} workspaces — each was imported as its own top-level folder.`,
      );
    }
  }

  return {
    collectionName:
      rootParentIds.length === 1 && namedRoots.length === 1
        ? namedRoots[0].name || "Imported from Insomnia"
        : "Imported from Insomnia",
    folders,
    requests,
    warnings,
  };
}

function convertRequest(
  resource: InsomniaResource,
  folderId: string | null,
  position: number,
  warnings: string[],
): ApiRequest {
  const now = Date.now();
  const method = (resource.method || "GET").toUpperCase() as HttpMethod;
  const name = resource.name || "Untitled request";

  const headers = (resource.headers ?? [])
    .filter((h) => h.name)
    .map(
      (h) => ({ id: uid(), key: h.name!, value: h.value ?? "", enabled: !h.disabled }) satisfies KV,
    );
  const queryParams = (resource.parameters ?? [])
    .filter((p) => p.name)
    .map(
      (p) => ({ id: uid(), key: p.name!, value: p.value ?? "", enabled: !p.disabled }) satisfies KV,
    );

  const { bodyType, body, bodyDrafts } = convertBody(resource.body, warnings, name);
  const auth = convertAuth(resource.authentication, warnings, name);

  return normalizeApiRequest({
    id: uid(),
    workspaceId: "",
    collectionId: "",
    folderId,
    position,
    name,
    method,
    url: resource.url || "",
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

function convertBody(
  body: InsomniaBody | undefined,
  warnings: string[],
  requestName: string,
): {
  bodyType: RequestBodyType;
  body: string;
  bodyDrafts: ReturnType<typeof createDefaultBodyDrafts>;
} {
  const drafts = createDefaultBodyDrafts();
  const mimeType = body?.mimeType ?? "";
  if (!mimeType) return { bodyType: "none", body: "", bodyDrafts: drafts };

  if (mimeType === "application/x-www-form-urlencoded") {
    drafts.urlEncoded = (body?.params ?? []).map(
      (row) =>
        ({
          id: uid(),
          key: row.name ?? "",
          value: row.value ?? "",
          enabled: !row.disabled,
        }) satisfies KV,
    );
    return { bodyType: "x-www-form-urlencoded", body: "", bodyDrafts: drafts };
  }

  if (mimeType === "multipart/form-data") {
    let skippedFiles = 0;
    drafts.formData = (body?.params ?? []).map((row) => {
      const isFile = row.type === "file";
      if (isFile) skippedFiles++;
      const empty = createEmptyFormDataRow(isFile ? "file" : "text");
      return {
        ...empty,
        key: row.name ?? "",
        value: isFile ? "" : (row.value ?? ""),
        enabled: !row.disabled,
      };
    });
    if (skippedFiles > 0) {
      warnings.push(
        `"${requestName}": ${skippedFiles} form-data file field(s) need to be re-attached — Insomnia exports don't include the file contents.`,
      );
    }
    return { bodyType: "form-data", body: "", bodyDrafts: drafts };
  }

  if (mimeType === "application/graphql") {
    const parsed = parseGraphqlText(body?.text ?? "");
    if (!parsed) {
      warnings.push(`"${requestName}": couldn't parse the GraphQL body — it was left empty.`);
      drafts.graphql = { query: "", variables: "{\n  \n}", operationName: "" };
    } else {
      drafts.graphql = {
        query: parsed.query,
        variables: parsed.variables ?? "{\n  \n}",
        operationName: "",
      };
    }
    return { bodyType: "graphql", body: "", bodyDrafts: drafts };
  }

  if (mimeType === "application/octet-stream" || (!body?.text && body?.fileName)) {
    warnings.push(
      `"${requestName}": this request has a raw file body — Insomnia exports don't include the file contents, so it was dropped.`,
    );
    return { bodyType: "none", body: "", bodyDrafts: drafts };
  }

  const text = body?.text ?? "";
  const bodyType: RequestBodyType =
    mimeType === "application/json" || (mimeType === "text/plain" && looksLikeJson(text))
      ? "json"
      : mimeType === "application/xml" || mimeType === "text/xml"
        ? "xml"
        : "raw";
  if (bodyType === "json") drafts.json = text;
  else if (bodyType === "xml") drafts.xml = text;
  else drafts.raw = text;
  return { bodyType, body: text, bodyDrafts: drafts };
}

function convertAuth(
  auth: InsomniaAuthentication | undefined,
  warnings: string[],
  requestName: string,
): RequestAuth {
  if (!auth || !auth.type || auth.type === "none" || auth.disabled) return createDefaultAuth();

  switch (auth.type) {
    case "basic":
      return { type: "basic", username: auth.username ?? "", password: auth.password ?? "" };
    case "bearer":
      return { type: "bearer", token: auth.token ?? "" };
    default:
      warnings.push(
        `"${requestName}": auth type "${auth.type}" isn't supported yet — reset to no auth.`,
      );
      return createDefaultAuth();
  }
}

/** Insomnia stores a GraphQL body's `text` as a JSON string of
 * `{ query, variables }`, with `variables` itself either an object or an
 * already-stringified JSON string depending on export version. */
function parseGraphqlText(text: string): { query: string; variables?: string } | null {
  try {
    const parsed = JSON.parse(text) as { query?: string; variables?: unknown };
    if (typeof parsed.query !== "string") return null;
    const variables =
      typeof parsed.variables === "string"
        ? parsed.variables
        : parsed.variables !== undefined
          ? JSON.stringify(parsed.variables, null, 2)
          : undefined;
    return { query: parsed.query, variables };
  } catch {
    return null;
  }
}
