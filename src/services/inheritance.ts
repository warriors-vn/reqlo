// Collection- and folder-level defaults, merged down onto a request before it
// is resolved or sent. Everything here is pure: it takes the request plus its
// ancestor chain and returns a new request, so the one place that has to get
// this right is buildResolvedRequestArtifacts (request-resolver.ts), which
// every send, snippet preview and auth preview already goes through.

import type { ApiRequest, Collection, Folder, KV, RequestAuth } from "@/services/db";

/** A request's ancestors, outermost first: its collection, then the folder
 * path from the collection's root down to the folder the request sits in. */
export interface RequestAncestors {
  collection: Collection | null;
  folders: Folder[];
}

/** For a request with no collection, and for tests that don't care. */
export const NO_ANCESTORS: RequestAncestors = { collection: null, folders: [] };

/**
 * Walks up from `request.folderId` to the collection root. Returns folders in
 * root→leaf order, which is also least→most specific, so callers can merge by
 * simply iterating forwards. A folderId pointing at a missing folder (or a
 * cyclic parent chain, which the store's wouldCreateCycle already prevents on
 * write) stops the walk instead of looping forever.
 */
export function resolveAncestors(
  request: Pick<ApiRequest, "collectionId" | "folderId">,
  collections: Collection[],
  folders: Folder[],
): RequestAncestors {
  const collection = request.collectionId
    ? (collections.find((item) => item.id === request.collectionId) ?? null)
    : null;

  const chain: Folder[] = [];
  const seen = new Set<string>();
  let currentId = request.folderId;
  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const folder = folders.find((item) => item.id === currentId);
    if (!folder) break;
    chain.unshift(folder);
    currentId = folder.parentFolderId;
  }

  return { collection, folders: chain };
}

/** Least→most specific: collection, then each folder from root down. */
function defaultsChain(ancestors: RequestAncestors) {
  return [
    ...(ancestors.collection ? [ancestors.collection.defaults] : []),
    ...ancestors.folders.map((folder) => folder.defaults),
  ];
}

/**
 * The variables every ancestor contributes, least specific first. The caller
 * appends the active environment's own variables after these, so the final
 * precedence is: workspace globals < collection < folders (outer→inner) <
 * environment.
 */
export function collectInheritedVariables(ancestors: RequestAncestors): KV[] {
  return defaultsChain(ancestors).flatMap((defaults) => defaults.variables);
}

/**
 * Merges KV lists from least specific (collection) to most specific (the
 * request's own). One rule, applied at every level: a row wins over anything
 * with the same key from a less specific level.
 *
 * That includes a *disabled* row, which turns the inherited value off rather
 * than being skipped — otherwise unchecking a header on a request would
 * silently hand control back to the collection's version of it, which is the
 * opposite of what unchecking looks like it does. At the outermost level there
 * is nothing to suppress, so a disabled row there is simply omitted, exactly
 * as before inheritance existed.
 *
 * `caseInsensitive` is on for headers (HTTP header names are case-insensitive,
 * so a request's "authorization" must override a collection's "Authorization")
 * and off for query params, where `?Page=` and `?page=` are genuinely
 * different parameters.
 */
function mergeKvLists(lists: KV[][], caseInsensitive: boolean): KV[] {
  const slots: (KV | null)[] = [];
  const indexByKey = new Map<string, number>();

  for (const list of lists) {
    for (const item of list) {
      if (!item.key.trim()) continue;
      const lookup = caseInsensitive ? item.key.toLowerCase() : item.key;
      const existing = indexByKey.get(lookup);
      // Keep the inherited row's position so the merged list still reads
      // outermost-first, but take the more specific level's key and value.
      const slot = existing ?? slots.length;
      if (existing === undefined) indexByKey.set(lookup, slot);
      slots[slot] = item.enabled ? { ...item } : null;
    }
  }

  return slots.filter((item): item is KV => item !== null);
}

/**
 * The auth a request actually sends. "inherit" walks the ancestor chain from
 * the most specific level outwards and takes the first one that configures
 * anything; any other type (including an explicit "none") is the request's own
 * decision and wins outright.
 */
export function resolveInheritedAuth(
  auth: RequestAuth,
  ancestors: RequestAncestors,
): { auth: RequestAuth; inheritedFrom: string | null } {
  if (auth.type !== "inherit") return { auth, inheritedFrom: null };

  const levels: { auth: RequestAuth; name: string }[] = [
    ...(ancestors.collection
      ? [{ auth: ancestors.collection.defaults.auth, name: ancestors.collection.name }]
      : []),
    ...ancestors.folders.map((folder) => ({ auth: folder.defaults.auth, name: folder.name })),
  ];

  for (let index = levels.length - 1; index >= 0; index -= 1) {
    const level = levels[index];
    if (level.auth.type !== "none" && level.auth.type !== "inherit") {
      return { auth: level.auth, inheritedFrom: level.name };
    }
  }

  // Nothing up the chain configures auth — send none, same as before
  // inheritance existed.
  return { auth: { type: "none" }, inheritedFrom: null };
}

/** The inherited headers/params a request will pick up, for the read-only
 * "inherited from …" rows the request editor shows above its own. Excludes the
 * request's own rows, unlike applyInheritedDefaults. */
export function inheritedContributions(ancestors: RequestAncestors): {
  headers: KV[];
  queryParams: KV[];
} {
  const chain = defaultsChain(ancestors);
  return {
    headers: mergeKvLists(
      chain.map((defaults) => defaults.headers),
      true,
    ),
    queryParams: mergeKvLists(
      chain.map((defaults) => defaults.queryParams),
      false,
    ),
  };
}

/**
 * The request as it will actually go out: ancestor headers/params merged under
 * its own, and "inherit" auth resolved to a concrete one. Everything else —
 * url, body, scripts, extracts, assertions — is untouched, because none of it
 * is inheritable.
 */
export function applyInheritedDefaults(
  request: ApiRequest,
  ancestors: RequestAncestors,
): ApiRequest {
  const chain = defaultsChain(ancestors);
  if (!chain.length && request.auth.type !== "inherit") return request;

  return {
    ...request,
    headers: mergeKvLists([...chain.map((defaults) => defaults.headers), request.headers], true),
    queryParams: mergeKvLists(
      [...chain.map((defaults) => defaults.queryParams), request.queryParams],
      false,
    ),
    auth: resolveInheritedAuth(request.auth, ancestors).auth,
  };
}
