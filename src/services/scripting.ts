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

/** One `console.*` call. QuickJS ships no console, so the harness provides
 * one — without it the first `console.log` anyone types fails the script. */
export interface ScriptLogEntry {
  level: "log" | "info" | "warn" | "error";
  text: string;
}

export interface ScriptResult {
  headers?: Record<string, string>;
  environment?: Record<string, string>;
  tests?: ScriptTestResult[];
  logs?: ScriptLogEntry[];
  error?: string;
}

/** What the harness hands back to the host. Tests and logs travel with every
 * outcome — including a script that threw — so a stray error doesn't erase
 * the ten tests that ran before it and would have explained it. */
interface HarnessEnvelope {
  threw: boolean;
  thrown?: unknown;
  unserializable?: boolean;
  value?: unknown;
  tests: ScriptTestResult[];
  logs: ScriptLogEntry[];
  /** `environment` as the script left it, for the host to diff against what it
   * was given: `environment.token = x` looks like it works, and silently
   * discarding it was the trap. */
  environment: Record<string, unknown>;
}

const MAX_LOG_ENTRIES = 200;
const MAX_LOG_LENGTH = 2000;

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
        const __logs__ = [];

        // Lazy and memoized: a body that isn't JSON only throws if the script
        // actually asks for it.
        if (response) {
          let parsed, done = false;
          Object.defineProperty(response, "json", {
            enumerable: false,
            value: function () {
              if (!done) { parsed = JSON.parse(response.body); done = true; }
              return parsed;
            },
          });
        }

        // env.set/get are sugar over the same object, so the host's diff sees
        // them exactly like a direct assignment.
        const env = {
          get(key) { return environment[key]; },
          set(key, value) { environment[String(key)] = String(value); },
        };

        function __format__(v) {
          if (typeof v === "string") return v;
          if (v instanceof Error) return v.message ? v.name + ": " + v.message : String(v);
          try {
            const j = JSON.stringify(v);
            return j === undefined ? String(v) : j;
          } catch (_) { return String(v); }
        }
        function __logger__(level) {
          return function () {
            if (__logs__.length >= ${MAX_LOG_ENTRIES}) return;
            const text = Array.prototype.map.call(arguments, __format__).join(" ");
            __logs__.push({ level, text: text.length > ${MAX_LOG_LENGTH} ? text.slice(0, ${MAX_LOG_LENGTH}) + "…" : text });
          };
        }
        const console = {
          log: __logger__("log"),
          debug: __logger__("log"),
          info: __logger__("info"),
          warn: __logger__("warn"),
          error: __logger__("error"),
        };

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
        const envelope = { threw: false, tests: __tests__, logs: __logs__, environment };
        try {
          const result = __run__();
          const out = (result === undefined || result === null) ? {} : result;
          try {
            JSON.stringify(out);
            envelope.value = out;
          } catch (_) {
            envelope.unserializable = true;
          }
        } catch (e) {
          envelope.threw = true;
          envelope.thrown = (e && typeof e === "object" && typeof e.message === "string")
            ? e.message
            : e;
        }
        try {
          return JSON.stringify(envelope);
        } catch (_) {
          // A thrown/returned value that can't be serialized shouldn't take the
          // tests and logs down with it.
          envelope.thrown = String(envelope.thrown);
          envelope.value = undefined;
          envelope.unserializable = true;
          return JSON.stringify(envelope);
        }
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

    let envelope: HarnessEnvelope;
    try {
      envelope = JSON.parse(raw as string) as HarnessEnvelope;
    } catch {
      return { error: "Script's return value isn't JSON-serializable." };
    }

    const result: ScriptResult = {};
    if (envelope.tests?.length) result.tests = envelope.tests;
    if (envelope.logs?.length) result.logs = envelope.logs;

    if (envelope.threw) return { ...result, error: describeVmError(envelope.thrown) };
    if (envelope.unserializable) {
      return { ...result, error: "Script's return value isn't JSON-serializable." };
    }

    const value = envelope.value;
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return { ...result, error: "Script must return a plain object (or nothing)." };
    }

    const { headers, environment } = value as Record<string, unknown>;
    if (headers !== undefined) {
      if (!isStringRecord(headers)) {
        return { ...result, error: "Returned `headers` must be a string map." };
      }
      result.headers = headers;
    }
    if (environment !== undefined && !isStringRecord(environment)) {
      return { ...result, error: "Returned `environment` must be a string map." };
    }
    // An explicit return wins over what was mutated in place.
    const patch = { ...diffEnvironment(context.environment, envelope.environment), ...environment };
    if (Object.keys(patch).length) result.environment = patch;
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

/** Keys the script added or changed on `environment`, as strings. A deletion
 * isn't a patch this contract can express, so it's ignored. */
function diffEnvironment(
  before: Record<string, string>,
  after: Record<string, unknown> | undefined,
): Record<string, string> {
  const patch: Record<string, string> = {};
  for (const [key, value] of Object.entries(after ?? {})) {
    if (value === undefined || value === null || typeof value === "object") continue;
    const next = String(value);
    if (before[key] !== next) patch[key] = next;
  }
  return patch;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((v) => typeof v === "string");
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
