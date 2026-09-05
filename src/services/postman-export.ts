// The mirror of postman.ts: reqlo → Postman Collection v2.1.
//
// It deliberately builds the same interfaces the importer reads, so the two
// can't drift into describing different shapes of the same format, and so a
// round trip (import → export → import) is type-checked end to end as well as
// tested.

import {
  type ApiRequest,
  type Collection,
  type Folder,
  type KV,
  type RequestAuth,
} from "@/services/db";
import type {
  PostmanAuth,
  PostmanBody,
  PostmanCollection,
  PostmanItem,
  PostmanKV,
  PostmanRequest,
} from "@/services/postman";
import { inheritedContributions, resolveAncestors } from "@/services/inheritance";

export interface PostmanExportResult {
  collection: PostmanCollection;
  /** What couldn't survive the format, in the same voice the importer uses
   * for its own losses — so a user is told before they rely on the file. */
  warnings: string[];
}

export function buildPostmanCollection(
  collection: Collection,
  folders: Folder[],
  requests: ApiRequest[],
): PostmanExportResult {
  const warnings: string[] = [];
  const scoped = {
    folders: folders.filter((folder) => folder.collectionId === collection.id),
    requests: requests.filter((request) => request.collectionId === collection.id),
  };

  const byPosition = <T extends { position: number; createdAt: number }>(a: T, b: T) =>
    a.position - b.position || a.createdAt - b.createdAt;

  function itemsFor(parentFolderId: string | null): PostmanItem[] {
    const childFolders = scoped.folders
      .filter((folder) => folder.parentFolderId === parentFolderId)
      .sort(byPosition)
      .map(
        (folder): PostmanItem => ({
          name: folder.name,
          // Always an array, even when empty: an item WITHOUT `item` is a
          // request to the importer, so an empty folder must still carry one
          // or it comes back as a nameless request.
          item: itemsFor(folder.id),
          ...authItemFields(folder.defaults.auth),
        }),
      );

    const childRequests = scoped.requests
      .filter((request) => (request.folderId ?? null) === parentFolderId)
      .sort(byPosition)
      .map((request) => requestItem(request, collection, folders, requests, warnings));

    return [...childFolders, ...childRequests];
  }

  return {
    collection: {
      info: {
        name: collection.name,
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
      },
      item: itemsFor(null),
      ...authItemFields(collection.defaults.auth),
    },
    warnings,
  };
}

function requestItem(
  request: ApiRequest,
  collection: Collection,
  folders: Folder[],
  requests: ApiRequest[],
  warnings: string[],
): PostmanItem {
  // Headers and query params are flattened onto each request rather than left
  // to be inherited: Postman v2.1 has collection- and folder-level *auth*, but
  // no equivalent for default headers or params. Flattening keeps the exported
  // request identical to what reqlo sends, at the cost of a re-import seeing
  // repeated headers instead of one inherited row.
  //
  // Built from inheritedContributions rather than applyInheritedDefaults on
  // purpose: the latter resolves a request for *sending*, which drops disabled
  // rows. A disabled row is real content here — Postman represents it with
  // `disabled: true` — so the request's own rows are appended verbatim, and
  // only the ancestor rows it doesn't already name are prepended.
  const ancestors = resolveAncestors(request, [collection], folders);
  const inherited = inheritedContributions(ancestors);
  const ownHeaderKeys = new Set(request.headers.map((h) => h.key.trim().toLowerCase()));
  const ownParamKeys = new Set(request.queryParams.map((p) => p.key.trim()));
  const headers = [
    ...inherited.headers.filter((h) => !ownHeaderKeys.has(h.key.trim().toLowerCase())),
    ...request.headers,
  ];
  const queryParams = [
    ...inherited.queryParams.filter((p) => !ownParamKeys.has(p.key.trim())),
    ...request.queryParams,
  ];

  const inheritedHeaderCount = headers.length - request.headers.length;
  if (inheritedHeaderCount > 0) {
    warnings.push(
      `"${request.name || "Untitled request"}": ${inheritedHeaderCount} inherited header(s) were written onto the request itself — Postman has no collection-level headers.`,
    );
  }
  if (request.preRequestScript.enabled || request.postResponseScript.enabled) {
    warnings.push(
      `"${request.name || "Untitled request"}": its script wasn't exported — reqlo's sandbox API (test/expect/response) isn't Postman's (pm.*), so the script would not run there.`,
    );
  }

  const postmanRequest: PostmanRequest = {
    method: request.method,
    url: buildUrl(request.url, queryParams),
    header: toPostmanKV(headers),
    ...bodyFields(request, warnings),
    // The request's OWN auth, not the resolved one: "inherit" emits nothing,
    // which is exactly how Postman spells "take the parent's auth" — writing
    // the resolved value instead would stamp a copy of the collection token
    // onto every request and lose the inheritance the export just recorded.
    ...authRequestField(request.auth, request.name, warnings),
  };

  return { name: request.name || "Untitled request", request: postmanRequest };
}

