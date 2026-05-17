import {
  db,
  type ApiRequest,
  type Collection,
  type Environment,
  type HistoryEntry,
  type Workspace,
} from "@/services/db";

const SCHEMA_VERSION = 2;

export interface CollectionExport {
  schema: "reqlo.collection";
  version: number;
  exportedAt: number;
  collection: Collection;
  requests: ApiRequest[];
}

export interface WorkspaceExport {
  schema: "reqlo.workspace";
  version: number;
  exportedAt: number;
  workspace: Workspace;
  collections: Collection[];
  requests: ApiRequest[];
  environments: Environment[];
  history: HistoryEntry[];
}

export async function exportCollection(collection: Collection): Promise<CollectionExport> {
  const requests = await db.requests.where("collectionId").equals(collection.id).toArray();
  return {
    schema: "reqlo.collection",
    version: SCHEMA_VERSION,
    exportedAt: Date.now(),
    collection,
    requests: requests.map(sanitizeRequestForExport),
  };
}

export async function exportWorkspace(workspace: Workspace): Promise<WorkspaceExport> {
  const [collections, requests, environments, history] = await Promise.all([
    db.collections.where("workspaceId").equals(workspace.id).toArray(),
    db.requests.where("workspaceId").equals(workspace.id).toArray(),
    db.environments.where("workspaceId").equals(workspace.id).toArray(),
    db.history.where("workspaceId").equals(workspace.id).toArray(),
  ]);
  return {
    schema: "reqlo.workspace",
    version: SCHEMA_VERSION,
    exportedAt: Date.now(),
    workspace,
    collections,
    requests: requests.map(sanitizeRequestForExport),
    environments,
    history: history.map(sanitizeHistoryForExport),
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
  return o.schema === "reqlo.collection" && Array.isArray(o.requests) && !!o.collection;
}

function sanitizeRequestForExport(request: ApiRequest): ApiRequest {
  return {
    ...request,
    bodyDrafts: {
      ...request.bodyDrafts,
      formData: request.bodyDrafts.formData.map((row) => ({
        ...row,
        files: row.files.map(({ blob: _blob, ...file }) => file),
      })),
      binary: {
        file: request.bodyDrafts.binary.file
          ? (({ blob: _blob, ...file }) => file)(request.bodyDrafts.binary.file)
          : null,
      },
    },
  };
}

function sanitizeHistoryForExport(history: HistoryEntry): HistoryEntry {
  const sanitizedRequest = sanitizeRequestForExport({
    id: history.snapshot.requestId ?? history.requestId ?? history.id,
    workspaceId: history.snapshot.workspaceId,
    collectionId: history.snapshot.collectionId,
    name: history.snapshot.requestName,
    method: history.snapshot.method,
    url: history.snapshot.url,
    headers: history.snapshot.headers,
    queryParams: history.snapshot.queryParams,
    body: history.snapshot.body,
    bodyType: history.snapshot.bodyType,
    bodyDrafts: history.snapshot.bodyDrafts,
    auth: history.snapshot.auth,
    favorite: false,
    createdAt: history.executedAt,
    updatedAt: history.executedAt,
  });

  return {
    ...history,
    snapshot: {
      ...sanitizedRequest,
      requestId: sanitizedRequest.id,
      requestName: sanitizedRequest.name,
    },
  };
}
