import Dexie, { type Table } from "dexie";
import type { ResponseKind } from "@/services/execution";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
export type RequestBodyType =
  | "none"
  | "json"
  | "raw"
  | "xml"
  | "form-data"
  | "x-www-form-urlencoded"
  | "binary"
  | "graphql";

export interface KV {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  /** When true, the value is masked in editable grids and blanked out of workspace exports. */
  secret?: boolean;
}

export interface StoredFileBlob {
  id: string;
  name: string;
  size: number;
  type: string;
  lastModified: number;
  blob?: Blob;
  /** Base64-encoded blob content, present only in exported workspace/collection JSON. Hydrated back into `blob` on import. */
  blobData?: string;
}

export interface FormDataRow {
  id: string;
  key: string;
  enabled: boolean;
  kind: "text" | "file";
  value: string;
  files: StoredFileBlob[];
  contentType?: string;
}

export interface BinaryBodyDraft {
  file: StoredFileBlob | null;
}

export interface GraphqlBodyDraft {
  query: string;
  variables: string;
  operationName: string;
}

export interface RequestBodyDrafts {
  json: string;
  raw: string;
  xml: string;
  formData: FormDataRow[];
  urlEncoded: KV[];
  binary: BinaryBodyDraft;
  graphql: GraphqlBodyDraft;
}

export interface RequestAuth {
  /**
   * "inherit" takes whichever ancestor (folder, then collection) is the
   * nearest one to configure auth — the default for newly created requests.
   * "none" is the opposite and deliberately distinct: an explicit "send this
   * one unauthenticated", which no ancestor can override. Requests that
   * predate collection-level auth were all migrated as "none" so adding a
   * token to a collection never silently changes what they already send.
   */
  type: "inherit" | "none" | "basic" | "bearer" | "api-key" | "oauth2";
  username?: string;
  password?: string;
  token?: string;
  key?: string;
  value?: string;
  addTo?: "header" | "query";
  oauth2?: OAuth2Config;
}

export type OAuth2GrantType = "authorization_code" | "client_credentials";

export interface OAuth2Config {
  grantType: OAuth2GrantType;
  /** Required for authorization_code, unused for client_credentials. */
  authUrl?: string;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  scope?: string;
  cachedToken?: OAuth2CachedToken;
}

export interface OAuth2CachedToken {
  accessToken: string;
  tokenType: string;
  /** Epoch ms, or null when the provider didn't return an expires_in. */
  expiresAt: number | null;
  refreshToken?: string;
  /** Environment the token was fetched under — lets the editor flag a stale cache after switching environments. */
  environmentId: string | null;
  fetchedAt: number;
}

export interface ExtractRule {
  id: string;
  path: string;
  variableName: string;
  enabled: boolean;
}

export type AssertionKind = "status" | "jsonBody";
export type AssertionOperator = "equals" | "exists" | "contains";

export interface AssertionRule {
  id: string;
  enabled: boolean;
  kind: AssertionKind;
  /** Dot/bracket path into the JSON body — only used when kind is "jsonBody". */
  path: string;
  /** Ignored when kind is "status" (status checks are always an equality check). */
  operator: AssertionOperator;
  expected: string;
}

export interface PreRequestScriptConfig {
  enabled: boolean;
  /** JavaScript source, run sandboxed (QuickJS-in-wasm) before the request is sent. */
  source: string;
}

export interface MockConfig {
  enabled: boolean;
  status: number;
  contentType: string;
  body: string;
  /** Artificial latency, in milliseconds, so a mock can simulate a slow endpoint. */
  delayMs: number;
}

export interface Workspace {
  id: string;
  name: string;
  /** Always merged into template resolution, regardless of the active environment. */
  globals: KV[];
  createdAt: number;
  updatedAt: number;
}

