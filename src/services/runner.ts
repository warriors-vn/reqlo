import { executeRequest, type ExecuteRequestOptions } from "@/services/executor";
import {
  createRequestSnapshot,
  mergeEnvironmentVariables,
  uid,
  type ApiRequest,
  type Environment,
  type Folder,
  type HistoryEntry,
  type KV,
} from "@/services/db";
import {
  getExecutionResultExcerpt,
  isTextualResponse,
  type ExecutionResult,
} from "@/services/execution";
import { resolveExtractPath, stringifyExtractedValue } from "@/services/extract";
import { evaluateAssertions, type AssertionOutcome } from "@/services/assertions";
import { MAX_RESPONSE_RENDER_LENGTH } from "@/lib/response-body-view";

const MAX_HISTORY_RESPONSE_BODY = 40_000;

export interface RunSingleRequestDeps {
  workspaceId: string;
  addHistory: (entry: HistoryEntry) => Promise<void>;
  updateEnvironment: (id: string, patch: { variables: KV[] }) => Promise<void>;
  updateRequest: (id: string, patch: Partial<ApiRequest>) => Promise<void>;
}

export interface RunSingleRequestOutcome {
  result: ExecutionResult;
  assertionOutcomes: AssertionOutcome[];
  extractedVariables: string[];
  extractFailures: string[];
  noActiveEnvironment: boolean;
  /** True when a pre-request script returned an `environment` patch but there
   * was no active environment to persist it into — the patch was dropped. */
  scriptEnvironmentDropped: boolean;
}

/**
 * The single-request pipeline (execute → extract → assert → log to history) —
 * shared by interactive Send (Workspace.tsx) and the collection runner
 * (CollectionRunnerModal.tsx) so there's exactly one execution path, not two.
 * Unlike Send, this never toasts directly — it returns a structured outcome and
 * lets each caller decide how to surface it (a toast per send vs. aggregated
 * rows in a batch run).
 */
