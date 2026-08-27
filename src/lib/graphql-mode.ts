import type { MonacoGraphQLAPI } from "monaco-graphql";

// `initializeMode()` can only run once globally — cached across calls so
// switching to a GraphQL request with a fetched schema (or back to a
// schema-less one) just reconfigures the same registered mode instead of
// re-registering it. The `/lite` entry point is deliberately used over the
// default export — it skips a handful of extra Monaco editor contrib bundles
// (inline completions, clipboard, etc.) the `full` entry pulls in that this
// app's own editor chrome doesn't need.
let apiPromise: Promise<MonacoGraphQLAPI> | null = null;

export function getGraphQLModeApi(): Promise<MonacoGraphQLAPI> {
  if (!apiPromise) {
    apiPromise = import("monaco-graphql/lite").then(({ initializeMode }) =>
      initializeMode({ schemas: [] }),
    );
  }
  return apiPromise;
}
