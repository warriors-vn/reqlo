import {
  blobToBase64,
  createDefaultMock,
  db,
  type ApiRequest,
  type Collection,
  type Environment,
  type Folder,
  type HistoryEntry,
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
    collection,
    folders,
    requests: await Promise.all(requests.map(sanitizeRequestForExport)),
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
    workspace,
    collections,
    folders,
    requests: await Promise.all(requests.map(sanitizeRequestForExport)),
    environments: environments.map(sanitizeEnvironmentForExport),
    history: await Promise.all(history.map(sanitizeHistoryForExport)),
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

async function exportStoredFile(file: StoredFileBlob): Promise<StoredFileBlob> {
  const { blob, ...meta } = file;
  if (!blob) return meta;
  return { ...meta, blobData: await blobToBase64(blob) };
}

export async function sanitizeRequestForExport(request: ApiRequest): Promise<ApiRequest> {
  return {
    ...request,
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
    auth: history.snapshot.auth,
    extracts: [],
    assertions: [],
    mock: createDefaultMock(),
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
