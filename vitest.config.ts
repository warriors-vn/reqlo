import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    // e2e/**/*.spec.ts are Playwright specs (see playwright.config.ts) — both
    // tools default to matching *.spec.ts, so without this vitest tries to
    // run them too and fails immediately (test() called outside Playwright's
    // own runner). Vitest's own defaults ("**/node_modules/**", "**/.git/**")
    // are repeated here since setting `exclude` replaces them rather than
    // adding to them.
    exclude: ["**/node_modules/**", "**/.git/**", "e2e/**"],
  },
});
