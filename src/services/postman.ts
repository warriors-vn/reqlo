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
  type RequestDefaults,
} from "@/services/db";
import { looksLikeJson } from "@/services/import-shared";

// Postman Collection Format v2.1 — only the fields this importer reads.
// https://schema.postman.com/collection/json/v2.1.0/draft-07/collection.json

export interface PostmanKV {
  key: string;
  value?: string;
  disabled?: boolean;
}

export interface PostmanUrl {
  raw?: string;
  protocol?: string;
  host?: string[] | string;
  path?: string[] | string;
  query?: PostmanKV[];
}

interface PostmanFormDataEntry extends PostmanKV {
  type?: "text" | "file";
}

export interface PostmanBody {
  mode?: "raw" | "urlencoded" | "formdata" | "file" | "graphql";
  raw?: string;
  urlencoded?: PostmanKV[];
  formdata?: PostmanFormDataEntry[];
  graphql?: { query?: string; variables?: string };
  options?: { raw?: { language?: string } };
}

export interface PostmanAuthField {
  key: string;
  value?: string;
}

export interface PostmanAuth {
  type?: string;
  basic?: PostmanAuthField[];
  bearer?: PostmanAuthField[];
  apikey?: PostmanAuthField[];
}

export interface PostmanRequest {
  method?: string;
  url?: PostmanUrl | string;
  header?: PostmanKV[];
  body?: PostmanBody;
  auth?: PostmanAuth;
}

export interface PostmanItem {
  name?: string;
  item?: PostmanItem[];
  request?: PostmanRequest;
  /** Postman supports auth on a folder, which maps to reqlo's folder defaults. */
  auth?: PostmanAuth;
}

export interface PostmanCollection {
  info?: { name?: string; schema?: string };
  item?: PostmanItem[];
  /** Collection-level auth, which maps to reqlo's collection defaults. */
  auth?: PostmanAuth;
}

export interface PostmanImportResult {
  collectionName: string;
  folders: Folder[];
  requests: ApiRequest[];
  warnings: string[];
  /** Auth declared on the collection itself, for the caller to store as the
   * new collection's defaults — the counterpart of the folder auth already
   * carried on each Folder. */
  collectionDefaults: RequestDefaults;
}

export function looksLikePostmanCollection(raw: unknown): raw is PostmanCollection {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  const info = o.info as Record<string, unknown> | undefined;
  const schema = typeof info?.schema === "string" ? info.schema : "";
  return Array.isArray(o.item) && schema.includes("v2");
}

export function parsePostmanCollection(
  raw: PostmanCollection,
  workspaceId: string,
): PostmanImportResult {
  const folders: Folder[] = [];
  const requests: ApiRequest[] = [];
  const warnings: string[] = [];
  const now = Date.now();

  function walk(items: PostmanItem[], parentFolderId: string | null) {
    items.forEach((item, index) => {
      if (item.item) {
        // An item with an `item` array (even empty) is a folder, per the v2.1 schema.
        const folder: Folder = {
          id: uid(),
          workspaceId,
          collectionId: "",
          parentFolderId,
          name: item.name || "Untitled folder",
          position: index,
          defaults: {
            ...createDefaultRequestDefaults(),
            auth: convertAuth(item.auth, warnings, item.name),
          },
          createdAt: now,
        };
        folders.push(folder);
        walk(item.item, folder.id);
        return;
      }
      if (item.request) {
        requests.push(convertRequest(item.name, item.request, parentFolderId, index, warnings));
      }
    });
  }

  walk(raw.item ?? [], null);

  return {
    collectionName: raw.info?.name || "Imported from Postman",
    folders,
    requests,
    warnings,
    collectionDefaults: {
      ...createDefaultRequestDefaults(),
      auth: convertAuth(raw.auth, warnings, raw.info?.name),
    },
  };
}