/**
 * Auth/headers/params/variables configured once on a collection or folder and
 * inherited by every request underneath it — so a 40-request collection needs
 * its bearer token in one place, not forty. See services/inheritance.ts for
 * the merge rules; `auth.type === "none"` here means "this level contributes
 * no auth", which is what lets a nested folder fall through to its collection.
 */
export interface RequestDefaults {
  auth: RequestAuth;
  headers: KV[];
  queryParams: KV[];
  /** Resolved below the active environment but above workspace globals. */
  variables: KV[];
}

export interface Collection {
  id: string;
  workspaceId: string;
  name: string;
  position: number;
  defaults: RequestDefaults;
  createdAt: number;
}

export interface Folder {
  id: string;
  workspaceId: string;
  collectionId: string;
  parentFolderId: string | null;
  name: string;
  position: number;
  defaults: RequestDefaults;
  createdAt: number;
}

export interface ApiRequest {
  id: string;
  workspaceId: string;
  collectionId: string | null;
  folderId: string | null;
  position: number;
  name: string;
  method: HttpMethod;
  url: string;
  headers: KV[];
  queryParams: KV[];
  body: string;
  bodyType: RequestBodyType;
  bodyDrafts: RequestBodyDrafts;
  auth: RequestAuth;
  extracts: ExtractRule[];
  assertions: AssertionRule[];
  mock: MockConfig;
  preRequestScript: PreRequestScriptConfig;
  /** Milliseconds before Send auto-aborts an in-flight request. 0 = no timeout. */
  timeoutMs: number;
  favorite?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface RequestSnapshot {
  requestId: string | null;
  requestName: string;
  workspaceId: string;
  collectionId: string | null;
  method: HttpMethod;
  url: string;
  headers: KV[];
  queryParams: KV[];
  body: string;
  bodyType: RequestBodyType;
  bodyDrafts: RequestBodyDrafts;
  auth: RequestAuth;
}

export interface HistoryEntry {
  id: string;
  workspaceId: string;
  requestId: string | null;
  requestName: string;
  method: HttpMethod;
  url: string;
  status: number | null;
  ok: boolean;
  durationMs: number;
  sizeBytes: number;
  executedAt: number;
  environmentId: string | null;
  environmentName: string | null;
  favorite: boolean;
  pinned: boolean;
  searchText: string;
  snapshot: RequestSnapshot;
  responseKind: ResponseKind;
  responseContentType: string;
  responseHeaders: Record<string, string>;
  responseBody: string;
  responseBodyTruncated: boolean;
  errorMessage?: string;
  responseExcerpt?: string;
}

export interface Environment {
  id: string;
  workspaceId: string;
  name: string;
  variables: KV[];
  createdAt: number;
}

class ReqloDB extends Dexie {
  workspaces!: Table<Workspace, string>;
  collections!: Table<Collection, string>;
  folders!: Table<Folder, string>;
  requests!: Table<ApiRequest, string>;
  history!: Table<HistoryEntry, string>;
  environments!: Table<Environment, string>;

