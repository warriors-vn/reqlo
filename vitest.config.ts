import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    // Above vitest's 5s default. The jsdom component tests render the real
    // component tree — Radix, framer-motion and the full store — and drive it
    // through userEvent, so a single test can be dozens of renders. Those run
    // in well under a second on an idle machine but had been intermittently
    // blowing 5s when the whole suite runs in parallel under load, which
    // showed up as two long-standing "flaky" tests that always passed on
    // rerun. A timeout is there to catch a genuine hang, not to enforce
    // speed — 20s still does that, without failing on machine load.
    testTimeout: 20_000,
    // e2e/**/*.spec.ts are Playwright specs (see playwright.config.ts) — both
    // tools default to matching *.spec.ts, so without this vitest tries to
    // run them too and fails immediately (test() called outside Playwright's
    // own runner). Vitest's own defaults ("**/node_modules/**", "**/.git/**")
    // are repeated here since setting `exclude` replaces them rather than
    // adding to them.
    exclude: ["**/node_modules/**", "**/.git/**", "e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Raised to today's measured numbers (61.97/55.55/55.01/63.72 —
      // rounded down so a fraction-of-a-percent fluctuation doesn't fail CI
      // on its own), per v1.5.2 Track C4. The jump from the v1.5.1 floor
      // reflects both new tests (compare.ts, fuzzy.ts, download-response.ts)
      // and the removal of dead UI scaffolding that carried no coverage.
      thresholds: {
        statements: 61,
        branches: 55,
        functions: 55,
        lines: 63,
      },
    },
  },
});
