// Request scripting, sandboxed via QuickJS-in-wasm. The interpreter has no
// ambient fetch/DOM/storage — nothing is bound into it, so a script genuinely
// cannot make network calls or touch app data beyond what's passed in below.
// This is deliberately separate from Extract/Tests' no-eval path-rule system.
//
// Two phases share one interpreter and one contract: a pre-request script sees
// the request about to go out, a post-response script sees the response that
// came back and can additionally declare pass/fail tests.

import type { QuickJSWASMModule } from "quickjs-emscripten-core";

const SCRIPT_TIMEOUT_MS = 2000;

export interface ScriptContext {
  method: string;
  url: string;
  headers: Record<string, string>;
  /** Only present for string-bodied requests (json/raw/xml/urlencoded/graphql). */
  body: string | null;
  environment: Record<string, string>;
}

/** What a post-response script gets in addition to the request context. */
export interface ScriptResponseContext {
  status: number | null;
  statusText: string;
  ok: boolean;
  durationMs: number;
  headers: Record<string, string>;
  body: string;
}

/** One `test("name", fn)` call's outcome. A test fails by throwing — including
 * the assertion helpers below — so the script reads like any other test file
 * rather than having to hand-build a result array. */
export interface ScriptTestResult {
  name: string;
  passed: boolean;
  message: string;
}

export interface ScriptResult {
  headers?: Record<string, string>;
  environment?: Record<string, string>;
  tests?: ScriptTestResult[];
  error?: string;
}

// Cached across calls so running a collection with many scripted requests
// doesn't re-instantiate the WASM module (loader + compile + link) per
// request. Deliberately hand-rolled rather than the library's own
// memoizePromiseFactory, which caches a rejection forever — a transient load
// failure here shouldn't lock out scripting for the rest of the session.
let modulePromise: Promise<QuickJSWASMModule> | null = null;
function loadQuickJS(): Promise<QuickJSWASMModule> {
  if (!modulePromise) {
    modulePromise = (async () => {
      const [{ newQuickJSWASMModuleFromVariant }, { default: variant }] = await Promise.all([
        import("quickjs-emscripten-core"),
        import("@jitl/quickjs-wasmfile-release-sync"),
      ]);
      return newQuickJSWASMModuleFromVariant(variant);
    })().catch((e: unknown) => {
      modulePromise = null;
      throw e;
    });
  }
  return modulePromise;
}

export function runPreRequestScript(source: string, context: ScriptContext): Promise<ScriptResult> {
  return runScript(source, context, null);
}

export function runPostResponseScript(
  source: string,
  context: ScriptContext,
  response: ScriptResponseContext,
): Promise<ScriptResult> {
  return runScript(source, context, response);
}

/**
 * `response` being non-null is what makes this the post-response phase: the
 * harness then exposes `response` plus the `test`/`expect` helpers, and
 * collects whatever tests ran. Both phases otherwise share the same
 * interpreter setup, timeout, and return-value validation, so a fix to one
 * can't drift out of sync with the other.
 */
async function runScript(
  source: string,
  context: ScriptContext,
  response: ScriptResponseContext | null,
): Promise<ScriptResult> {
  let QuickJS: QuickJSWASMModule;
  try {
    QuickJS = await loadQuickJS();
  } catch (e) {
    return { error: `Couldn't start the script sandbox: ${errorMessage(e)}` };
  }

  const vm = QuickJS.newContext();
  try {
    const { shouldInterruptAfterDeadline } = await import("quickjs-emscripten-core");
    vm.runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + SCRIPT_TIMEOUT_MS));

    const ctxHandle = vm.newString(JSON.stringify(context));
    vm.setProp(vm.global, "__CTX__", ctxHandle);
    ctxHandle.dispose();

    const responseHandle = vm.newString(JSON.stringify(response));
    vm.setProp(vm.global, "__RES__", responseHandle);
    responseHandle.dispose();

    const harness = `
      (function () {
        const request = JSON.parse(__CTX__);
        const environment = request.environment;
        const response = JSON.parse(__RES__);
        const __tests__ = [];

        // A test fails by throwing, so a bare "throw new Error(...)" works and
        // the helpers below are just sugar over it. Everything is collected
        // rather than aborting the script: one failing check shouldn't hide
        // the results of the ones after it.
        function test(name, fn) {
          try {
            fn();
            __tests__.push({ name: String(name), passed: true, message: "" });
          } catch (e) {
            __tests__.push({
              name: String(name),
              passed: false,
              message: (e && e.message) ? String(e.message) : String(e),
            });
          }
        }

        function expect(actual) {
          const show = (v) => {
            try { return JSON.stringify(v); } catch (_) { return String(v); }
          };
          return {
            toBe(expected) {
              if (actual !== expected) {
                throw new Error("expected " + show(expected) + " but got " + show(actual));
              }
            },
            toEqual(expected) {
              if (JSON.stringify(actual) !== JSON.stringify(expected)) {
                throw new Error("expected " + show(expected) + " but got " + show(actual));
              }
            },
            toContain(needle) {
              const ok = typeof actual === "string"
                ? actual.indexOf(needle) !== -1
                : Array.isArray(actual) && actual.indexOf(needle) !== -1;
              if (!ok) throw new Error(show(actual) + " does not contain " + show(needle));
            },
            toBeTruthy() {
              if (!actual) throw new Error("expected a truthy value, got " + show(actual));
            },
          };
        }

        function __run__() {
          ${source}
        }
        const result = __run__();
        const out = (result === undefined || result === null) ? {} : result;
        if (typeof out !== "object" || Array.isArray(out)) return JSON.stringify(out);
        if (__tests__.length) out.tests = __tests__;
        return JSON.stringify(out);
      })();
    `;

    const evalResult = vm.evalCode(harness);
    if (evalResult.error) {
      const dumped = vm.dump(evalResult.error);
      evalResult.error.dispose();
      return { error: describeVmError(dumped) };
    }

    const raw = vm.dump(evalResult.value);
    evalResult.value.dispose();

    if (typeof raw !== "string") {
      return { error: "Script must return a plain object (or nothing)." };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { error: "Script's return value isn't JSON-serializable." };
    }

    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { error: "Script must return a plain object (or nothing)." };
    }

    const { headers, environment, tests } = parsed as Record<string, unknown>;
    const result: ScriptResult = {};
    if (Array.isArray(tests)) result.tests = tests as ScriptTestResult[];
    if (headers !== undefined) {
      if (!isStringRecord(headers)) return { error: "Returned `headers` must be a string map." };
      result.headers = headers;
    }
    if (environment !== undefined) {
      if (!isStringRecord(environment)) {
        return { error: "Returned `environment` must be a string map." };
      }
      result.environment = environment;
    }
    return result;
  } catch (e) {
    return { error: errorMessage(e) };
  } finally {
    vm.dispose();
  }
}

function describeVmError(dumped: unknown): string {
  if (typeof dumped === "string") return timeoutAwareMessage(dumped);
  if (dumped && typeof dumped === "object") {
    const message = (dumped as { message?: unknown }).message;
    if (typeof message === "string") return timeoutAwareMessage(message);
    try {
      return timeoutAwareMessage(JSON.stringify(dumped));
    } catch {
      // fall through to the generic message below
    }
  }
  if (typeof dumped === "number" || typeof dumped === "boolean") {
    return timeoutAwareMessage(String(dumped));
  }
  return "Script failed to run.";
}

function timeoutAwareMessage(message: string): string {
  return message.toLowerCase().includes("interrupted")
    ? `Script timed out after ${SCRIPT_TIMEOUT_MS / 1000}s.`
    : message;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((v) => typeof v === "string");
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
