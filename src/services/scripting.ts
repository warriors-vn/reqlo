// Pre-request scripting, sandboxed via QuickJS-in-wasm. The interpreter has no
// ambient fetch/DOM/storage — nothing is bound into it, so a script genuinely
// cannot make network calls or touch app data beyond what's passed in below.
// This is deliberately separate from Extract/Tests' no-eval path-rule system.

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

export interface ScriptResult {
  headers?: Record<string, string>;
  environment?: Record<string, string>;
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

export async function runPreRequestScript(
  source: string,
  context: ScriptContext,
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

    const harness = `
      (function () {
        const request = JSON.parse(__CTX__);
        const environment = request.environment;
        function __run__() {
          ${source}
        }
        const result = __run__();
        return JSON.stringify(result === undefined ? {} : result);
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

    const { headers, environment } = parsed as Record<string, unknown>;
    const result: ScriptResult = {};
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
