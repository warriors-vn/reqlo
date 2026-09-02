import { defineConfig, devices } from "@playwright/test";

// A smoke suite, not a full E2E pass — three flows the unit and component
// test layers structurally can't see: wiring across the real app shell
// (Sidebar → command palette → Workspace → ResponseViewer), driven by a
// real dev server and a real browser.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  // Each spec does 1-2 real network round trips on top of app navigation, so
  // 30s left no headroom under CI latency — this is a real UI smoke suite,
  // not a fast unit test, and flakiness-by-timeout is worse than a slow pass.
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:8080",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:8080",
    reuseExistingServer: !process.env.CI,
    // A cold CI runner (fresh npm ci, no Vite dep-optimization cache) booting
    // a dev server for a Monaco/quickjs-heavy app can take a while before its
    // first compile — 60s was cutting it close.
    timeout: 120_000,
  },
});
