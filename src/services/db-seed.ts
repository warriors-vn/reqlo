import type {
  ApiRequest,
  Collection,
  Environment,
  ReqloDB,
  RequestAuth,
  RequestBodyDrafts,
  RequestDefaults,
  ScriptConfig,
  MockConfig,
  WebSocketConfig,
  Workspace,
} from "./db";

/** Same type-only-dependency shape as db-migrations.ts's MigrationHelpers, and for the same reason. */
export interface SeedHelpers {
  uid: () => string;
  createDefaultRequestDefaults: () => RequestDefaults;
  createDefaultWebSocketConfig: () => WebSocketConfig;
  createDefaultBodyDrafts: () => RequestBodyDrafts;
  createDefaultAuth: () => RequestAuth;
  createDefaultMock: () => MockConfig;
  createDefaultPreRequestScript: () => ScriptConfig;
  createDefaultPostResponseScript: () => ScriptConfig;
}

/** Creates the "Personal" workspace with its "Getting Started" sample collection, the first time the app ever runs. A no-op once a workspace already exists. */
export async function ensureSeed(database: ReqloDB, helpers: SeedHelpers): Promise<Workspace> {
  const existing = await database.workspaces.toArray();
  if (existing.length) return existing[0];

  const {
    uid,
    createDefaultRequestDefaults,
    createDefaultWebSocketConfig,
    createDefaultBodyDrafts,
    createDefaultAuth,
    createDefaultMock,
    createDefaultPreRequestScript,
    createDefaultPostResponseScript,
  } = helpers;

  const now = Date.now();
  const ws: Workspace = {
    id: uid(),
    name: "Personal",
    globals: [],
    createdAt: now,
    updatedAt: now,
  };
  await database.workspaces.add(ws);

  const col: Collection = {
    id: uid(),
    workspaceId: ws.id,
    name: "Getting Started",
    position: 0,
    defaults: createDefaultRequestDefaults(),
    createdAt: now,
  };
  await database.collections.add(col);

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
      protocol: "http",
      websocket: createDefaultWebSocketConfig(),
      bodyDrafts: createDefaultBodyDrafts(),
      auth: createDefaultAuth(),
      extracts: [],
      assertions: [],
      mock: createDefaultMock(),
      preRequestScript: createDefaultPreRequestScript(),
      postResponseScript: createDefaultPostResponseScript(),
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
      protocol: "http",
      websocket: createDefaultWebSocketConfig(),
      auth: createDefaultAuth(),
      extracts: [],
      assertions: [],
      mock: createDefaultMock(),
      preRequestScript: createDefaultPreRequestScript(),
      postResponseScript: createDefaultPostResponseScript(),
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
      protocol: "http",
      websocket: createDefaultWebSocketConfig(),
      bodyDrafts: createDefaultBodyDrafts(),
      auth: createDefaultAuth(),
      extracts: [],
      assertions: [],
      mock: createDefaultMock(),
      preRequestScript: createDefaultPreRequestScript(),
      postResponseScript: createDefaultPostResponseScript(),
      timeoutMs: 0,
      createdAt: now,
      updatedAt: now,
    },
  ];
  await database.requests.bulkAdd(sampleRequests);

  const defaultEnv: Environment = {
    id: uid(),
    workspaceId: ws.id,
    name: "Local",
    variables: [{ id: uid(), key: "BASE_URL", value: "http://localhost:3000", enabled: true }],
    createdAt: now,
  };
  await database.environments.add(defaultEnv);
  return ws;
}
