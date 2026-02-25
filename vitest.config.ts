import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    env: {
      PROVENANCE_SIGNING_KEY: "test-provenance-key-minimum-32-chars-long",
      JWT_SECRET: "test-jwt-secret-for-vitest",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
