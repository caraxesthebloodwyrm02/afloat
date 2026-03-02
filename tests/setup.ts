import { vi } from "vitest";

vi.mock("@upstash/redis", () => {
  const store = new Map<string, string>();

  const mockRedis = {
    get: vi.fn(async (key: string) => {
      return store.get(key) ?? null;
    }),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return "OK";
    }),
    del: vi.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
    exists: vi.fn(async (key: string) => {
      return store.has(key) ? 1 : 0;
    }),
    rpush: vi.fn(async () => {
      return 1;
    }),
    lrange: vi.fn(async () => {
      return [];
    }),
  };

  return {
    Redis: vi.fn(() => mockRedis),
  };
});

vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: vi.fn(() => ({
    limit: vi.fn(async () => ({ success: true })),
  })),
}));

vi.mock("@/lib/redis", () => ({
  getRedis: vi.fn(() => {
    const store = new Map<string, string>();
    return {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      set: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
        return "OK";
      }),
      del: vi.fn(async (key: string) => {
        store.delete(key);
        return 1;
      }),
      exists: vi.fn(async (key: string) => store.has(key) ? 1 : 0),
      rpush: vi.fn(async () => 1),
      lrange: vi.fn(async () => []),
    };
  }),
}));