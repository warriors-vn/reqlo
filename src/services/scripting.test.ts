import { describe, expect, it } from "vitest";
import { runPreRequestScript, type ScriptContext } from "@/services/scripting";

function makeContext(overrides: Partial<ScriptContext> = {}): ScriptContext {
  return {
    method: "GET",
    url: "https://api.example.com/x",
    headers: {},
    body: null,
    environment: {},
    ...overrides,
  };
}

describe("runPreRequestScript", () => {
  it("returns a headers/environment patch computed from the injected context", async () => {
    const result = await runPreRequestScript(
      `return { headers: { "X-Signature": request.method + ":" + request.url }, environment: { nonce: "abc" } };`,
      makeContext({ method: "POST", url: "https://api.example.com/orders" }),
    );
    expect(result.error).toBeUndefined();
    expect(result.headers).toEqual({ "X-Signature": "POST:https://api.example.com/orders" });
    expect(result.environment).toEqual({ nonce: "abc" });
  });

  it("gives the script read access to environment variables", async () => {
    const result = await runPreRequestScript(
      `return { headers: { "X-Api-Key": environment.apiKey } };`,
      makeContext({ environment: { apiKey: "shh" } }),
    );
    expect(result.headers).toEqual({ "X-Api-Key": "shh" });
  });

  it("returns an empty result when the script returns nothing", async () => {
    const result = await runPreRequestScript(`const x = 1 + 1;`, makeContext());
    expect(result).toEqual({});
  });

  it("turns a thrown error into a result error instead of propagating", async () => {
    const result = await runPreRequestScript(`throw new Error("boom");`, makeContext());
    expect(result.error).toContain("boom");
    expect(result.headers).toBeUndefined();
  });

  it("preserves the message from a thrown plain string", async () => {
    const result = await runPreRequestScript(`throw "signing key missing";`, makeContext());
    expect(result.error).toContain("signing key missing");
  });

  it("preserves detail from a thrown plain object", async () => {
    const result = await runPreRequestScript(
      `throw { code: 500, reason: "no key" };`,
      makeContext(),
    );
    expect(result.error).toContain("no key");
  });

  it("rejects a non-object return value", async () => {
    const result = await runPreRequestScript(`return "not an object";`, makeContext());
    expect(result.error).toBeTruthy();
  });

  it("rejects a headers/environment value that isn't a string map", async () => {
    const result = await runPreRequestScript(`return { headers: { a: 1 } };`, makeContext());
    expect(result.error).toBeTruthy();
  });

  it("times out an infinite loop instead of hanging", async () => {
    const result = await runPreRequestScript(`while (true) {}`, makeContext());
    expect(result.error).toBeTruthy();
    expect(result.error).toMatch(/timed out/i);
  }, 10_000);

  it("has no access to fetch, document, or process inside the sandbox", async () => {
    const result = await runPreRequestScript(
      `return { headers: {
        hasFetch: String(typeof fetch !== "undefined"),
        hasDocument: String(typeof document !== "undefined"),
        hasProcess: String(typeof process !== "undefined"),
      } };`,
      makeContext(),
    );
    expect(result.headers).toEqual({
      hasFetch: "false",
      hasDocument: "false",
      hasProcess: "false",
    });
  });

  it("passes body as null for non-string body types (form-data/binary)", async () => {
    const result = await runPreRequestScript(
      `return { headers: { hasBody: String(request.body !== null) } };`,
      makeContext({ body: null }),
    );
    expect(result.headers).toEqual({ hasBody: "false" });
  });

  it("passes a string body through for text-based body types", async () => {
    const result = await runPreRequestScript(
      `return { headers: { bodyLen: String(request.body.length) } };`,
      makeContext({ body: '{"a":1}' }),
    );
    expect(result.headers).toEqual({ bodyLen: "7" });
  });
});
