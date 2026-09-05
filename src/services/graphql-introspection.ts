import type { IntrospectionQuery } from "graphql";
import type { ApiRequest, Environment } from "@/services/db";
import type { RequestAncestors } from "@/services/inheritance";
import { fetchViaProxy, ProxyUnavailableError } from "@/services/executor";
import { PROXIED_HEADER } from "@/services/proxy-constants";
import {
  applyPreRequestScript,
  buildResolvedRequestArtifacts,
} from "@/features/code-snippets/utils/request-resolver";

export type IntrospectionResult =
  | { ok: true; introspection: IntrospectionQuery }
  | { ok: false; error: string };

function setJsonContentType(headers: Record<string, string>) {
  Object.keys(headers).forEach((key) => {
    if (key.toLowerCase() === "content-type") delete headers[key];
  });
  headers["Content-Type"] = "application/json";
}

/**
 * Runs a standard GraphQL introspection query against a request's own
 * (resolved) URL — same header/auth/pre-request-script resolution a real
 * send would use (via buildResolvedRequestArtifacts, same as executor.ts),
 * but with its own body instead of the request's current query/variables
 * draft.
 */
export async function fetchIntrospectionSchema(
  request: ApiRequest,
  environment: Environment | null,
  ancestors: RequestAncestors,
): Promise<IntrospectionResult> {
  const initialResolve = buildResolvedRequestArtifacts(request, environment, ancestors);
  if (!initialResolve.url) return { ok: false, error: "This request has no URL to introspect." };

  const { getIntrospectionQuery } = await import("graphql");
  const body = JSON.stringify({ query: getIntrospectionQuery() });

  const headersForScript = { ...initialResolve.resolvedHeaders };
  setJsonContentType(headersForScript);
  const scriptOutcome = await applyPreRequestScript(
    request,
    environment,
    initialResolve,
    { method: "POST", headers: headersForScript, body },
    ancestors,
  );
  if (scriptOutcome.scriptError) {
    return { ok: false, error: `Pre-request script failed: ${scriptOutcome.scriptError}` };
  }

  const { resolved, scriptHeaderPatch } = scriptOutcome;
  if (!resolved.url) return { ok: false, error: "This request has no URL to introspect." };

  const headers = { ...resolved.resolvedHeaders };
  setJsonContentType(headers);
  if (scriptHeaderPatch) Object.assign(headers, scriptHeaderPatch);

  // Through reqlo's own proxy, exactly like a normal send (executor.ts) — an
  // introspection call is a cross-origin POST like any other, and pointing it
  // straight at the endpoint would put the CORS wall back in front of the one
  // feature that exists to read a third-party schema.
  let res: Response;
  try {
    res = await fetchViaProxy(resolved.url, { method: "POST", headers, body });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Request failed: ${msg}. Check the URL or network.` };
  }
  if (!res.headers.has(PROXIED_HEADER)) {
    return { ok: false, error: new ProxyUnavailableError().message };
  }

  if (!res.ok) {
    return { ok: false, error: `Server responded with ${res.status} ${res.statusText}.` };
  }

  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    return { ok: false, error: "Response wasn't valid JSON." };
  }

  const introspection = extractIntrospection(parsed);
  if (!introspection) {
    return { ok: false, error: describeNonIntrospectionResponse(parsed) };
  }

  return { ok: true, introspection };
}

function extractIntrospection(parsed: unknown): IntrospectionQuery | null {
  if (!parsed || typeof parsed !== "object") return null;
  const data = (parsed as Record<string, unknown>).data;
  if (!data || typeof data !== "object") return null;
  const schema = (data as Record<string, unknown>).__schema;
  if (!schema || typeof schema !== "object") return null;
  return data as unknown as IntrospectionQuery;
}

function describeNonIntrospectionResponse(parsed: unknown): string {
  if (parsed && typeof parsed === "object") {
    const errors = (parsed as Record<string, unknown>).errors;
    if (Array.isArray(errors) && errors.length) {
      const messages = errors
        .map((e) => (e && typeof e === "object" ? (e as Record<string, unknown>).message : null))
        .filter((m): m is string => typeof m === "string");
      if (messages.length) return `Server rejected introspection: ${messages.join("; ")}`;
    }
  }
  return "Response doesn't look like a GraphQL introspection result.";
}
