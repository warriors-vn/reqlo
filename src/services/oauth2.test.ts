import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchClientCredentialsToken, refreshOAuth2Token } from "@/services/oauth2";
import { PROXIED_HEADER, PROXY_TARGET_HEADER } from "@/services/proxy-constants";
import type { OAuth2Config } from "@/services/db";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", [PROXIED_HEADER]: "1" },
  });
}

function makeConfig(overrides: Partial<OAuth2Config> = {}): OAuth2Config {
  return {
    grantType: "authorization_code",
    tokenUrl: "https://provider.example.com/oauth/token",
    clientId: "client-1",
    cachedToken: {
      accessToken: "old-access-token",
      tokenType: "Bearer",
      expiresAt: Date.now() - 1000,
      refreshToken: "original-refresh-token",
      environmentId: null,
      fetchedAt: Date.now() - 5000,
    },
    ...overrides,
  };
}

describe("refreshOAuth2Token", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves the original refresh token when the provider omits one on refresh", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ access_token: "new-access-token", token_type: "bearer", expires_in: 3600 }),
      ),
    );

    const token = await refreshOAuth2Token(makeConfig(), null);

    expect(token.accessToken).toBe("new-access-token");
    expect(token.refreshToken).toBe("original-refresh-token");
  });

  it("uses the provider's new refresh token when one is returned", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          access_token: "new-access-token",
          token_type: "bearer",
          expires_in: 3600,
          refresh_token: "rotated-refresh-token",
        }),
      ),
    );

    const token = await refreshOAuth2Token(makeConfig(), null);

    expect(token.refreshToken).toBe("rotated-refresh-token");
  });

  it("throws without calling the network when there is no refresh token to send", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const config = makeConfig({
      cachedToken: {
        accessToken: "old-access-token",
        tokenType: "Bearer",
        expiresAt: Date.now() - 1000,
        refreshToken: undefined,
        environmentId: null,
        fetchedAt: Date.now() - 5000,
      },
    });

    await expect(refreshOAuth2Token(config, null)).rejects.toThrow(/no refresh token/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends the token request through /api/proxy rather than straight to the provider", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ access_token: "t", token_type: "bearer", expires_in: 60 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await refreshOAuth2Token(makeConfig(), null);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/proxy");
    const headers = new Headers(init?.headers);
    expect(headers.get(PROXY_TARGET_HEADER)).toBe("https://provider.example.com/oauth/token");
    expect(init?.method).toBe("POST");
    expect(String(init?.body)).toContain("grant_type=refresh_token");
  });

  it("fetches a client-credentials token through the proxy too", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ access_token: "cc", token_type: "bearer" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const token = await fetchClientCredentialsToken(
      makeConfig({ grantType: "client_credentials" }),
      null,
    );

    expect(token.accessToken).toBe("cc");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/proxy");
  });

  it("explains that reqlo has no server when the proxy marker header is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html></html>", { status: 200 })),
    );

    await expect(refreshOAuth2Token(makeConfig(), null)).rejects.toThrow(/no server behind it/i);
  });

  it("lets an abort through unchanged instead of blaming the server", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("Request cancelled.", "AbortError");
      }),
    );

    await expect(refreshOAuth2Token(makeConfig(), null)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
