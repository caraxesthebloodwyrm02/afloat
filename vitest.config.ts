import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    env: {
      PROVENANCE_SIGNING_KEY: "test-provenance-key-minimum-32-chars-long",
      JWT_SECRET: "test-jwt-secret-for-vitest",
      UPSTASH_REDIS_REST_URL: "http://localhost:6379",
      UPSTASH_REDIS_REST_TOKEN: "test-token",
      OPENAI_API_KEY: "sk-test-openai-key",
    },
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/lib/**/*.ts", "src/app/api/**/*.ts"],
      exclude: ["tests/**", "**/*.test.ts", "**/*.spec.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
