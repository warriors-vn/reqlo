import { NO_ANCESTORS } from "@/services/inheritance";
import { PROXIED_HEADER, PROXY_TARGET_HEADER } from "@/services/proxy-constants";
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeApiRequest, uid, type ApiRequest, type Environment } from "@/services/db";
import { fetchIntrospectionSchema } from "@/services/graphql-introspection";

function makeRequest(overrides: Partial<ApiRequest> = {}): ApiRequest {
  const now = Date.now();
  return normalizeApiRequest({
    id: uid(),
    workspaceId: "ws-1",
    name: "GraphQL request",
    method: "POST",
    url: "https://api.example.com/graphql",
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

// Introspection goes through /api/proxy like any other send, and the client
// treats a response without this marker as "this deployment has no proxy".
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", [PROXIED_HEADER]: "1" },
  });
}

const VALID_INTROSPECTION = {
  __schema: {
    queryType: { name: "Query" },
    mutationType: null,
    subscriptionType: null,
    types: [],
    directives: [],
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchIntrospectionSchema", () => {
  it("returns the introspection result for a valid response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ data: VALID_INTROSPECTION })),
    );
    const result = await fetchIntrospectionSchema(makeRequest(), makeEnv(), NO_ANCESTORS);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.introspection.__schema.queryType.name).toBe("Query");
  });

  it("POSTs an introspection query to the request's resolved URL with its headers/auth", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ data: VALID_INTROSPECTION }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const request = makeRequest({
      url: "https://api.example.com/{{path}}",
      headers: [{ id: "h1", key: "X-Api-Key", value: "{{apiKey}}", enabled: true }],
      auth: { type: "bearer", token: "{{token}}" },
    });
    const environment = makeEnv({
      variables: [
        { id: "v1", key: "path", value: "graphql", enabled: true },
        { id: "v2", key: "apiKey", value: "secret-key", enabled: true },
        { id: "v3", key: "token", value: "abc123", enabled: true },
      ],
    });

    await fetchIntrospectionSchema(request, environment, NO_ANCESTORS);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/proxy");
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    expect(headers.get(PROXY_TARGET_HEADER)).toBe("https://api.example.com/graphql");
    expect(headers.get("X-Api-Key")).toBe("secret-key");
    expect(headers.get("Authorization")).toBe("Bearer abc123");
    const body = JSON.parse(init?.body as string);
    expect(typeof body.query).toBe("string");
    expect(body.query).toContain("__schema");
  });

  it("rejects a response that isn't shaped like an introspection result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ data: { user: { id: "1" } } })),
    );
    const result = await fetchIntrospectionSchema(makeRequest(), makeEnv(), NO_ANCESTORS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/introspection/i);
  });

  it("reports a non-2xx HTTP status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "unauthorized" }, 401)),
    );
    const result = await fetchIntrospectionSchema(makeRequest(), makeEnv(), NO_ANCESTORS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("401");
  });

  it("reports a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const result = await fetchIntrospectionSchema(makeRequest(), makeEnv(), NO_ANCESTORS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("network down");
  });

  it("reports a non-JSON response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("<html>not json</html>", {
            status: 200,
            headers: { [PROXIED_HEADER]: "1" },
          }),
      ),
    );
    const result = await fetchIntrospectionSchema(makeRequest(), makeEnv(), NO_ANCESTORS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/JSON/i);
  });

  it("reports when the request has no URL", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchIntrospectionSchema(
      makeRequest({ url: "" }),
      makeEnv(),
      NO_ANCESTORS,
    );
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces the server's GraphQL errors when introspection is disabled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ errors: [{ message: "GraphQL introspection is not allowed" }] }),
      ),
    );
    const result = await fetchIntrospectionSchema(makeRequest(), makeEnv(), NO_ANCESTORS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("GraphQL introspection is not allowed");
  });

  it("doesn't send a duplicate Content-Type header when one already exists under a different case", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ data: VALID_INTROSPECTION }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const request = makeRequest({
      headers: [{ id: "h1", key: "content-type", value: "text/plain", enabled: true }],
    });

    await fetchIntrospectionSchema(request, makeEnv(), NO_ANCESTORS);

    const [, init] = fetchMock.mock.calls[0];
    // Headers collapses case-insensitive duplicates, so a single entry here is
    // exactly the "no duplicate Content-Type" guarantee this test is after.
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
  });

  it("runs an enabled pre-request script and applies its header patch to the introspection request", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ data: VALID_INTROSPECTION }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const request = makeRequest({
      preRequestScript: {
        enabled: true,
        source: `return { headers: { "X-Signature": "computed-" + request.method } };`,
      },
    });

    await fetchIntrospectionSchema(request, makeEnv(), NO_ANCESTORS);

    const [, init] = fetchMock.mock.calls[0];
    expect(new Headers(init?.headers).get("X-Signature")).toBe("computed-POST");
  });

  it("surfaces a pre-request script error instead of silently introspecting without it", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ data: VALID_INTROSPECTION }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const request = makeRequest({
      preRequestScript: { enabled: true, source: `throw new Error("signing key missing");` },
    });

    const result = await fetchIntrospectionSchema(request, makeEnv(), NO_ANCESTORS);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("signing key missing");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
