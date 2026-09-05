import { toast } from "sonner";
import {
  db,
  uid,
  cloneBodyDrafts,
  createInheritedAuth,
  createDefaultBodyDrafts,
  createDefaultMock,
  createDefaultPreRequestScript,
  type ApiRequest,
  type HttpMethod,
} from "@/services/db";
import { fetchIntrospectionSchema } from "@/services/graphql-introspection";
import { NO_ANCESTORS, resolveAncestors, type RequestAncestors } from "@/services/inheritance";
import { mergeGlobalsIntoEnvironment } from "@/features/code-snippets/utils/request-resolver";
import {
  compareRequestsByPosition,
  getNextRequestPosition,
  resequenceRequests,
  sortRequestsForCollection,
} from "@/services/tree-move";
import { omitKeys, persistSession, reportDbWriteFailure, UNDO_GRACE_MS } from "@/stores/shared";
import type { SliceCreator } from "@/stores/types";

const recentlyDeletedRequests = new Map<string, ApiRequest>();
const pendingRequestPrunes = new Map<string, ReturnType<typeof setTimeout>>();

export interface RequestsSlice {
  // last fire time, used to ping AnimatePresence-style listeners
  sendPing: number;

  updateRequest: (id: string, patch: Partial<ApiRequest>) => Promise<void>;
  createRequest: (collectionId: string | null, folderId?: string | null) => Promise<ApiRequest>;
  deleteRequest: (id: string) => Promise<void>;
  renameRequest: (id: string, name: string) => Promise<void>;
  moveRequestToCollection: (id: string, collectionId: string | null) => Promise<void>;
  moveRequestToFolder: (id: string, collectionId: string, folderId: string | null) => Promise<void>;
  reorderRequests: (
    draggedId: string,
    targetId: string | null,
    collectionId: string | null,
    folderId: string | null,
  ) => Promise<void>;
  duplicateRequest: (id: string) => Promise<ApiRequest | null>;
  toggleFavorite: (id: string) => Promise<void>;
  requestSend: () => void; // bumps sendPing; Workspace listens

  /** The collection/folder chain a request inherits auth, headers, params and
   * variables from. Every send and every preview has to resolve through this
   * — see services/inheritance.ts. */
  getRequestAncestors: (requestId: string) => RequestAncestors;

  // graphql schema introspection (session-only, keyed by request id)
  fetchGraphQLSchema: (requestId: string) => Promise<void>;
}

