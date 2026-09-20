import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Database integration tests — need the local Supabase stack (`pnpm db:start`)
 * and SUPABASE_URL / SUPABASE_SECRET_KEY (see docs/NEWS-WAREHOUSE.md). They talk
 * only to localhost; none touch the internet. Run with `pnpm test:db`.
 * Files run serially because they share one database.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
});
