import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      PROVENANCE_SIGNING_KEY: 'NsRYe4D6gqT8mh300LKybRZ0kTRBfoAXTPTEmOPGG1I',
      JWT_SECRET: 'B9WqS5sMazj8bfDlHkktwSv7jI6r74nxYnMkA1Re4E',
      UPSTASH_REDIS_REST_URL: 'http://localhost:6379',
      UPSTASH_REDIS_REST_TOKEN: 'XpT9mW3kR7vL2nQ8sY4hB6cJ',
      OPENAI_API_KEY: 'test_openai_key_placeholder',
      STRIPE_PRICE_STARTER_MO: 'price_test_starter_monthly',
      STRIPE_PRICE_STARTER_QTR: 'price_test_starter_quarterly',
      STRIPE_PRICE_STARTER_YR: 'price_test_starter_annual',
      STRIPE_PRICE_PRO_MO: 'price_test_pro_monthly',
      STRIPE_PRICE_PRO_QTR: 'price_test_pro_quarterly',
      STRIPE_PRICE_PRO_YR: 'price_test_pro_annual',
    },
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/lib/**/*.ts', 'src/app/api/**/*.ts'],
      exclude: [
        'tests/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        'src/lib/provenance/index.ts',
        'src/lib/provenance/types.ts',
      ],
      thresholds: {
        lines: 68,
        functions: 68,
        branches: 59,
        statements: 67,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
