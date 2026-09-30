import { describe, expect, it } from "vitest";
import {
  runPostResponseScript,
  runPreRequestScript,
  type ScriptContext,
  type ScriptResponseContext,
} from "@/services/scripting";

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

function makeResponse(overrides: Partial<ScriptResponseContext> = {}): ScriptResponseContext {
  return {
    status: 200,
    statusText: "OK",
    ok: true,
    durationMs: 12,
    headers: { "content-type": "application/json" },
    body: `{"token":"abc","items":[1,2,3]}`,
    ...overrides,
  };
}

const run = (source: string, response = makeResponse(), context = makeContext()) =>
  runPostResponseScript(source, context, response);

describe("runPostResponseScript — the response context", () => {
  it("exposes status, ok, headers and body", async () => {
    const result = await run(`
      return { environment: {
        status: String(response.status),
        ok: String(response.ok),
        type: response.headers["content-type"],
        token: JSON.parse(response.body).token,
      } };
    `);
    expect(result.error).toBeUndefined();
    expect(result.environment).toEqual({
      status: "200",
      ok: "true",
      type: "application/json",
      token: "abc",
    });
  });

  it("still exposes the request and environment the pre-request phase gets", async () => {
    const result = await run(
      `return { environment: { seen: request.method + "|" + environment.BASE } };`,
      makeResponse(),
      makeContext({ method: "DELETE", environment: { BASE: "prod" } }),
    );
    expect(result.environment).toEqual({ seen: "DELETE|prod" });
  });
});

describe("runPostResponseScript — test()", () => {
  it("records a passing and a failing test rather than stopping at the first failure", async () => {
    const result = await run(`
      test("first passes", () => expect(response.status).toBe(200));
      test("second fails", () => expect(response.status).toBe(404));
      test("third still runs", () => expect(response.ok).toBeTruthy());
    `);

    expect(result.error).toBeUndefined();
    expect(result.tests?.map((t) => [t.name, t.passed])).toEqual([
      ["first passes", true],
      ["second fails", false],
      ["third still runs", true],
    ]);
    expect(result.tests?.[1].message).toContain("expected 404");
    expect(result.tests?.[1].message).toContain("got 200");
  });

  it("treats a bare throw as a failure, so expect() is sugar and not a requirement", async () => {
    const result = await run(`test("manual", () => { throw new Error("nope"); });`);
    expect(result.tests).toEqual([{ name: "manual", passed: false, message: "nope" }]);
  });

  it("reports no tests when the script declares none", async () => {
    const result = await run(`return { environment: { a: "b" } };`);
    expect(result.tests).toBeUndefined();
  });

  it("keeps tests that ran even when the script throws afterwards", async () => {
    const result = await run(`
      test("ran before the blowup", () => expect(response.ok).toBeTruthy());
      throw new Error("boom");
    `);
    expect(result.error).toBe("boom");
  });

  it.each([
    [`expect(1).toBe(1)`, true],
    [`expect(1).toBe(2)`, false],
    [`expect({ a: 1 }).toEqual({ a: 1 })`, true],
    [`expect({ a: 1 }).toEqual({ a: 2 })`, false],
    [`expect("hello world").toContain("world")`, true],
    [`expect("hello world").toContain("nope")`, false],
    [`expect([1, 2]).toContain(2)`, true],
    [`expect([1, 2]).toContain(9)`, false],
    [`expect("x").toBeTruthy()`, true],
    [`expect("").toBeTruthy()`, false],
  ])("matcher %s → passed=%s", async (expression, passed) => {
    const result = await run(`test("m", () => { ${expression}; });`);
    expect(result.tests?.[0].passed).toBe(passed);
  });
});

describe("runPostResponseScript — the sandbox still holds", () => {
  it("has no fetch, document or process", async () => {
    const result = await run(`
      return { environment: {
        fetch: typeof fetch,
        document: typeof document,
        process: typeof process,
      } };
    `);
    expect(result.environment).toEqual({
      fetch: "undefined",
      document: "undefined",
      process: "undefined",
    });
  });

  it("times out an infinite loop instead of hanging", async () => {
    const result = await run(`test("spin", () => { while (true) {} });`);
    expect(result.error).toMatch(/timed out/i);
  }, 10_000);
});

