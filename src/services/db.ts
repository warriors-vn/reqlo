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
}

export interface StoredFileBlob {
  id: string;
  name: string;
  size: number;
  type: string;
  lastModified: number;
  blob?: Blob;
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
  type: "none" | "basic" | "bearer" | "api-key";
  username?: string;
  password?: string;
  token?: string;
  key?: string;
  value?: string;
  addTo?: "header" | "query";
}

export interface Workspace {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface Collection {
  id: string;
  workspaceId: string;
  name: string;
  position: number;
  createdAt: number;
}

export interface ApiRequest {
  id: string;
  workspaceId: string;
  collectionId: string | null;
  name: string;
  method: HttpMethod;
  url: string;
  headers: KV[];
  queryParams: KV[];
  body: string;
  bodyType: RequestBodyType;
  bodyDrafts: RequestBodyDrafts;
  auth: RequestAuth;
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
  }
}

export const db = new ReqloDB();

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export function createDefaultAuth(): RequestAuth {
  return { type: "none" };
}

export function createEmptyKV(key = "", value = ""): KV {
  return { id: uid(), key, value, enabled: true };
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

export function cloneStoredFile(file: StoredFileBlob): StoredFileBlob {
  return { ...file };
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
    headers: cloneKV(request.headers ?? []),
    queryParams: cloneKV(request.queryParams ?? []),
    body,
    bodyType: legacyBodyType,
    bodyDrafts: normalizeBodyDrafts(request.bodyDrafts, body, legacyBodyType),
    auth: request.auth ?? createDefaultAuth(),
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
  const ws: Workspace = { id: uid(), name: "Personal", createdAt: now, updatedAt: now };
  await db.workspaces.add(ws);

  const col: Collection = {
    id: uid(),
    workspaceId: ws.id,
    name: "Getting Started",
    position: 0,
    createdAt: now,
  };
  await db.collections.add(col);

  const sampleRequests: ApiRequest[] = [
    {
      id: uid(),
      workspaceId: ws.id,
      collectionId: col.id,
      name: "List users",
      method: "GET",
      url: "https://jsonplaceholder.typicode.com/users",
      headers: [],
      queryParams: [],
      body: "",
      bodyType: "none",
      bodyDrafts: createDefaultBodyDrafts(),
      auth: createDefaultAuth(),
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uid(),
      workspaceId: ws.id,
      collectionId: col.id,
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
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uid(),
      workspaceId: ws.id,
      collectionId: col.id,
      name: "Get single todo",
      method: "GET",
      url: "https://jsonplaceholder.typicode.com/todos/1",
      headers: [],
      queryParams: [],
      body: "",
      bodyType: "none",
      bodyDrafts: createDefaultBodyDrafts(),
      auth: createDefaultAuth(),
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
