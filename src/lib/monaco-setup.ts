import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";

declare global {
  interface Window {
    MonacoEnvironment?: monaco.Environment;
  }
}

// @monaco-editor/react defaults to fetching Monaco's core from a CDN
// (cdn.jsdelivr.net) at runtime, which silently breaks offline use — the
// opposite of what a local-first app promises. Point it at the `monaco-editor`
// package already bundled with the app instead, so it ships in our own chunks
// and works with the wifi off.
//
// Only the editor's own worker plus the JSON language worker are registered —
// this app never edits CSS/HTML/TypeScript, so pulling in those (and
// TypeScript's language service in particular, one of the largest pieces of
// Monaco) would be dead weight the "lightweight" pitch can't afford.
//
// Workers are constructed via `new URL(..., import.meta.url)` rather than
// Vite's `?worker` import suffix — that suffix is picked up by a project-wide
// static scan that ships the worker chunks into every build output regardless
// of whether the importing module is ever reachable there, which defeated the
// `import.meta.env.SSR` guard in the lazy editor wrappers and put ~600KB of
// dead worker code in the Cloudflare Worker bundle.
self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    const url =
      label === "json"
        ? new URL("monaco-editor/esm/vs/language/json/json.worker.js", import.meta.url)
        : new URL("monaco-editor/esm/vs/editor/editor.worker.js", import.meta.url);
    return new Worker(url, { type: "module" });
  },
};

loader.config({ monaco });
