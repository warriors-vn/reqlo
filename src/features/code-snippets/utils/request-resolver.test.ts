import { describe, expect, it } from "vitest";
import {
  createEnvironmentMap,
  mergeGlobalsIntoEnvironment,
  normalizeRequestUrl,
  resolveTemplate,
} from "./request-resolver";
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

describe("resolveTemplate", () => {
  const envMap = new Map([["HOST", "api.example.com"]]);

  it("substitutes a known variable and reports no misses", () => {
    const misses = new Set<string>();
    expect(resolveTemplate("https://{{HOST}}/todos", envMap, misses)).toBe(
      "https://api.example.com/todos",
    );
    expect([...misses]).toEqual([]);
  });

  // The empty substitution is deliberate — half-substituted output would be
  // worse — but it used to happen with no signal at all, so a request built
  // from a missing variable came back 200 and looked like a success.
  it("still substitutes an unknown variable with an empty string, but records the miss", () => {
    const misses = new Set<string>();
    expect(resolveTemplate("https://{{HOST}}/todos/{{TODO_ID}}", envMap, misses)).toBe(
      "https://api.example.com/todos/",
    );
    expect([...misses]).toEqual(["TODO_ID"]);
  });

  it("records every distinct missing key once, across repeated references", () => {
    const misses = new Set<string>();
    resolveTemplate("{{A}}/{{B}}/{{A}}", envMap, misses);
    expect([...misses].sort()).toEqual(["A", "B"]);
  });

  it("treats a variable explicitly set to an empty string as resolved, not missing", () => {
    const misses = new Set<string>();
    expect(resolveTemplate("x={{BLANK}}", new Map([["BLANK", ""]]), misses)).toBe("x=");
    expect([...misses]).toEqual([]);
  });

  it("works without a misses collector, for the preview/snippet callers", () => {
    expect(resolveTemplate("{{NOPE}}", envMap)).toBe("");
  });
});

describe("normalizeRequestUrl", () => {
  it("leaves a URL that already has a scheme alone", () => {
    expect(normalizeRequestUrl("https://api.example.com/todos")).toBe(
      "https://api.example.com/todos",
    );
    expect(normalizeRequestUrl("http://localhost:3000/api")).toBe("http://localhost:3000/api");
  });

  // Without this, fetch() resolves the bare host against the app's own origin
  // and returns reqlo's own 404 page as if the API had answered.
  it("prepends https:// to a bare host", () => {
    expect(normalizeRequestUrl("api.example.com/todos/1")).toBe("https://api.example.com/todos/1");
    expect(normalizeRequestUrl("jsonplaceholder.typicode.com")).toBe(
      "https://jsonplaceholder.typicode.com",
    );
  });

  // http, not https, for loopback — a local dev server almost never speaks
  // TLS. "localhost:8080" also has to survive the scheme check, which a bare
  // `scheme:` test would misread as scheme "localhost" + path "8080".
  it("prepends http:// to loopback hosts, with or without a port", () => {
    expect(normalizeRequestUrl("localhost:8080/health")).toBe("http://localhost:8080/health");
    expect(normalizeRequestUrl("localhost")).toBe("http://localhost");
    expect(normalizeRequestUrl("127.0.0.1:5173")).toBe("http://127.0.0.1:5173");
  });

  it("leaves an explicitly relative URL alone", () => {
    expect(normalizeRequestUrl("/api/todos")).toBe("/api/todos");
  });

  it("leaves a schemeless path with no host-looking first segment alone", () => {
    expect(normalizeRequestUrl("todos/1")).toBe("todos/1");
  });

  it("trims and passes an empty URL straight through", () => {
    expect(normalizeRequestUrl("   ")).toBe("");
    expect(normalizeRequestUrl("  api.example.com  ")).toBe("https://api.example.com");
  });
});