  constructor() {
    super("reqlo");
    this.version(1).stores({
      workspaces: "id, updatedAt",
      collections: "id, workspaceId, position",
      requests: "id, workspaceId, collectionId, updatedAt",
      history: "id, workspaceId, requestId, executedAt",
    });
    this.version(2).stores({
      workspaces: "id, updatedAt",
      collections: "id, workspaceId, position",
      requests: "id, workspaceId, collectionId, updatedAt",
      history: "id, workspaceId, requestId, executedAt",
      environments: "id, workspaceId",
    });
    this.version(3)
      .stores({
        workspaces: "id, updatedAt",
        collections: "id, workspaceId, position",
        requests: "id, workspaceId, collectionId, updatedAt, method, bodyType, favorite",
        history:
          "id, workspaceId, requestId, executedAt, method, status, favorite, pinned, [workspaceId+executedAt], [workspaceId+method], [workspaceId+status], [workspaceId+pinned], [workspaceId+favorite]",
        environments: "id, workspaceId",
      })
      .upgrade(async (tx) => {
        await tx
          .table<ApiRequest, string>("requests")
          .toCollection()
          .modify((request) => {
            Object.assign(request, normalizeApiRequest(request));
          });
        await tx
          .table<HistoryEntry, string>("history")
          .toCollection()
          .modify((entry) => {
            Object.assign(entry, normalizeHistoryEntry(entry));
          });
      });
    this.version(4)
      .stores({
        workspaces: "id, updatedAt",
        collections: "id, workspaceId, position",
        requests:
          "id, workspaceId, collectionId, position, updatedAt, method, bodyType, favorite, [workspaceId+collectionId+position]",
        history:
          "id, workspaceId, requestId, executedAt, method, status, favorite, pinned, [workspaceId+executedAt], [workspaceId+method], [workspaceId+status], [workspaceId+pinned], [workspaceId+favorite]",
        environments: "id, workspaceId",
      })
      .upgrade(async (tx) => {
        const requests = await tx.table<ApiRequest, string>("requests").toArray();
        const byCollection = new Map<string, ApiRequest[]>();

        requests.forEach((request) => {
          const key = request.collectionId ?? "__unfiled__";
          const items = byCollection.get(key) ?? [];
          items.push(request);
          byCollection.set(key, items);
        });

        await Promise.all(
          [...byCollection.values()].flatMap((items) =>
            items
              .sort((left, right) => left.createdAt - right.createdAt)
              .map((request, index) =>
                tx.table<ApiRequest, string>("requests").update(request.id, { position: index }),
              ),
          ),
        );
      });
    this.version(5)
      .stores({
        workspaces: "id, updatedAt",
        collections: "id, workspaceId, position",
        folders:
          "id, workspaceId, collectionId, parentFolderId, position, [collectionId+parentFolderId+position]",
        requests:
          "id, workspaceId, collectionId, folderId, position, updatedAt, method, bodyType, favorite, [workspaceId+collectionId+position]",
        history:
          "id, workspaceId, requestId, executedAt, method, status, favorite, pinned, [workspaceId+executedAt], [workspaceId+method], [workspaceId+status], [workspaceId+pinned], [workspaceId+favorite]",
        environments: "id, workspaceId",
      })
      .upgrade(async (tx) => {
        await tx
          .table<ApiRequest, string>("requests")
          .toCollection()
          .modify((request) => {
            if (request.folderId === undefined) request.folderId = null;
          });
      });
    this.version(6)
      .stores({
        workspaces: "id, updatedAt",
        collections: "id, workspaceId, position",
        folders:
          "id, workspaceId, collectionId, parentFolderId, position, [collectionId+parentFolderId+position]",
        requests:
          "id, workspaceId, collectionId, folderId, position, updatedAt, method, bodyType, favorite, [workspaceId+collectionId+position]",
        history:
          "id, workspaceId, requestId, executedAt, method, status, favorite, pinned, [workspaceId+executedAt], [workspaceId+method], [workspaceId+status], [workspaceId+pinned], [workspaceId+favorite]",
        environments: "id, workspaceId",
      })
      .upgrade(async (tx) => {
        await tx
          .table<ApiRequest, string>("requests")
          .toCollection()
          .modify((request) => {
            if (request.extracts === undefined) request.extracts = [];
          });
      });
    this.version(7)
      .stores({
        workspaces: "id, updatedAt",
        collections: "id, workspaceId, position",
        folders:
          "id, workspaceId, collectionId, parentFolderId, position, [collectionId+parentFolderId+position]",
        requests:
          "id, workspaceId, collectionId, folderId, position, updatedAt, method, bodyType, favorite, [workspaceId+collectionId+position]",
        history:
          "id, workspaceId, requestId, executedAt, method, status, favorite, pinned, [workspaceId+executedAt], [workspaceId+method], [workspaceId+status], [workspaceId+pinned], [workspaceId+favorite]",
        environments: "id, workspaceId",
      })
      .upgrade(async (tx) => {
        await tx
          .table<ApiRequest, string>("requests")
          .toCollection()
          .modify((request) => {
            if (request.assertions === undefined) request.assertions = [];
          });
      });
    this.version(8)
      .stores({
        workspaces: "id, updatedAt",
        collections: "id, workspaceId, position",
        folders:
          "id, workspaceId, collectionId, parentFolderId, position, [collectionId+parentFolderId+position]",
        requests:
          "id, workspaceId, collectionId, folderId, position, updatedAt, method, bodyType, favorite, [workspaceId+collectionId+position]",
        history:
          "id, workspaceId, requestId, executedAt, method, status, favorite, pinned, [workspaceId+executedAt], [workspaceId+method], [workspaceId+status], [workspaceId+pinned], [workspaceId+favorite]",
        environments: "id, workspaceId",
      })
      .upgrade(async (tx) => {
        await tx
          .table<ApiRequest, string>("requests")
          .toCollection()
          .modify((request) => {
            if (request.mock === undefined) request.mock = createDefaultMock();
          });
      });
    this.version(9)
      .stores({
        workspaces: "id, updatedAt",
        collections: "id, workspaceId, position",
        folders:
          "id, workspaceId, collectionId, parentFolderId, position, [collectionId+parentFolderId+position]",
        requests:
          "id, workspaceId, collectionId, folderId, position, updatedAt, method, bodyType, favorite, [workspaceId+collectionId+position]",
        history:
          "id, workspaceId, requestId, executedAt, method, status, favorite, pinned, [workspaceId+executedAt], [workspaceId+method], [workspaceId+status], [workspaceId+pinned], [workspaceId+favorite]",
        environments: "id, workspaceId",
      })
      .upgrade(async (tx) => {
        await tx
          .table<ApiRequest, string>("requests")
          .toCollection()
          .modify((request) => {
            if (request.preRequestScript === undefined) {
              request.preRequestScript = createDefaultPreRequestScript();
            }
          });
      });
    this.version(10)
      .stores({
        workspaces: "id, updatedAt",
        collections: "id, workspaceId, position",
        folders:
          "id, workspaceId, collectionId, parentFolderId, position, [collectionId+parentFolderId+position]",
        requests:
          "id, workspaceId, collectionId, folderId, position, updatedAt, method, bodyType, favorite, [workspaceId+collectionId+position]",
        history:
          "id, workspaceId, requestId, executedAt, method, status, favorite, pinned, [workspaceId+executedAt], [workspaceId+method], [workspaceId+status], [workspaceId+pinned], [workspaceId+favorite]",
        environments: "id, workspaceId",
      })
      .upgrade(async (tx) => {
        await tx
          .table<ApiRequest, string>("requests")
          .toCollection()
          .modify((request) => {
            if (request.timeoutMs === undefined) {
              request.timeoutMs = 0;
            }
          });
      });
    this.version(11)
      .stores({
        workspaces: "id, updatedAt",
        collections: "id, workspaceId, position",
        folders:
          "id, workspaceId, collectionId, parentFolderId, position, [collectionId+parentFolderId+position]",
        requests:
          "id, workspaceId, collectionId, folderId, position, updatedAt, method, bodyType, favorite, [workspaceId+collectionId+position]",
        history:
          "id, workspaceId, requestId, executedAt, method, status, favorite, pinned, [workspaceId+executedAt], [workspaceId+method], [workspaceId+status], [workspaceId+pinned], [workspaceId+favorite]",
        environments: "id, workspaceId",
      })
      .upgrade(async (tx) => {
        await tx
          .table<Workspace, string>("workspaces")
          .toCollection()
          .modify((workspace) => {
            if (workspace.globals === undefined) {
              workspace.globals = [];
            }
          });
      });
    this.version(12)
      .stores({
        workspaces: "id, updatedAt",
        collections: "id, workspaceId, position",
        folders:
          "id, workspaceId, collectionId, parentFolderId, position, [collectionId+parentFolderId+position]",
        requests:
          "id, workspaceId, collectionId, folderId, position, updatedAt, method, bodyType, favorite, [workspaceId+collectionId+position]",
        history:
          "id, workspaceId, requestId, executedAt, method, status, favorite, pinned, [workspaceId+executedAt], [workspaceId+method], [workspaceId+status], [workspaceId+pinned], [workspaceId+favorite]",
        environments: "id, workspaceId",
      })
      .upgrade(async (tx) => {
        // Collection/folder-level defaults. Existing requests are deliberately
        // left on whatever auth they already had (including "none") rather
        // than migrated to "inherit" — see RequestAuth's comment: a request
        // that sends no auth today must keep sending none after someone adds
        // a token to its collection.
        await tx
          .table<Collection, string>("collections")
          .toCollection()
          .modify((collection) => {
            if (collection.defaults === undefined) {
              collection.defaults = createDefaultRequestDefaults();
            }
          });
        await tx
          .table<Folder, string>("folders")
          .toCollection()
          .modify((folder) => {
            if (folder.defaults === undefined) {
              folder.defaults = createDefaultRequestDefaults();
            }
          });
      });
  }
}

export const db = new ReqloDB();

export function uid(): string {
  // crypto.randomUUID() is only exposed in secure contexts (https, or localhost) —
  // it throws "not a function" when the app is opened over plain http via a LAN IP.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function createDefaultAuth(): RequestAuth {
  return { type: "none" };
}

/** What a newly created request starts on, as opposed to createDefaultAuth's
 * explicit "none" — see RequestAuth's comment for why the two differ. */
export function createInheritedAuth(): RequestAuth {
  return { type: "inherit" };
}

/** A collection/folder that contributes nothing to the requests under it. */
export function createDefaultRequestDefaults(): RequestDefaults {
  return { auth: createDefaultAuth(), headers: [], queryParams: [], variables: [] };
}

/** Fills in `defaults` for a Collection that came from outside the current
 * schema — an older export file, or a parser that predates this field. Rows
 * read from IndexedDB are already backfilled by the version(12) upgrade. */
export function normalizeCollection(collection: Partial<Collection> & { id: string }): Collection {
  return {
    ...collection,
    defaults: normalizeRequestDefaults(collection.defaults),
  } as Collection;
}

/** Folder counterpart to normalizeCollection. */
export function normalizeFolder(folder: Partial<Folder> & { id: string }): Folder {
  return {
    ...folder,
    defaults: normalizeRequestDefaults(folder.defaults),
  } as Folder;
}

/** A deep-enough copy for duplicating a collection/folder — every KV row gets
 * a fresh identity so editing the copy can't write through to the original. */
export function cloneRequestDefaults(defaults: RequestDefaults): RequestDefaults {
  return {
    auth: { ...defaults.auth },
    headers: defaults.headers.map((item) => ({ ...item, id: uid() })),
    queryParams: defaults.queryParams.map((item) => ({ ...item, id: uid() })),
    variables: defaults.variables.map((item) => ({ ...item, id: uid() })),
  };
}

export function normalizeRequestDefaults(defaults?: Partial<RequestDefaults>): RequestDefaults {
  return {
    auth: defaults?.auth ?? createDefaultAuth(),
    headers: cloneKV(defaults?.headers ?? []),
    queryParams: cloneKV(defaults?.queryParams ?? []),
    variables: cloneKV(defaults?.variables ?? []),
  };
}

export function createDefaultOAuth2Config(): OAuth2Config {
  return { grantType: "authorization_code", authUrl: "", tokenUrl: "", clientId: "", scope: "" };
}

export function createEmptyKV(key = "", value = ""): KV {
  return { id: uid(), key, value, enabled: true };
}

export function createEmptyExtractRule(): ExtractRule {
  return { id: uid(), path: "", variableName: "", enabled: true };
}

export function createEmptyAssertionRule(): AssertionRule {
  return {
    id: uid(),
    enabled: true,
    kind: "status",
    path: "",
    operator: "equals",
    expected: "200",
  };
}

export function createDefaultMock(): MockConfig {
  return {
    enabled: false,
    status: 200,
    contentType: "application/json",
    body: "{\n  \n}",
    delayMs: 0,
  };
}

export function createDefaultPreRequestScript(): PreRequestScriptConfig {
  return { enabled: false, source: "" };
}

export function createEmptyFormDataRow(kind: FormDataRow["kind"] = "text"): FormDataRow {
  return { id: uid(), key: "", enabled: true, kind, value: "", files: [] };
}

export function createDefaultBodyDrafts(): RequestBodyDrafts {
  return {
    json: "",
    raw: "",
    xml: "",
    formData: [createEmptyFormDataRow("text")],
    urlEncoded: [createEmptyKV()],
    binary: { file: null },
    graphql: { query: "", variables: "{\n  \n}", operationName: "" },
  };
}

export function cloneKV(list: KV[]): KV[] {
  return list.map((item) => ({ ...item }));
}

/** Upserts `{key,value}` pairs into a variables list by key — shared by
 * Extract rule writes and pre-request script `environment` patches, both as
 * an in-memory preview (executor.ts) and as the persisted result (runner.ts),
 * so the merge semantics can't drift between the two call sites. */
export function mergeEnvironmentVariables(
  variables: KV[],
  updates: { key: string; value: string }[],
): KV[] {
  const next = cloneKV(variables);
  for (const { key, value } of updates) {
    const index = next.findIndex((item) => item.key === key);
    if (index >= 0) next[index] = { ...next[index], value, enabled: true };
    else next.push({ id: uid(), key, value, enabled: true });
  }
  return next;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function base64ToBlob(base64: string, type: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

export function cloneStoredFile(file: StoredFileBlob): StoredFileBlob {
  const { blobData, ...meta } = file;
  if (blobData && !meta.blob) {
    return { ...meta, blob: base64ToBlob(blobData, meta.type) };
  }
  return { ...meta };
}

export function cloneBodyDrafts(drafts: RequestBodyDrafts): RequestBodyDrafts {
  return {
    json: drafts.json,
    raw: drafts.raw,
    xml: drafts.xml,
    formData: drafts.formData.map((row) => ({ ...row, files: row.files.map(cloneStoredFile) })),
    urlEncoded: cloneKV(drafts.urlEncoded),
    binary: { file: drafts.binary.file ? cloneStoredFile(drafts.binary.file) : null },
    graphql: { ...drafts.graphql },
  };
}

export function normalizeBodyDrafts(
  drafts: Partial<RequestBodyDrafts> | undefined,
  body = "",
  bodyType: RequestBodyType = "none",
): RequestBodyDrafts {
  const defaults = createDefaultBodyDrafts();
  const next: RequestBodyDrafts = {
    ...defaults,
    ...drafts,
    formData: drafts?.formData?.length
      ? drafts.formData.map((row) => ({ ...row, files: row.files?.map(cloneStoredFile) ?? [] }))
      : defaults.formData,
    urlEncoded: drafts?.urlEncoded?.length ? cloneKV(drafts.urlEncoded) : defaults.urlEncoded,
    binary: { file: drafts?.binary?.file ? cloneStoredFile(drafts.binary.file) : null },
    graphql: { ...defaults.graphql, ...drafts?.graphql },
  };

  if (body) {
    if (bodyType === "json" && !next.json) next.json = body;
    if (bodyType === "raw" && !next.raw) next.raw = body;
    if (bodyType === "xml" && !next.xml) next.xml = body;
  }

  return next;
}

export function normalizeApiRequest(
  request: Partial<ApiRequest> &
    Pick<ApiRequest, "id" | "workspaceId" | "name" | "method" | "url" | "createdAt" | "updatedAt">,
): ApiRequest {
  const rawBodyType = request.bodyType as RequestBodyType | "text" | undefined;
  const legacyBodyType = rawBodyType === "text" ? "raw" : (rawBodyType ?? "none");
  const body = request.body ?? "";
  return {
    ...request,
    collectionId: request.collectionId ?? null,
    folderId: request.folderId ?? null,
    position: request.position ?? request.createdAt,
    headers: cloneKV(request.headers ?? []),
    queryParams: cloneKV(request.queryParams ?? []),
    body,
    bodyType: legacyBodyType,
    bodyDrafts: normalizeBodyDrafts(request.bodyDrafts, body, legacyBodyType),
    auth: request.auth ?? createDefaultAuth(),
    extracts: request.extracts ?? [],
    assertions: request.assertions ?? [],
    mock: request.mock ?? createDefaultMock(),
    preRequestScript: request.preRequestScript ?? createDefaultPreRequestScript(),
    timeoutMs: request.timeoutMs ?? 0,
    favorite: request.favorite ?? false,
  } as ApiRequest;
}

export function createRequestSnapshot(request: ApiRequest): RequestSnapshot {
  return {
    requestId: request.id,
    requestName: request.name,
    workspaceId: request.workspaceId,
    collectionId: request.collectionId,
    method: request.method,
    url: request.url,
    headers: cloneKV(request.headers),
    queryParams: cloneKV(request.queryParams),
    body: request.body,
    bodyType: request.bodyType,
    bodyDrafts: cloneBodyDrafts(request.bodyDrafts),
    auth: { ...request.auth },
  };
}

export function normalizeHistoryEntry(
  entry: Partial<HistoryEntry> &
    Pick<
      HistoryEntry,
      "id" | "workspaceId" | "method" | "url" | "ok" | "durationMs" | "sizeBytes" | "executedAt"
    >,
): HistoryEntry {
  const snapshot = entry.snapshot ?? {
    requestId: entry.requestId ?? null,
    requestName: entry.requestName ?? "Untitled request",
    workspaceId: entry.workspaceId,
    collectionId: null,
    method: entry.method,
    url: entry.url,
    headers: [],
    queryParams: [],
    body: "",
    bodyType: "none" as const,
    bodyDrafts: createDefaultBodyDrafts(),
    auth: createDefaultAuth(),
  };
  const rawSnapshotBodyType = snapshot.bodyType as RequestBodyType | "text" | undefined;
  const normalizedSnapshotBodyType =
    rawSnapshotBodyType === "text" ? "raw" : (rawSnapshotBodyType ?? "none");

  return {
    ...entry,
    requestId: entry.requestId ?? snapshot.requestId ?? null,
    requestName: entry.requestName ?? snapshot.requestName ?? "Untitled request",
    status: entry.status ?? null,
    environmentId: entry.environmentId ?? null,
    environmentName: entry.environmentName ?? null,
    favorite: entry.favorite ?? false,
    pinned: entry.pinned ?? false,
    responseKind: entry.responseKind ?? "empty",
    responseContentType: entry.responseContentType ?? "",
    responseHeaders: { ...(entry.responseHeaders ?? {}) },
    responseBody: entry.responseBody ?? "",
    responseBodyTruncated: entry.responseBodyTruncated ?? false,
    searchText:
      entry.searchText ??
      [
        entry.requestName,
        entry.method,
        entry.url,
        entry.status,
        entry.responseExcerpt,
        entry.responseBody,
        entry.errorMessage,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    snapshot: {
      ...snapshot,
      requestId: snapshot.requestId ?? entry.requestId ?? null,
      requestName: snapshot.requestName ?? entry.requestName ?? "Untitled request",
      headers: cloneKV(snapshot.headers ?? []),
      queryParams: cloneKV(snapshot.queryParams ?? []),
      body: snapshot.body ?? "",
      bodyType: normalizedSnapshotBodyType,
      bodyDrafts: normalizeBodyDrafts(
        snapshot.bodyDrafts,
        snapshot.body,
        normalizedSnapshotBodyType,
      ),
      auth: snapshot.auth ?? createDefaultAuth(),
    },
  } as HistoryEntry;
}

export async function ensureSeed(): Promise<Workspace> {
  const existing = await db.workspaces.toArray();
  if (existing.length) return existing[0];

  const now = Date.now();
  const ws: Workspace = {
    id: uid(),
    name: "Personal",
    globals: [],
    createdAt: now,
    updatedAt: now,
  };
  await db.workspaces.add(ws);

  const col: Collection = {
    id: uid(),
    workspaceId: ws.id,
    name: "Getting Started",
    position: 0,
    defaults: createDefaultRequestDefaults(),
    createdAt: now,
  };
  await db.collections.add(col);

  const sampleRequests: ApiRequest[] = [
    {
      id: uid(),
      workspaceId: ws.id,
      collectionId: col.id,
      folderId: null,
      position: 0,
      name: "List users",
      method: "GET",
      url: "https://jsonplaceholder.typicode.com/users",
      headers: [],
      queryParams: [],
      body: "",
      bodyType: "none",
      bodyDrafts: createDefaultBodyDrafts(),
      auth: createDefaultAuth(),
      extracts: [],
      assertions: [],
      mock: createDefaultMock(),
      preRequestScript: createDefaultPreRequestScript(),
      timeoutMs: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uid(),
      workspaceId: ws.id,
      collectionId: col.id,
      folderId: null,
      position: 1,
      name: "Create post",
      method: "POST",
      url: "https://jsonplaceholder.typicode.com/posts",
      headers: [{ id: uid(), key: "Content-Type", value: "application/json", enabled: true }],
      queryParams: [],
      body: JSON.stringify({ title: "Hello from Reqlo", body: "Local-first.", userId: 1 }, null, 2),
      bodyType: "json",
      bodyDrafts: {
        ...createDefaultBodyDrafts(),
        json: JSON.stringify(
          { title: "Hello from Reqlo", body: "Local-first.", userId: 1 },
          null,
          2,
        ),
      },
      auth: createDefaultAuth(),
      extracts: [],
      assertions: [],
      mock: createDefaultMock(),
      preRequestScript: createDefaultPreRequestScript(),
      timeoutMs: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uid(),
      workspaceId: ws.id,
      collectionId: col.id,
      folderId: null,
      position: 2,
      name: "Get single todo",
      method: "GET",
      url: "https://jsonplaceholder.typicode.com/todos/1",
      headers: [],
      queryParams: [],
      body: "",
      bodyType: "none",
      bodyDrafts: createDefaultBodyDrafts(),
      auth: createDefaultAuth(),
      extracts: [],
      assertions: [],
      mock: createDefaultMock(),
      preRequestScript: createDefaultPreRequestScript(),
      timeoutMs: 0,
      createdAt: now,
      updatedAt: now,
    },
  ];
  await db.requests.bulkAdd(sampleRequests);

  const defaultEnv: Environment = {
    id: uid(),
    workspaceId: ws.id,
    name: "Local",
    variables: [{ id: uid(), key: "BASE_URL", value: "http://localhost:3000", enabled: true }],
    createdAt: now,
  };
  await db.environments.add(defaultEnv);
  return ws;
}

/**
 * Without this, the browser treats reqlo's IndexedDB data as "best-effort" —
 * evictable under disk pressure (and, on Safari, after ~7 days without a
 * visit). Asking for persistent storage tells the browser this data matters
 * and shouldn't be silently cleared. Most browsers grant it automatically
 * based on engagement heuristics rather than prompting; there's nothing for
 * the user to click either way, so this just fires once at startup.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
