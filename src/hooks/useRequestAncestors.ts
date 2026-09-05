import { useMemo } from "react";
import type { ApiRequest } from "@/services/db";
import { NO_ANCESTORS, resolveAncestors, type RequestAncestors } from "@/services/inheritance";
import { useStore } from "@/stores/useStore";

/**
 * The collection/folder chain a request inherits from, memoized so the
 * resolved object stays referentially stable between renders — several
 * consumers feed it straight into a useMemo dependency list (the snippet
 * preview, the auth preview), where a fresh object every render would
 * re-resolve the whole request on every keystroke.
 *
 * The store's own getRequestAncestors is the non-React equivalent; both go
 * through the same resolveAncestors so a component preview can't disagree
 * with what a send actually does.
 */
export function useRequestAncestors(request?: ApiRequest | null): RequestAncestors {
  const collections = useStore((s) => s.collections);
  const folders = useStore((s) => s.folders);

  return useMemo(() => {
    if (!request) return NO_ANCESTORS;
    return resolveAncestors(request, collections, folders);
  }, [request, collections, folders]);
}
