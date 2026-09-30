import {
  blobToBase64,
  createDefaultMock,
  createDefaultWebSocketConfig,
  createDefaultPostResponseScript,
  createDefaultPreRequestScript,
  db,
  type ApiRequest,
  type Collection,
  type Environment,
  type Folder,
  type HistoryEntry,
  type KV,
  type RequestAuth,
  type RequestDefaults,
  type StoredFileBlob,
  type Workspace,
} from "@/services/db";

const SCHEMA_VERSION = 4;

export interface CollectionExport {
  schema: "reqlo.collection";
  version: number;
  exportedAt: number;
  collection: Collection;
  folders?: Folder[];
  requests: ApiRequest[];
}

export interface WorkspaceExport {
  schema: "reqlo.workspace";
  version: number;
  exportedAt: number;
  workspace: Workspace;
  collections: Collection[];
  folders?: Folder[];
  requests: ApiRequest[];
  environments: Environment[];
  history: HistoryEntry[];
}

export async function exportCollection(collection: Collection): Promise<CollectionExport> {
  const [requests, folders] = await Promise.all([
    db.requests
      .where("collectionId")
      .equals(collection.id)
      .toArray()
      .then((items) => items.sort((left, right) => left.position - right.position)),
    db.folders
      .where("collectionId")
      .equals(collection.id)
      .toArray()
      .then((items) => items.sort((left, right) => left.position - right.position)),
  ]);
  return {
    schema: "reqlo.collection",
    version: SCHEMA_VERSION,
    exportedAt: Date.now(),
    collection: sanitizeCollectionForExport(collection),
    folders: folders.map(sanitizeFolderForExport),
    requests: await Promise.all(requests.map((request) => sanitizeRequestForExport(request))),
  };
}

export async function exportWorkspace(workspace: Workspace): Promise<WorkspaceExport> {
  const [collections, folders, requests, environments, history] = await Promise.all([
    db.collections
      .where("workspaceId")
      .equals(workspace.id)
      .toArray()
      .then((items) => items.sort((left, right) => left.position - right.position)),
    db.folders
      .where("workspaceId")
      .equals(workspace.id)
      .toArray()
      .then((items) => items.sort((left, right) => left.position - right.position)),
    db.requests
      .where("workspaceId")
      .equals(workspace.id)
      .toArray()
      .then((items) => items.sort((left, right) => left.position - right.position)),
    db.environments.where("workspaceId").equals(workspace.id).toArray(),
    db.history.where("workspaceId").equals(workspace.id).toArray(),
  ]);
  return {
    schema: "reqlo.workspace",
    version: SCHEMA_VERSION,
    exportedAt: Date.now(),
    workspace: sanitizeWorkspaceForExport(workspace),
    collections: collections.map(sanitizeCollectionForExport),
    folders: folders.map(sanitizeFolderForExport),
    requests: await Promise.all(requests.map((request) => sanitizeRequestForExport(request))),
    environments: environments.map(sanitizeEnvironmentForExport),
    history: await Promise.all(history.map((entry) => sanitizeHistoryForExport(entry))),
  };
}

export function downloadJSON(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickFile(accept = "application/json"): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      resolve(await f.text());
    };
    input.click();
  });
}

export function validateCollectionExport(obj: unknown): obj is CollectionExport {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return (
    o.schema === "reqlo.collection" &&
    typeof o.version === "number" &&
    o.version <= SCHEMA_VERSION &&
    Array.isArray(o.requests) &&
    !!o.collection
  );
}

export function validateWorkspaceExport(obj: unknown): obj is WorkspaceExport {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return (
    o.schema === "reqlo.workspace" &&
    typeof o.version === "number" &&
    o.version <= SCHEMA_VERSION &&
    Array.isArray(o.collections) &&
    Array.isArray(o.requests) &&
    Array.isArray(o.environments) &&
    Array.isArray(o.history) &&
    !!o.workspace
  );
}

export function sanitizeEnvironmentForExport(environment: Environment): Environment {
  return {
    ...environment,
    variables: environment.variables.map((variable) =>
      variable.secret ? { ...variable, value: "" } : variable,
    ),
  };
}

export function sanitizeWorkspaceForExport(workspace: Workspace): Workspace {
  return {
    ...workspace,
    globals: workspace.globals.map((variable) =>
      variable.secret ? { ...variable, value: "" } : variable,
    ),
  };
}

/** Request headers whose value is a credential in itself. */
const CREDENTIAL_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "x-api-key",
  "x-auth-token",
]);

/**
 * A credential typed straight into a field is a secret; one written as
 * `{{token}}` is only a pointer to a variable, which has its own `secret`
 * flag and is handled where variables are exported. Only the first is
 * blanked — the second is exactly how a shared collection is meant to carry
 * auth, and blanking it would break the collection for no gain.
 */
function isLiteralCredential(value: string | undefined): value is string {
  return !!value && !value.includes("{{");
}

const redact = (value: string | undefined) => (isLiteralCredential(value) ? "" : value);

/**
 * Auth as it should leave this machine: literal passwords, tokens, API key
 * values and OAuth client secrets blanked, and the cached OAuth token dropped
 * outright — an access/refresh token pair is a live session, tied to the
 * user who signed in, and has no business in a file meant for someone else.
 * Usernames, key names, client ids and URLs stay: they're configuration.
 */
export function sanitizeAuthForExport(auth: RequestAuth): RequestAuth {
  const next: RequestAuth = { ...auth };
  if ("password" in next) next.password = redact(next.password);
  if ("token" in next) next.token = redact(next.token);
  if ("value" in next) next.value = redact(next.value);
  if (next.oauth2) {
    const { cachedToken: _cachedToken, ...config } = next.oauth2;
    next.oauth2 = { ...config, clientSecret: redact(config.clientSecret) };
  }
  return next;
}