function convertRequest(
  name: string | undefined,
  request: PostmanRequest,
  folderId: string | null,
  position: number,
  warnings: string[],
): ApiRequest {
  const now = Date.now();
  const method = (request.method || "GET").toUpperCase() as HttpMethod;
  const { url, queryParams } = convertUrl(request.url);
  const headers = (request.header ?? [])
    .filter((h) => h.key)
    .map(
      (h) => ({ id: uid(), key: h.key, value: h.value ?? "", enabled: !h.disabled }) satisfies KV,
    );

  const { bodyType, body, bodyDrafts } = convertBody(request.body, warnings, name);
  const auth = convertAuth(request.auth, warnings, name);

  return normalizeApiRequest({
    id: uid(),
    workspaceId: "",
    collectionId: "",
    folderId,
    position,
    name: name || "Untitled request",
    method,
    url,
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

function convertUrl(url: PostmanUrl | string | undefined): { url: string; queryParams: KV[] } {
  if (!url) return { url: "", queryParams: [] };
  if (typeof url === "string") return { url, queryParams: [] };

  const queryParams = (url.query ?? [])
    .filter((q) => q.key)
    .map(
      (q) => ({ id: uid(), key: q.key, value: q.value ?? "", enabled: !q.disabled }) satisfies KV,
    );

  if (url.raw) return { url: url.raw, queryParams };

  const host = Array.isArray(url.host) ? url.host.join(".") : (url.host ?? "");
  const path = Array.isArray(url.path) ? url.path.join("/") : (url.path ?? "");
  const protocol = url.protocol ? `${url.protocol}://` : "";
  return { url: `${protocol}${host}${path ? `/${path}` : ""}`, queryParams };
}

function convertBody(
  body: PostmanBody | undefined,
  warnings: string[],
  requestName: string | undefined,
): {
  bodyType: RequestBodyType;
  body: string;
  bodyDrafts: ReturnType<typeof createDefaultBodyDrafts>;
} {
  const drafts = createDefaultBodyDrafts();
  if (!body || !body.mode) return { bodyType: "none", body: "", bodyDrafts: drafts };

  switch (body.mode) {
    case "raw": {
      const raw = body.raw ?? "";
      const language = body.options?.raw?.language ?? "";
      const bodyType: RequestBodyType =
        language === "xml" ? "xml" : language === "json" || looksLikeJson(raw) ? "json" : "raw";
      if (bodyType === "json") drafts.json = raw;
      else if (bodyType === "xml") drafts.xml = raw;
      else drafts.raw = raw;
      return { bodyType, body: raw, bodyDrafts: drafts };
    }
    case "urlencoded": {
      drafts.urlEncoded = (body.urlencoded ?? []).map(
        (row) =>
          ({
            id: uid(),
            key: row.key,
            value: row.value ?? "",
            enabled: !row.disabled,
          }) satisfies KV,
      );
      return { bodyType: "x-www-form-urlencoded", body: "", bodyDrafts: drafts };
    }
    case "formdata": {
      let skippedFiles = 0;
      drafts.formData = (body.formdata ?? []).map((row) => {
        if (row.type === "file") skippedFiles++;
        const empty = createEmptyFormDataRow(row.type === "file" ? "file" : "text");
        return {
          ...empty,
          key: row.key,
          value: row.type === "file" ? "" : (row.value ?? ""),
          enabled: !row.disabled,
        };
      });
      if (skippedFiles > 0) {
        warnings.push(
          `"${requestName || "Untitled request"}": ${skippedFiles} form-data file field(s) need to be re-attached — Postman exports don't include the file contents.`,
        );
      }
      return { bodyType: "form-data", body: "", bodyDrafts: drafts };
    }
    case "graphql": {
      drafts.graphql = {
        query: body.graphql?.query ?? "",
        variables: body.graphql?.variables ?? "{\n  \n}",
        operationName: "",
      };
      return { bodyType: "graphql", body: "", bodyDrafts: drafts };
    }
    case "file":
      warnings.push(
        `"${requestName || "Untitled request"}": this request has a raw file body — Postman exports don't include the file contents, so it was dropped.`,
      );
      return { bodyType: "none", body: "", bodyDrafts: drafts };
    default:
      return { bodyType: "none", body: "", bodyDrafts: drafts };
  }
}

function convertAuth(
  auth: PostmanAuth | undefined,
  warnings: string[],
  requestName: string | undefined,
): RequestAuth {
  if (!auth || !auth.type || auth.type === "noauth") return createDefaultAuth();

  const field = (list: PostmanAuthField[] | undefined, key: string) =>
    list?.find((f) => f.key === key)?.value ?? "";

  switch (auth.type) {
    case "basic":
      return {
        type: "basic",
        username: field(auth.basic, "username"),
        password: field(auth.basic, "password"),
      };
    case "bearer":
      return { type: "bearer", token: field(auth.bearer, "token") };
    case "apikey":
      return {
        type: "api-key",
        key: field(auth.apikey, "key"),
        value: field(auth.apikey, "value"),
        addTo: field(auth.apikey, "in") === "query" ? "query" : "header",
      };
    default:
      warnings.push(
        `"${requestName || "Untitled request"}": auth type "${auth.type}" isn't supported yet — reset to no auth.`,
      );
      return createDefaultAuth();
  }
}