export async function runSingleRequest(
  request: ApiRequest,
  environment: Environment | null,
  deps: RunSingleRequestDeps,
  options?: ExecuteRequestOptions,
): Promise<RunSingleRequestOutcome> {
  const result = await executeRequest(request, environment, options);

  // When a cached token got auto-refreshed, log history and persist the
  // request against the refreshed copy — the stale/expired token isn't what
  // was actually sent, and would confuse anyone inspecting history later.
  let effectiveRequest = request;
  if (result.refreshedOAuth2Token && request.auth.type === "oauth2" && request.auth.oauth2) {
    effectiveRequest = {
      ...request,
      auth: {
        ...request.auth,
        oauth2: { ...request.auth.oauth2, cachedToken: result.refreshedOAuth2Token },
      },
    };
    try {
      await deps.updateRequest(request.id, { auth: effectiveRequest.auth });
    } catch {
      // updateRequest's own DB-write-failure path already toasts the user —
      // don't let a failed persist of the refreshed token abort history/
      // extract/assert for a request that otherwise completed successfully.
      // Worst case, the next send just refreshes again from the same stale
      // cached token.
    }
  }

  const scriptUpdates = Object.entries(result.scriptEnvironmentPatch ?? {}).map(([key, value]) => ({
    key,
    value,
  }));
  const scriptEnvironmentDropped = scriptUpdates.length > 0 && !environment;
  if (environment && scriptUpdates.length) {
    await upsertEnvironmentVariables(environment, scriptUpdates, deps.updateEnvironment);
  }

  const responseExcerpt = getExecutionResultExcerpt(result);
  const responseBody =
    isTextualResponse(result.responseKind) && result.body.length > MAX_HISTORY_RESPONSE_BODY
      ? result.body.slice(0, MAX_HISTORY_RESPONSE_BODY)
      : isTextualResponse(result.responseKind)
        ? result.body
        : "";

  let extractedVariables: string[] = [];
  let extractFailures: string[] = [];
  let noActiveEnvironment = false;
  if (result.responseKind === "json" && result.body) {
    const outcome = await applyExtractRules(
      request,
      result.body,
      environment,
      deps.updateEnvironment,
    );
    extractedVariables = outcome.extracted;
    extractFailures = outcome.failed;
    noActiveEnvironment = outcome.noActiveEnvironment;
  }

  const assertionOutcomes = evaluateAssertions(request.assertions, result);

  await deps.addHistory({
    id: uid(),
    workspaceId: deps.workspaceId,
    requestId: request.id,
    requestName: request.name,
    method: request.method,
    url: request.url,
    status: result.status,
    ok: result.ok,
    durationMs: result.durationMs,
    sizeBytes: result.sizeBytes,
    executedAt: Date.now(),
    environmentId: environment?.id ?? null,
    environmentName: environment?.name ?? null,
    favorite: false,
    pinned: false,
    snapshot: createRequestSnapshot(effectiveRequest),
    responseKind: result.responseKind,
    responseContentType: result.contentType,
    responseHeaders: { ...result.headers },
    responseBody,
    responseBodyTruncated:
      isTextualResponse(result.responseKind) && result.body.length > MAX_HISTORY_RESPONSE_BODY,
    searchText: [
      request.name,
      request.method,
      request.url,
      result.status,
      environment?.name,
      responseExcerpt,
      result.error,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
    errorMessage: result.error,
    responseExcerpt,
  });

  return {
    result,
    assertionOutcomes,
    extractedVariables,
    extractFailures,
    noActiveEnvironment,
    scriptEnvironmentDropped,
  };
}

async function applyExtractRules(
  request: ApiRequest,
  responseBody: string,
  environment: Environment | null,
  updateEnvironment: RunSingleRequestDeps["updateEnvironment"],
): Promise<{ extracted: string[]; failed: string[]; noActiveEnvironment: boolean }> {
  const rules = request.extracts.filter(
    (rule) => rule.enabled && rule.path.trim() && rule.variableName.trim(),
  );
  if (!rules.length) return { extracted: [], failed: [], noActiveEnvironment: false };
  if (!environment) return { extracted: [], failed: [], noActiveEnvironment: true };

  // JSON.parse on a body this large is itself the tab-freezing operation the
  // response-render cap was meant to prevent — skip parsing rather than
  // block the main thread on it, and report every rule as failed so the
  // "couldn't extract" toast at least tells the user something happened.
  if (responseBody.length > MAX_RESPONSE_RENDER_LENGTH) {
    return {
      extracted: [],
      failed: rules.map((rule) => rule.variableName.trim() || rule.path),
      noActiveEnvironment: false,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseBody);
  } catch {
    return { extracted: [], failed: [], noActiveEnvironment: false };
  }

  const updates: { key: string; value: string }[] = [];
  const failed: string[] = [];
  for (const rule of rules) {
    const resolved = resolveExtractPath(parsed, rule.path);
    if (resolved.ok) {
      updates.push({
        key: rule.variableName.trim(),
        value: stringifyExtractedValue(resolved.value),
      });
    } else {
      failed.push(rule.variableName.trim() || rule.path);
    }
  }

  if (updates.length) await upsertEnvironmentVariables(environment, updates, updateEnvironment);

  return { extracted: updates.map((u) => u.key), failed, noActiveEnvironment: false };
}

/** Upserts `{key,value}` pairs into an environment's variables by key — shared
 * by Extract rule writes and pre-request script `environment` patches. */
async function upsertEnvironmentVariables(
  environment: Environment,
  updates: { key: string; value: string }[],
  updateEnvironment: RunSingleRequestDeps["updateEnvironment"],
): Promise<void> {
  const nextVariables = mergeEnvironmentVariables(environment.variables, updates);
  await updateEnvironment(environment.id, { variables: nextVariables });
}

export type RunTarget = { type: "collection" | "folder"; id: string };

/**
 * Every request under a collection or folder, in the same order the sidebar
 * renders them: each level's child folders first (depth-first, position order),
 * then that level's own direct requests.
 */
export function collectRequestsInTreeOrder(
  target: RunTarget,
  requests: ApiRequest[],
  folders: Folder[],
): ApiRequest[] {
  const collectionId =
    target.type === "collection"
      ? target.id
      : folders.find((f) => f.id === target.id)?.collectionId;
  if (!collectionId) return [];
  const rootFolderId = target.type === "folder" ? target.id : null;
  return walkTree(collectionId, rootFolderId, requests, folders);
}

function walkTree(
  collectionId: string,
  parentFolderId: string | null,
  requests: ApiRequest[],
  folders: Folder[],
): ApiRequest[] {
  const childFolders = folders
    .filter((f) => f.collectionId === collectionId && f.parentFolderId === parentFolderId)
    .sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
  const ownRequests = requests
    .filter(
      (r) => (r.collectionId ?? null) === collectionId && (r.folderId ?? null) === parentFolderId,
    )
    .sort((a, b) => a.position - b.position);

  const out: ApiRequest[] = [];
  for (const folder of childFolders) {
    out.push(...walkTree(collectionId, folder.id, requests, folders));
  }
  out.push(...ownRequests);
  return out;
}
