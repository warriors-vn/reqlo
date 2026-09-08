import Dexie, { type Table } from "dexie";
import type { ResponseKind } from "@/services/execution";
import { registerMigrations } from "./db-migrations";
import { ensureSeed as ensureSeedImpl } from "./db-seed";

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

/** One sandboxed (QuickJS-in-wasm) script slot. Both the pre-request and the
 * post-response script are this shape; only when they run differs. */
export interface ScriptConfig {
  enabled: boolean;
  /** JavaScript source. */
  source: string;
}

/** @deprecated Kept so the older migrations below still read as written. */
export type PreRequestScriptConfig = ScriptConfig;

/** What a request talks: plain HTTP, or a WebSocket connection. Separate
 * from `method`, which stays meaningless for a WebSocket — the handshake is
 * always a GET and the UI hides the method selector. */
export type RequestProtocol = "http" | "websocket";

export type WebSocketMessageContentType = "text" | "json";

/** A message body saved on the request so it can be sent again without being
 * retyped — the WebSocket equivalent of a request body, except a connection
 * sends many of them. */
export interface WebSocketMessageDraft {
  id: string;
  name: string;
  contentType: WebSocketMessageContentType;
  body: string;
}

export interface WebSocketConfig {
  /**
   * Sec-WebSocket-Protocol values offered during the handshake. This is the
   * one piece of handshake metadata a browser lets a page set — custom
   * headers are not settable on `new WebSocket()`, which is why the Headers
   * tab says so instead of accepting rows that would never go out.
   */
  subprotocols: string[];
  messageDrafts: WebSocketMessageDraft[];
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
  /** "http" for everything that predates the WebSocket client — backfilled
   * by the version(14) migration rather than left undefined. */
  protocol: RequestProtocol;
  method: HttpMethod;
  url: string;
  headers: KV[];
  queryParams: KV[];
  body: string;
  bodyType: RequestBodyType;
  bodyDrafts: RequestBodyDrafts;
  /** Only meaningful when `protocol` is "websocket"; carried on every request
   * so switching protocols never loses what was already typed. */
  websocket: WebSocketConfig;
  auth: RequestAuth;
  extracts: ExtractRule[];
  assertions: AssertionRule[];
  mock: MockConfig;
  preRequestScript: ScriptConfig;
  /** Runs after a response arrives — can write environment variables and
   * declare pass/fail tests. See services/scripting.ts. */
  postResponseScript: ScriptConfig;
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

export class ReqloDB extends Dexie {
  workspaces!: Table<Workspace, string>;
  collections!: Table<Collection, string>;
  folders!: Table<Folder, string>;
  requests!: Table<ApiRequest, string>;
  history!: Table<HistoryEntry, string>;
  environments!: Table<Environment, string>;

  constructor() {
    super("reqlo");
    registerMigrations(this, {
      normalizeApiRequest,
      normalizeHistoryEntry,
      createDefaultMock,
      createDefaultPreRequestScript,
      createDefaultPostResponseScript,
      createDefaultRequestDefaults,
      createDefaultWebSocketConfig,
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

export function createDefaultWebSocketConfig(): WebSocketConfig {
  return { subprotocols: [], messageDrafts: [] };
}

export function createEmptyWebSocketMessageDraft(name = "Message"): WebSocketMessageDraft {
  return { id: uid(), name, contentType: "json", body: "" };
}

export function cloneWebSocketConfig(config: WebSocketConfig): WebSocketConfig {
  return {
    subprotocols: [...config.subprotocols],
    messageDrafts: config.messageDrafts.map((draft) => ({ ...draft, id: uid() })),
  };
}

/** Fills in the WebSocket fields for a request that came from outside the
 * current schema — an import file, or a parser that predates them. */
export function normalizeWebSocketConfig(config?: Partial<WebSocketConfig>): WebSocketConfig {
  return {
    subprotocols: (config?.subprotocols ?? []).filter((value) => typeof value === "string"),
    messageDrafts: (config?.messageDrafts ?? []).map((draft) => ({ ...draft })),
  };
}

export function createDefaultPostResponseScript(): ScriptConfig {
  return { enabled: false, source: "" };
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
    protocol: request.protocol ?? "http",
    websocket: normalizeWebSocketConfig(request.websocket),
    auth: request.auth ?? createDefaultAuth(),
    extracts: request.extracts ?? [],
    assertions: request.assertions ?? [],
    mock: request.mock ?? createDefaultMock(),
    preRequestScript: request.preRequestScript ?? createDefaultPreRequestScript(),
    postResponseScript: request.postResponseScript ?? createDefaultPostResponseScript(),
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
  return ensureSeedImpl(db, {
    uid,
    createDefaultRequestDefaults,
    createDefaultWebSocketConfig,
    createDefaultBodyDrafts,
    createDefaultAuth,
    createDefaultMock,
    createDefaultPreRequestScript,
    createDefaultPostResponseScript,
  });
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
