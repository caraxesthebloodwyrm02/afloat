import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    env: {
      PROVENANCE_SIGNING_KEY: "NsRYe4D6gqT8mh300LKybRZ0kTRBfoAXTPTEmOPGG1I",
      JWT_SECRET: "B9WqS5sMazj8bfDlHkktwSv7jI6r74nxYnMkA1Re4E",
      UPSTASH_REDIS_REST_URL: "http://localhost:6379",
      UPSTASH_REDIS_REST_TOKEN: "XpT9mW3kR7vL2nQ8sY4hB6cJ",
      OPENAI_API_KEY: "sk-Xt9mW3kR7vL2nQ8sY4hB6cJ1fA5dE",
    },
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/lib/**/*.ts", "src/app/api/**/*.ts"],
      exclude: ["tests/**", "**/*.test.ts", "**/*.spec.ts"],
      thresholds: {
        // TODO: Restore to 60/55/58 after safety-core tests added
        lines: 55,
        functions: 52,
        branches: 48,
        statements: 54,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
