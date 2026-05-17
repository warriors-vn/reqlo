import Dexie, { type Table } from "dexie";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export interface KV { id: string; key: string; value: string; enabled: boolean }

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
  bodyType: "none" | "json" | "text";
  createdAt: number;
  updatedAt: number;
}

export interface HistoryEntry {
  id: string;
  workspaceId: string;
  requestId: string | null;
  method: HttpMethod;
  url: string;
  status: number | null;
  ok: boolean;
  durationMs: number;
  sizeBytes: number;
  executedAt: number;
  errorMessage?: string;
  responseExcerpt?: string;
}

class ReqloDB extends Dexie {
  workspaces!: Table<Workspace, string>;
  collections!: Table<Collection, string>;
  requests!: Table<ApiRequest, string>;
  history!: Table<HistoryEntry, string>;

  constructor() {
    super("reqlo");
    this.version(1).stores({
      workspaces: "id, updatedAt",
      collections: "id, workspaceId, position",
      requests: "id, workspaceId, collectionId, updatedAt",
      history: "id, workspaceId, requestId, executedAt",
    });
  }
}

export const db = new ReqloDB();

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export async function ensureSeed(): Promise<Workspace> {
  const existing = await db.workspaces.toArray();
  if (existing.length) return existing[0];

  const now = Date.now();
  const ws: Workspace = { id: uid(), name: "Personal", createdAt: now, updatedAt: now };
  await db.workspaces.add(ws);

  const col: Collection = { id: uid(), workspaceId: ws.id, name: "Getting Started", position: 0, createdAt: now };
  await db.collections.add(col);

  const sampleRequests: ApiRequest[] = [
    {
      id: uid(), workspaceId: ws.id, collectionId: col.id,
      name: "List users", method: "GET", url: "https://jsonplaceholder.typicode.com/users",
      headers: [], queryParams: [], body: "", bodyType: "none",
      createdAt: now, updatedAt: now,
    },
    {
      id: uid(), workspaceId: ws.id, collectionId: col.id,
      name: "Create post", method: "POST", url: "https://jsonplaceholder.typicode.com/posts",
      headers: [{ id: uid(), key: "Content-Type", value: "application/json", enabled: true }],
      queryParams: [],
      body: JSON.stringify({ title: "Hello from Reqlo", body: "Local-first.", userId: 1 }, null, 2),
      bodyType: "json",
      createdAt: now, updatedAt: now,
    },
    {
      id: uid(), workspaceId: ws.id, collectionId: col.id,
      name: "Get single todo", method: "GET", url: "https://jsonplaceholder.typicode.com/todos/1",
      headers: [], queryParams: [], body: "", bodyType: "none",
      createdAt: now, updatedAt: now,
    },
  ];
  await db.requests.bulkAdd(sampleRequests);
  return ws;
}