function sanitizeHeadersForExport(headers: KV[]): KV[] {
  return headers.map((header) =>
    CREDENTIAL_HEADERS.has(header.key.trim().toLowerCase()) && isLiteralCredential(header.value)
      ? { ...header, value: "" }
      : header,
  );
}

function countAuthCredentials(auth: RequestAuth): number {
  return (
    [auth.password, auth.token, auth.value, auth.oauth2?.clientSecret].filter(isLiteralCredential)
      .length + (auth.oauth2?.cachedToken ? 1 : 0)
  );
}

/** How many values the sanitizers below will blank across these requests and
 * collection/folder defaults — so an export can say what it left out instead
 * of handing over a file that quietly no longer authenticates. */
export function countCredentialsLeftOut(items: { auth: RequestAuth; headers: KV[] }[]): number {
  return items.reduce(
    (sum, item) =>
      sum +
      countAuthCredentials(item.auth) +
      item.headers.filter(
        (h) => CREDENTIAL_HEADERS.has(h.key.trim().toLowerCase()) && isLiteralCredential(h.value),
      ).length,
    0,
  );
}

/** Blanks what shouldn't leave this machine in a collection/folder's
 * `defaults`: secret variables — the same treatment
 * `sanitizeEnvironmentForExport`/`sanitizeWorkspaceForExport` give environment
 * and global variables — plus literal credentials in its auth and headers. */
export function sanitizeRequestDefaultsForExport(defaults: RequestDefaults): RequestDefaults {
  return {
    ...defaults,
    auth: sanitizeAuthForExport(defaults.auth),
    headers: sanitizeHeadersForExport(defaults.headers),
    variables: defaults.variables.map((variable) =>
      variable.secret ? { ...variable, value: "" } : variable,
    ),
  };
}

/** The credential half of sanitizeRequestForExport, synchronous so the
 * Postman/OpenAPI exporters (which don't embed file blobs) can use it too. */
export function redactRequestCredentials(request: ApiRequest): ApiRequest {
  return {
    ...request,
    auth: sanitizeAuthForExport(request.auth),
    headers: sanitizeHeadersForExport(request.headers),
  };
}

export function sanitizeCollectionForExport(collection: Collection): Collection {
  return { ...collection, defaults: sanitizeRequestDefaultsForExport(collection.defaults) };
}

export function sanitizeFolderForExport(folder: Folder): Folder {
  return { ...folder, defaults: sanitizeRequestDefaultsForExport(folder.defaults) };
}

async function exportStoredFile(file: StoredFileBlob): Promise<StoredFileBlob> {
  const { blob, ...meta } = file;
  if (!blob) return meta;
  return { ...meta, blobData: await blobToBase64(blob) };
}

export async function sanitizeRequestForExport(request: ApiRequest): Promise<ApiRequest> {
  return {
    ...redactRequestCredentials(request),
    bodyDrafts: {
      ...request.bodyDrafts,
      formData: await Promise.all(
        request.bodyDrafts.formData.map(async (row) => ({
          ...row,
          files: await Promise.all(row.files.map(exportStoredFile)),
        })),
      ),
      binary: {
        file: request.bodyDrafts.binary.file
          ? await exportStoredFile(request.bodyDrafts.binary.file)
          : null,
      },
    },
  };
}

/** A response's Set-Cookie is a session the same way a request's Cookie is. */
function redactResponseHeaders(headers: Record<string, string> | undefined) {
  return Object.fromEntries(
    Object.entries(headers ?? {}).map(([name, value]) => [
      name,
      name.toLowerCase() === "set-cookie" ? "" : value,
    ]),
  );
}

/** The credential half of the history sanitizer, synchronous for the HAR
 * exporter: the snapshot's auth and credential headers, and the response's
 * Set-Cookie. */
export function redactHistoryCredentials(history: HistoryEntry): HistoryEntry {
  return {
    ...history,
    responseHeaders: redactResponseHeaders(history.responseHeaders),
    snapshot: {
      ...history.snapshot,
      auth: sanitizeAuthForExport(history.snapshot.auth),
      headers: sanitizeHeadersForExport(history.snapshot.headers),
    },
  };
}

async function sanitizeHistoryForExport(history: HistoryEntry): Promise<HistoryEntry> {
  const sanitizedRequest = await sanitizeRequestForExport({
    id: history.snapshot.requestId ?? history.requestId ?? history.id,
    workspaceId: history.snapshot.workspaceId,
    collectionId: history.snapshot.collectionId,
    folderId: null,
    position: 0,
    name: history.snapshot.requestName,
    method: history.snapshot.method,
    url: history.snapshot.url,
    headers: history.snapshot.headers,
    queryParams: history.snapshot.queryParams,
    body: history.snapshot.body,
    bodyType: history.snapshot.bodyType,
    bodyDrafts: history.snapshot.bodyDrafts,
    // History only records HTTP sends; a WebSocket connection isn't one
    // request/response pair, so there is nothing to snapshot.
    protocol: "http",
    websocket: createDefaultWebSocketConfig(),
    auth: history.snapshot.auth,
    extracts: [],
    assertions: [],
    mock: createDefaultMock(),
    preRequestScript: createDefaultPreRequestScript(),
    postResponseScript: createDefaultPostResponseScript(),
    timeoutMs: 0,
    favorite: false,
    createdAt: history.executedAt,
    updatedAt: history.executedAt,
  });

  return {
    ...history,
    responseHeaders: redactResponseHeaders(history.responseHeaders),
    snapshot: {
      ...sanitizedRequest,
      requestId: sanitizedRequest.id,
      requestName: sanitizedRequest.name,
    },
  };
}
