import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // server-only imports are no-ops outside Next; they only need to
    // not throw. Stub them so attribution tests can run unit-style.
    alias: {
      "server-only": new URL(
        "./test/server-only-stub.ts",
        import.meta.url,
      ).pathname.replace(/^\//, ""),
    },
  },
});
