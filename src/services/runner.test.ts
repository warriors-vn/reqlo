import { afterEach, describe, expect, it, vi } from "vitest";
import {
  normalizeApiRequest,
  uid,
  type ApiRequest,
  type Environment,
  type Folder,
  type HistoryEntry,
  type KV,
} from "@/services/db";
import { collectRequestsInTreeOrder, runSingleRequest } from "@/services/runner";

function makeRequest(overrides: Partial<ApiRequest> = {}): ApiRequest {
  const now = Date.now();
  return normalizeApiRequest({
    id: uid(),
    workspaceId: "ws-1",
    name: "Req",
    method: "GET",
    url: "https://api.example.com",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function makeEnv(overrides: Partial<Environment> = {}): Environment {
  return {
    id: "env-1",
    workspaceId: "ws-1",
    name: "Local",
    variables: [],
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeDeps(workspaceId = "ws-1") {
  return {
    workspaceId,
    addHistory: vi.fn(async (_entry: HistoryEntry) => {}),
    updateEnvironment: vi.fn(async (_id: string, _patch: { variables: KV[] }) => {}),
    updateRequest: vi.fn(async (_id: string, _patch: Partial<ApiRequest>) => {}),
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("collectRequestsInTreeOrder", () => {
  const collectionId = "c1";
  const folderA: Folder = {
    id: "fA",
    workspaceId: "ws",
    collectionId,
    parentFolderId: null,
    name: "A",
    position: 0,
    createdAt: 1,
  };
  const folderB: Folder = {
    id: "fB",
    workspaceId: "ws",
    collectionId,
    parentFolderId: null,
    name: "B",
    position: 1,
    createdAt: 2,
  };
  const folderA1: Folder = {
    id: "fA1",
    workspaceId: "ws",
    collectionId,
    parentFolderId: "fA",
    name: "A1",
    position: 0,
    createdAt: 3,
  };
  const folders = [folderA, folderB, folderA1];

  const reqA1 = makeRequest({
    id: "r-a1",
    collectionId,
    folderId: "fA1",
    position: 0,
    name: "A1-req",
  });
  const reqA = makeRequest({ id: "r-a", collectionId, folderId: "fA", position: 0, name: "A-req" });
  const reqB = makeRequest({ id: "r-b", collectionId, folderId: "fB", position: 0, name: "B-req" });
  const reqRoot = makeRequest({
    id: "r-root",
    collectionId,
    folderId: null,
    position: 0,
    name: "root-req",
  });
  const requests = [reqA1, reqA, reqB, reqRoot];

  it("walks a whole collection folders-first (depth-first), then own requests, per level", () => {
    const result = collectRequestsInTreeOrder(
      { type: "collection", id: collectionId },
      requests,
      folders,
    );
    expect(result.map((r) => r.name)).toEqual(["A1-req", "A-req", "B-req", "root-req"]);
  });

  it("scopes to just a folder and its descendants when given a folder target", () => {
    const result = collectRequestsInTreeOrder({ type: "folder", id: "fA" }, requests, folders);
    expect(result.map((r) => r.name)).toEqual(["A1-req", "A-req"]);
  });

  it("returns an empty array for an empty folder", () => {
    const result = collectRequestsInTreeOrder({ type: "folder", id: "fB" }, [], folders);
    expect(result).toEqual([]);
  });

  it("returns an empty array for an unknown folder id", () => {
    const result = collectRequestsInTreeOrder({ type: "folder", id: "nope" }, requests, folders);
    expect(result).toEqual([]);
  });

  it("orders top-level requests by position within a flat collection", () => {
    const flatRequests = [
      makeRequest({ id: "r2", collectionId: "flat", folderId: null, position: 1, name: "second" }),
      makeRequest({ id: "r1", collectionId: "flat", folderId: null, position: 0, name: "first" }),
    ];
    const result = collectRequestsInTreeOrder({ type: "collection", id: "flat" }, flatRequests, []);
    expect(result.map((r) => r.name)).toEqual(["first", "second"]);
  });
});

describe("runSingleRequest", () => {
  it("executes the request and records a matching history entry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: true })),
    );
    const deps = makeDeps();
    const request = makeRequest({ name: "Get thing" });

    const outcome = await runSingleRequest(request, makeEnv(), deps);

    expect(outcome.result.status).toBe(200);
    expect(outcome.result.ok).toBe(true);
    expect(deps.addHistory).toHaveBeenCalledTimes(1);
    const entry = deps.addHistory.mock.calls[0][0] as HistoryEntry;
    expect(entry.requestId).toBe(request.id);
    expect(entry.status).toBe(200);
    expect(entry.ok).toBe(true);
  });

  it("extracts a variable from the JSON response into the environment", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ token: "abc123" })),
    );
    const deps = makeDeps();
    const request = makeRequest({
      extracts: [{ id: "e1", path: "token", variableName: "authToken", enabled: true }],
    });

    const outcome = await runSingleRequest(request, makeEnv(), deps);

    expect(outcome.extractedVariables).toEqual(["authToken"]);
    expect(deps.updateEnvironment).toHaveBeenCalledWith("env-1", {
      variables: [{ id: expect.any(String), key: "authToken", value: "abc123", enabled: true }],
    });
  });

  it("chains: a variable extracted from one request resolves in the next request's headers", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ token: "chained-token" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const deps = makeDeps();

    const requestA = makeRequest({
      name: "Login",
      extracts: [{ id: "e1", path: "token", variableName: "authToken", enabled: true }],
    });
    const envBefore = makeEnv();
    await runSingleRequest(requestA, envBefore, deps);

    // Simulate what the real runner does between iterations: re-read the
    // environment after the update the first request just wrote.
    const [, patch] = deps.updateEnvironment.mock.calls[0];
    const envAfter: Environment = { ...envBefore, variables: patch.variables };
    expect(envAfter.variables).toEqual([
      { id: expect.any(String), key: "authToken", value: "chained-token", enabled: true },
    ]);

    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce(jsonResponse({}));

    const requestB = makeRequest({
      name: "Get profile",
      headers: [{ id: "h1", key: "Authorization", value: "Bearer {{authToken}}", enabled: true }],
    });
    await runSingleRequest(requestB, envAfter, deps);

    const [, calledInit] = fetchMock.mock.calls[0];
    expect((calledInit?.headers as Record<string, string>).Authorization).toBe(
      "Bearer chained-token",
    );
  });

  it("runs a pre-request script whose environment write interpolates into this same request's headers, and persists it", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);
    const deps = makeDeps();
    const request = makeRequest({
      headers: [{ id: "h1", key: "X-Nonce", value: "{{nonce}}", enabled: true }],
      preRequestScript: {
        enabled: true,
        source: `return { environment: { nonce: "computed-nonce" }, headers: { "X-Signature": request.method } };`,
      },
    });

    const outcome = await runSingleRequest(request, makeEnv(), deps);

    expect(outcome.result.scriptError).toBeUndefined();
    const [, calledInit] = fetchMock.mock.calls[0];
    const sentHeaders = calledInit?.headers as Record<string, string>;
    expect(sentHeaders["X-Nonce"]).toBe("computed-nonce");
    expect(sentHeaders["X-Signature"]).toBe("GET");
    expect(deps.updateEnvironment).toHaveBeenCalledWith("env-1", {
      variables: [{ id: expect.any(String), key: "nonce", value: "computed-nonce", enabled: true }],
    });
  });

  it("flags scriptEnvironmentDropped when a script sets a variable but there's no active environment", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({})),
    );
    const deps = makeDeps();
    const request = makeRequest({
      preRequestScript: { enabled: true, source: `return { environment: { nonce: "x" } };` },
    });

    const outcome = await runSingleRequest(request, null, deps);

    expect(outcome.scriptEnvironmentDropped).toBe(true);
    expect(deps.updateEnvironment).not.toHaveBeenCalled();
  });

  it("does not flag scriptEnvironmentDropped when the script only sets headers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({})),
    );
    const deps = makeDeps();
    const request = makeRequest({
      preRequestScript: { enabled: true, source: `return { headers: { "X-Signature": "x" } };` },
    });

    const outcome = await runSingleRequest(request, null, deps);

    expect(outcome.scriptEnvironmentDropped).toBe(false);
  });

  it("surfaces a pre-request script error without blocking the request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({})),
    );
    const deps = makeDeps();
    const request = makeRequest({
      preRequestScript: { enabled: true, source: `throw new Error("bad script");` },
    });

    const outcome = await runSingleRequest(request, makeEnv(), deps);

    expect(outcome.result.scriptError).toContain("bad script");
    expect(outcome.result.status).toBe(200);
    expect(deps.updateEnvironment).not.toHaveBeenCalled();
  });

  it("auto-aborts a hung request once timeoutMs elapses, instead of hanging forever", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            // A real fetch() rejects once its signal aborts — a bare never-resolving
            // Promise wouldn't, so this stub has to actually honor it to be a valid stand-in.
            init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
          }),
      ),
    );
    const deps = makeDeps();
    const request = makeRequest({ timeoutMs: 50 });

    const outcome = await runSingleRequest(request, makeEnv(), deps);

    expect(outcome.result.ok).toBe(false);
    expect(outcome.result.status).toBeNull();
    expect(outcome.result.error).toBe("Request timed out after 50ms.");
  });

  it("does not touch the fetch call at all when timeoutMs is 0 (the default)", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);
    const request = makeRequest({ timeoutMs: 0 });

    await runSingleRequest(request, makeEnv(), makeDeps());

    const [, init] = fetchMock.mock.calls[0];
    expect((init?.signal as AbortSignal).aborted).toBe(false);
  });

  it("aborts immediately and reports cancellation when an external signal is already aborted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            if (init?.signal?.aborted) reject(init.signal.reason);
            else init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
          }),
      ),
    );
    const deps = makeDeps();
    const request = makeRequest();
    const controller = new AbortController();
    controller.abort();

    const outcome = await runSingleRequest(request, makeEnv(), deps, {
      signal: controller.signal,
    });

    expect(outcome.result.ok).toBe(false);
    expect(outcome.result.error).toBe("Request cancelled.");
  });

  it("reports a failed assertion in the outcome without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({}, 404)),
    );
    const deps = makeDeps();
    const request = makeRequest({
      assertions: [
        { id: "a1", enabled: true, kind: "status", path: "", operator: "equals", expected: "200" },
      ],
    });

    const outcome = await runSingleRequest(request, makeEnv(), deps);

    expect(outcome.assertionOutcomes).toHaveLength(1);
    expect(outcome.assertionOutcomes[0].passed).toBe(false);
  });

  it("flags noActiveEnvironment when extract rules exist but there's no active environment", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ token: "x" })),
    );
    const deps = makeDeps();
    const request = makeRequest({
      extracts: [{ id: "e1", path: "token", variableName: "authToken", enabled: true }],
    });

    const outcome = await runSingleRequest(request, null, deps);

    expect(outcome.noActiveEnvironment).toBe(true);
    expect(deps.updateEnvironment).not.toHaveBeenCalled();
  });
});
