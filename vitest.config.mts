import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
      // Adapters import `server-only`; vitest has no React server condition.
      "server-only": new URL("./test/server-only.stub.ts", import.meta.url).pathname,
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    testTimeout: 15_000,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      // Unit-testable surface: pure logic plus the snapshot adapter. Network
      // scrapers are exercised by the loop, the API routes and the pages by
      // scripts/smoke.sh, scripts/contract-test.mjs and the e2e suite.
      include: [
        "src/lib/dataset.ts",
        "src/lib/event-slug.ts",
        "src/lib/genres.ts",
        "src/lib/link-health.ts",
        "src/lib/link-labels.ts",
        "src/lib/locations.ts",
        "src/lib/profile-tier.ts",
        "src/lib/repo/snapshot.ts",
        "src/lib/slug.ts",
      ],
      reporter: ["text", "lcov"],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 70,
      },
    },
  },
});
