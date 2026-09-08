// The barrel `monaco-editor` entry point (editor.main.js) pulls in the CSS,
// HTML and TypeScript language *services* alongside the editor core, and
// none of the three are ever used here (see below). Importing the core
// directly and registering only what this app actually needs — the basic
// (Monarch) tokenizers, used for the script/body editors' plain syntax
// highlighting, and the JSON language service, used for JSON body/schema
// editing — drops the three unused services' own chunks (cssMode, htmlMode,
// tsMode) from the build entirely. The bulk of the remaining monaco.contribution
// chunk is the editor core itself plus the 82 basic-language registrations,
// not those three services, so this trims the build's chunk count and dead
// weight rather than shrinking that one chunk's size.
import * as monaco from "monaco-editor/esm/vs/editor/edcore.main.js";
import "monaco-editor/esm/vs/basic-languages/monaco.contribution.js";
import "monaco-editor/esm/vs/language/json/monaco.contribution.js";
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
// Only the editor's own worker, the JSON language worker, and (opt-in, see
// graphql-mode.ts) the GraphQL language worker are registered — this app
// never edits CSS/HTML/TypeScript, so pulling in those (and TypeScript's
// language service in particular, one of the largest pieces of Monaco) would
// be dead weight the "lightweight" pitch can't afford.
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
        : label === "graphql"
          ? new URL("monaco-graphql/esm/graphql.worker.js", import.meta.url)
          : new URL("monaco-editor/esm/vs/editor/editor.worker.js", import.meta.url);
    return new Worker(url, { type: "module" });
  },
};

loader.config({ monaco });
