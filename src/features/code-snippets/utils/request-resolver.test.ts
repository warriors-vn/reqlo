import { describe, expect, it } from "vitest";
import { createEnvironmentMap, mergeGlobalsIntoEnvironment } from "./request-resolver";
import type { Environment, KV } from "@/services/db";

function makeKv(key: string, value: string, overrides: Partial<KV> = {}): KV {
  return { id: `${key}-id`, key, value, enabled: true, ...overrides };
}

function makeEnv(overrides: Partial<Environment> = {}): Environment {
  return {
    id: "env-1",
    workspaceId: "ws-1",
    name: "Local",
    variables: [],
    createdAt: 0,
    ...overrides,
  };
}

describe("mergeGlobalsIntoEnvironment", () => {
  it("returns the environment unchanged when there are no globals", () => {
    const env = makeEnv({ variables: [makeKv("a", "1")] });
    expect(mergeGlobalsIntoEnvironment(env, [])).toBe(env);
    expect(mergeGlobalsIntoEnvironment(null, [])).toBeNull();
  });

  it("synthesizes a minimal environment from globals alone when no environment is active", () => {
    const merged = mergeGlobalsIntoEnvironment(null, [makeKv("apiVersion", "v2")]);
    expect(merged).not.toBeNull();
    expect(merged!.variables).toEqual([makeKv("apiVersion", "v2")]);
    expect(createEnvironmentMap(merged).get("apiVersion")).toBe("v2");
  });

  it("merges globals into an existing environment's variables", () => {
    const env = makeEnv({ variables: [makeKv("token", "secret-abc")] });
    const merged = mergeGlobalsIntoEnvironment(env, [makeKv("apiVersion", "v2")]);
    const map = createEnvironmentMap(merged);
    expect(map.get("apiVersion")).toBe("v2");
    expect(map.get("token")).toBe("secret-abc");
  });

  it("lets an environment variable override a global with the same key", () => {
    const env = makeEnv({ variables: [makeKv("apiVersion", "v3-env-override")] });
    const merged = mergeGlobalsIntoEnvironment(env, [makeKv("apiVersion", "v2-global")]);
    expect(createEnvironmentMap(merged).get("apiVersion")).toBe("v3-env-override");
  });

  it("ignores disabled globals, matching createEnvironmentMap's own filtering", () => {
    const merged = mergeGlobalsIntoEnvironment(null, [makeKv("off", "x", { enabled: false })]);
    expect(createEnvironmentMap(merged).has("off")).toBe(false);
  });
});