export const createRequestsSlice: SliceCreator<RequestsSlice> = (set, get) => ({
  sendPing: 0,

  updateRequest: async (id, patch) => {
    const updatedAt = Date.now();
    set((s) => ({
      requests: s.requests.map((r) => (r.id === id ? { ...r, ...patch, updatedAt } : r)),
    }));
    await reportDbWriteFailure(db.requests.update(id, { ...patch, updatedAt }));
  },

  createRequest: async (collectionId, folderId = null) => {
    const ws = get().workspace!;
    const now = Date.now();
    const req: ApiRequest = {
      id: uid(),
      workspaceId: ws.id,
      collectionId,
      folderId,
      position: getNextRequestPosition(get().requests, collectionId, folderId),
      name: "Untitled request",
      method: "GET" as HttpMethod,
      url: "",
      headers: [],
      queryParams: [],
      body: "",
      bodyType: "none",
      bodyDrafts: createDefaultBodyDrafts(),
      // New requests start on "inherit" so a collection's auth applies without
      // touching each one; requests that predate this stay on whatever they
      // had. See RequestAuth in services/db.ts.
      auth: createInheritedAuth(),
      extracts: [],
      assertions: [],
      mock: createDefaultMock(),
      preRequestScript: createDefaultPreRequestScript(),
      timeoutMs: 0,
      createdAt: now,
      updatedAt: now,
    };
    await reportDbWriteFailure(db.requests.add(req));
    set((s) => ({ requests: [...s.requests, req] }));
    get().openRequest(req.id);
    return req;
  },

  deleteRequest: async (id) => {
    const deleted = get().requests.find((r) => r.id === id);
    await reportDbWriteFailure(db.requests.delete(id));
    set((s) => {
      const nextTabs = s.tabs.filter((t) => t.requestId !== id);
      const activeTabStillExists = !!nextTabs.find((tab) => tab.id === s.activeTabId);
      return {
        requests: s.requests.filter((r) => r.id !== id),
        tabs: nextTabs,
        activeTabId: activeTabStillExists ? s.activeTabId : (nextTabs[0]?.id ?? null),
        sidebarSelection:
          s.sidebarSelection?.type === "request" && s.sidebarSelection.id === id
            ? null
            : s.sidebarSelection,
        graphqlSchemas: omitKeys(s.graphqlSchemas, [id]),
      };
    });
    persistSession(get);

    if (!deleted) return;

    // Undo window: the delete above already happened (no new data-loss surface
    // on reload/crash — behavior is identical to before this feature existed).
    // "Undo" re-inserts this exact in-memory snapshot rather than deferring the
    // real delete, so there's never a "pending delete that never committed"
    // state to reconcile with init()'s hydration.
    const restore = async () => {
      if (!recentlyDeletedRequests.has(id)) return;
      // Only clear the recovery buffer once the write actually succeeds — if
      // db.requests.add throws (quota, restrictive private-mode storage), the
      // snapshot and its prune timer stay alive so re-clicking "Undo" before
      // the grace window ends can still retry, instead of the request being
      // silently lost forever on a single failed write.
      try {
        await reportDbWriteFailure(db.requests.add(deleted));
      } catch {
        return;
      }
      recentlyDeletedRequests.delete(id);
      const timeoutId = pendingRequestPrunes.get(id);
      if (timeoutId) {
        clearTimeout(timeoutId);
        pendingRequestPrunes.delete(id);
      }
      set((s) => ({ requests: [...s.requests, deleted] }));
      toast.success(`"${deleted.name || "Untitled request"}" restored`);
    };

    recentlyDeletedRequests.set(id, deleted);
    pendingRequestPrunes.set(
      id,
      setTimeout(() => {
        recentlyDeletedRequests.delete(id);
        pendingRequestPrunes.delete(id);
      }, UNDO_GRACE_MS),
    );

    toast(`"${deleted.name || "Untitled request"}" deleted`, {
      duration: UNDO_GRACE_MS,
      action: { label: "Undo", onClick: () => void restore() },
    });
  },

  renameRequest: async (id, name) => {
    await get().updateRequest(id, { name });
  },

  moveRequestToCollection: async (id, collectionId) => {
    // Explicitly zero folderId: a request dropped onto a bare collection row must leave
    // whatever folder it was in, or it keeps a stale folderId pointing at a folder that may
    // not even belong to the destination collection.
    await get().reorderRequests(id, null, collectionId, null);
  },

  moveRequestToFolder: async (id, collectionId, folderId) => {
    await get().reorderRequests(id, null, collectionId, folderId);
  },

  reorderRequests: async (draggedId, targetId, collectionId, folderId) => {
    if (draggedId === targetId) return;
    const allRequests = get().requests;
    const dragged = allRequests.find((request) => request.id === draggedId);
    if (!dragged) return;

    const sourceCollectionId = dragged.collectionId ?? null;
    const sourceFolderId = dragged.folderId ?? null;
    const sourceSiblings = sortRequestsForCollection(
      allRequests.filter(
        (request) =>
          request.collectionId === sourceCollectionId &&
          request.folderId === sourceFolderId &&
          request.id !== draggedId,
      ),
    );
    const sameContainer = sourceCollectionId === collectionId && sourceFolderId === folderId;
    const targetSiblingsBase = sameContainer
      ? sourceSiblings
      : sortRequestsForCollection(
          allRequests.filter(
            (request) =>
              request.collectionId === collectionId &&
              request.folderId === folderId &&
              request.id !== draggedId,
          ),
        );

    const nextDragged: ApiRequest = { ...dragged, collectionId, folderId };
    const targetIndex =
      targetId === null
        ? targetSiblingsBase.length
        : targetSiblingsBase.findIndex((request) => request.id === targetId);
    if (targetIndex === -1) return;

    const targetSiblings = targetSiblingsBase.slice();
    targetSiblings.splice(targetIndex, 0, nextDragged);

    const sourceUpdated = resequenceRequests(sourceSiblings);
    const targetUpdated = resequenceRequests(targetSiblings);
    const changed = [...sourceUpdated, ...targetUpdated];
    const changedMap = new Map(changed.map((request) => [request.id, request]));

    set((state) => ({
      requests: state.requests
        .map((request) => changedMap.get(request.id) ?? request)
        .sort(compareRequestsByPosition),
    }));
    await reportDbWriteFailure(db.requests.bulkPut([...changedMap.values()]));
  },

  duplicateRequest: async (id) => {
    const src = get().requests.find((r) => r.id === id);
    if (!src) return null;
    const now = Date.now();
    const copy: ApiRequest = {
      ...src,
      id: uid(),
      position: getNextRequestPosition(get().requests, src.collectionId, src.folderId),
      name: `${src.name} (copy)`,
      headers: src.headers.map((h) => ({ ...h, id: uid() })),
      queryParams: src.queryParams.map((p) => ({ ...p, id: uid() })),
      bodyDrafts: cloneBodyDrafts(src.bodyDrafts),
      auth: { ...src.auth },
      extracts: src.extracts.map((rule) => ({ ...rule, id: uid() })),
      assertions: src.assertions.map((rule) => ({ ...rule, id: uid() })),
      mock: { ...src.mock },
      createdAt: now,
      updatedAt: now,
    };
    await reportDbWriteFailure(db.requests.add(copy));
    set((s) => ({ requests: [...s.requests, copy] }));
    get().openRequest(copy.id);
    return copy;
  },

  toggleFavorite: async (id) => {
    const r = get().requests.find((x) => x.id === id);
    if (!r) return;
    await get().updateRequest(id, { favorite: !r.favorite });
  },

  requestSend: () => set({ sendPing: Date.now() }),

  getRequestAncestors: (requestId) => {
    const request = get().requests.find((r) => r.id === requestId);
    if (!request) return NO_ANCESTORS;
    return resolveAncestors(request, get().collections, get().folders);
  },

  fetchGraphQLSchema: async (requestId) => {
    const request = get().requests.find((r) => r.id === requestId);
    if (!request) return;
    set((s) => ({
      graphqlSchemas: { ...s.graphqlSchemas, [requestId]: { status: "loading" } },
    }));

    const rawEnvironment = get().environments.find((env) => env.id === get().activeEnvId) ?? null;
    const environment = mergeGlobalsIntoEnvironment(rawEnvironment, get().workspace?.globals ?? []);
    const result = await fetchIntrospectionSchema(
      request,
      environment,
      get().getRequestAncestors(requestId),
    );

    // The request may have been deleted while the fetch was in flight —
    // deleteRequest already pruned graphqlSchemas[requestId] for that case,
    // so writing into it here would silently reintroduce an orphaned entry
    // for an id nothing will ever prune again.
    if (!get().requests.some((r) => r.id === requestId)) return;

    set((s) => ({
      graphqlSchemas: {
        ...s.graphqlSchemas,
        [requestId]: result.ok
          ? { status: "ready", introspection: result.introspection, fetchedAt: Date.now() }
          : { status: "error", message: result.error },
      },
    }));
  },
});