/** `raw` plus the structured breakdown: the importer prefers `raw` when both
 * are present, while other tools read the parts, so writing both keeps the
 * file useful in either. */
function buildUrl(rawUrl: string, params: KV[]): PostmanRequest["url"] {
  const raw = rawUrl;
  const query = toPostmanKV(params);

  let parsed: URL | null = null;
  try {
    parsed = new URL(raw);
  } catch {
    parsed = null;
  }
  if (!parsed) return { raw, query };

  return {
    raw,
    protocol: parsed.protocol.replace(":", ""),
    host: parsed.hostname.split("."),
    path: parsed.pathname.split("/").filter(Boolean),
    query,
  };
}

function toPostmanKV(rows: KV[]): PostmanKV[] {
  return rows
    .filter((row) => row.key.trim())
    .map((row) => ({ key: row.key, value: row.value, ...(row.enabled ? {} : { disabled: true }) }));
}

function bodyFields(
  request: ApiRequest,
  warnings: string[],
): { body?: PostmanBody } | Record<string, never> {
  const drafts = request.bodyDrafts;
  switch (request.bodyType) {
    case "none":
      return {};
    case "json":
      return { body: { mode: "raw", raw: drafts.json, options: { raw: { language: "json" } } } };
    case "xml":
      return { body: { mode: "raw", raw: drafts.xml, options: { raw: { language: "xml" } } } };
    case "raw":
      return { body: { mode: "raw", raw: drafts.raw, options: { raw: { language: "text" } } } };
    case "x-www-form-urlencoded":
      return { body: { mode: "urlencoded", urlencoded: toPostmanKV(drafts.urlEncoded) } };
    case "form-data":
      return {
        body: {
          mode: "formdata",
          formdata: drafts.formData
            .filter((row) => row.key.trim())
            .map((row) => ({
              key: row.key,
              // A file row carries no value in either format — Postman
              // exports don't embed file contents either, which is why the
              // importer warns about re-attaching them.
              value: row.kind === "file" ? "" : row.value,
              type: row.kind,
              ...(row.enabled ? {} : { disabled: true }),
            })),
        },
      };
    case "graphql":
      return {
        body: {
          mode: "graphql",
          graphql: { query: drafts.graphql.query, variables: drafts.graphql.variables },
        },
      };
    case "binary":
      if (drafts.binary.file) {
        warnings.push(
          `"${request.name || "Untitled request"}": its binary body was dropped — neither format carries file contents.`,
        );
      }
      return {};
  }
}

/** Collection- and folder-level auth, which Postman does support. */
function authItemFields(auth: RequestAuth): { auth?: PostmanAuth } | Record<string, never> {
  const converted = toPostmanAuth(auth);
  return converted ? { auth: converted } : {};
}

function authRequestField(
  auth: RequestAuth,
  requestName: string,
  warnings: string[],
): { auth?: PostmanAuth } | Record<string, never> {
  if (auth.type === "oauth2") {
    warnings.push(
      `"${requestName || "Untitled request"}": OAuth 2.0 config wasn't exported — its cached token is tied to this machine, so it would be misleading in a shared file.`,
    );
    return {};
  }
  const converted = toPostmanAuth(auth);
  return converted ? { auth: converted } : {};
}

function toPostmanAuth(auth: RequestAuth): PostmanAuth | null {
  switch (auth.type) {
    case "basic":
      return {
        type: "basic",
        basic: [
          { key: "username", value: auth.username ?? "" },
          { key: "password", value: auth.password ?? "" },
        ],
      };
    case "bearer":
      return { type: "bearer", bearer: [{ key: "token", value: auth.token ?? "" }] };
    case "api-key":
      return {
        type: "apikey",
        apikey: [
          { key: "key", value: auth.key ?? "" },
          { key: "value", value: auth.value ?? "" },
          { key: "in", value: auth.addTo === "query" ? "query" : "header" },
        ],
      };
    case "none":
      return { type: "noauth" };
    // "inherit" is Postman's own default for an item with no auth block, and
    // OAuth2 is handled by the caller — emitting nothing is the accurate
    // representation of both.
    case "inherit":
    case "oauth2":
      return null;
  }
}
