import { afterEach, describe, expect, it, vi } from "vitest";
import { refreshOAuth2Token } from "@/services/oauth2";
import type { OAuth2Config } from "@/services/db";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
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
});