describe("runPreRequestScript — unchanged by the shared harness", () => {
  // The two phases now share one implementation; the pre-request phase must
  // not start seeing a response, and its test()/expect() helpers exist but
  // have nothing to assert against.
  it("sees response as null", async () => {
    const result = await runPreRequestScript(
      `return { environment: { hasResponse: String(response !== null) } };`,
      makeContext(),
    );
    expect(result.environment).toEqual({ hasResponse: "false" });
  });
});

describe("a script that throws outside test()", () => {
  it("keeps the tests that ran before the error", async () => {
    const result = await run(`
      test("status is 200", () => expect(response.status).toBe(200));
      test("status is 201", () => expect(response.status).toBe(201));
      JSON.parse("<html>401</html>");
      test("never reached", () => {});
    `);
    expect(result.error).toBeTruthy();
    expect(result.tests?.map((t) => [t.name, t.passed])).toEqual([
      ["status is 200", true],
      ["status is 201", false],
    ]);
  });

  it("still reports the message of a thrown string or object", async () => {
    expect((await run(`throw "boom";`)).error).toBe("boom");
    expect((await run(`throw { message: "nope" };`)).error).toBe("nope");
  });

  it("keeps the tests when the return value can't be serialized", async () => {
    const result = await run(`
      test("ran", () => {});
      const a = {}; a.self = a;
      return a;
    `);
    expect(result.error).toMatch(/serializable/);
    expect(result.tests).toEqual([{ name: "ran", passed: true, message: "" }]);
  });
});

describe("console", () => {
  it("collects console output instead of failing with 'console is not defined'", async () => {
    const result = await run(`
      console.log("body:", response.body.length, { a: 1 });
      console.warn("careful");
      console.error(new Error("bad"));
    `);
    expect(result.error).toBeUndefined();
    expect(result.logs).toEqual([
      { level: "log", text: 'body: 31 {"a":1}' },
      { level: "warn", text: "careful" },
      { level: "error", text: "Error: bad" },
    ]);
  });

  it("works in the pre-request phase and survives an error", async () => {
    const result = await runPreRequestScript(
      `console.log("before"); throw new Error("x");`,
      makeContext(),
    );
    expect(result.error).toBe("x");
    expect(result.logs).toEqual([{ level: "log", text: "before" }]);
  });

  it("caps runaway logging", async () => {
    const result = await run(`for (let i = 0; i < 10000; i++) console.log(i);`);
    expect(result.logs).toHaveLength(200);
  });
});

describe("environment mutation", () => {
  it("persists an assignment to environment, which used to be silently dropped", async () => {
    const result = await runPreRequestScript(
      `environment.token = "abc"; environment.n = 5;`,
      makeContext({ environment: { keep: "1" } }),
    );
    expect(result.environment).toEqual({ token: "abc", n: "5" });
  });

  it("supports env.set / env.get", async () => {
    const result = await run(
      `
      env.set("token", JSON.parse(response.body).token);
      env.set("seen", env.get("prev"));
    `,
      makeResponse(),
      makeContext({ environment: { prev: "p" } }),
    );
    expect(result.environment).toEqual({ token: "abc", seen: "p" });
  });

  it("leaves unchanged values out of the patch, and lets an explicit return win", async () => {
    const result = await runPreRequestScript(
      `environment.a = "2"; environment.b = "changed"; return { environment: { a: "explicit" } };`,
      makeContext({ environment: { a: "1", b: "b", c: "c" } }),
    );
    expect(result.environment).toEqual({ a: "explicit", b: "changed" });
    expect(
      (await runPreRequestScript(`return {};`, makeContext({ environment: { a: "1" } })))
        .environment,
    ).toBeUndefined();
  });
});

describe("response.json()", () => {
  it("parses the body once, lazily", async () => {
    const result = await run(`
      return { environment: { first: response.json().items[1] + "", same: String(response.json() === response.json()) } };
    `);
    expect(result.environment).toEqual({ first: "2", same: "true" });
  });

  it("only throws if the script asks for a body that isn't JSON", async () => {
    const html = makeResponse({ body: "<html/>" });
    expect((await run(`test("t", () => {});`, html)).error).toBeUndefined();
    expect((await run(`response.json();`, html)).error).toBeTruthy();
  });
});
