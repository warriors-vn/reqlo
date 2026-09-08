// monaco-editor only ships a single .d.ts (editor.api.d.ts, surfaced under the
// bare "monaco-editor" specifier). Importing its runtime submodules directly —
// done in monaco-setup.ts to avoid the barrel entry's CSS/HTML/TypeScript
// language services — has no matching declaration file of its own, so these
// point TypeScript at the same public API type the bare specifier already has.
declare module "monaco-editor/esm/vs/editor/edcore.main.js" {
  export * from "monaco-editor";
}
declare module "monaco-editor/esm/vs/basic-languages/monaco.contribution.js" {}
declare module "monaco-editor/esm/vs/language/json/monaco.contribution.js" {}
