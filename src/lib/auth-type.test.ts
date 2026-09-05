import { describe, expect, it } from "vitest";
import { authForType } from "@/lib/auth-type";
import type { RequestAuth } from "@/services/db";

describe("authForType", () => {
  // The bug this function was extracted for: "inherit" and "none" are the two
  // field-less types, and a ternary chain ending in a literal { type: "none" }
  // collapsed them — so picking Inherit in the editor silently selected No
  // Auth and the inheritance banner never appeared.
  it("keeps inherit distinct from none", () => {
    expect(authForType("inherit", { type: "none" })).toEqual({ type: "inherit" });
    expect(authForType("none", { type: "inherit" })).toEqual({ type: "none" });
  });

  it("drops the previous type's fields when switching to a field-less type", () => {
    const bearer: RequestAuth = { type: "bearer", token: "secret" };
    expect(authForType("inherit", bearer)).toEqual({ type: "inherit" });
  });

  it("carries a token across a round trip through another type", () => {
    const bearer: RequestAuth = { type: "bearer", token: "keep-me" };
    const apiKey = authForType("api-key", bearer);
    expect(apiKey).toEqual({ type: "api-key", key: "", value: "", addTo: "header" });
    // The editor spreads onto the request's stored auth, so a real round trip
    // still has `token` around to restore.
    expect(authForType("bearer", { ...bearer, ...apiKey })).toEqual({
      type: "bearer",
      token: "keep-me",
    });
  });

  it("seeds an OAuth2 config rather than leaving it undefined", () => {
    const result = authForType("oauth2", { type: "none" });
    expect(result.type).toBe("oauth2");
    expect(result.oauth2?.grantType).toBe("authorization_code");
  });

  it("defaults an API key to a header rather than a query param", () => {
    expect(authForType("api-key", { type: "none" }).addTo).toBe("header");
  });
});
