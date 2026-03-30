/**
 * Unit tests for MemoryRedis — the in-memory Redis-compatible store.
 *
 * Bypasses the global mock from setup.ts to test the actual class directly.
 */

vi.unmock("@/lib/redis");

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRedis, getRedis, isUpstashConfigured, _resetRedisForTesting } from "@/lib/redis";

beforeEach(() => {
  _resetRedisForTesting();
});

afterEach(() => {
  _resetRedisForTesting();
  vi.restoreAllMocks();
});

describe("MemoryRedis", () => {
  let store: MemoryRedis;

  beforeEach(() => {
    store = new MemoryRedis();
  });

  it("get returns null for unknown key", async () => {
    expect(await store.get("missing")).toBeNull();
  });

  it("set + get round-trip", async () => {
    await store.set("key", "value");
    expect(await store.get("key")).toBe("value");
  });

  it("set with nx: true — second set returns null", async () => {
    const first = await store.set("nx-key", "v1", { nx: true });
    const second = await store.set("nx-key", "v2", { nx: true });
    expect(first).toBe("OK");
    expect(second).toBeNull();
    expect(await store.get("nx-key")).toBe("v1");
  });

  it("set with ex expiry — key expires after timeout", async () => {
    vi.useFakeTimers();
    try {
      await store.set("ttl-key", "value", { ex: 1 });
      expect(await store.get("ttl-key")).toBe("value");

      vi.advanceTimersByTime(1001);
      expect(await store.get("ttl-key")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("del removes key and returns count", async () => {
    await store.set("a", "1");
    await store.set("b", "2");
    const count = await store.del("a", "b", "nonexistent");
    expect(count).toBe(2);
    expect(await store.get("a")).toBeNull();
    expect(await store.get("b")).toBeNull();
  });

  it("del removes list keys", async () => {
    await store.rpush("list-key", "a", "b");
    const count = await store.del("list-key");
    expect(count).toBe(1);
    expect(await store.lrange("list-key", 0, -1)).toEqual([]);
  });

  it("rpush + lrange — push values and read range", async () => {
    await store.rpush("list", "a", "b");
    await store.rpush("list", "c");
    const result = await store.lrange("list", 0, -1);
    expect(result).toEqual(["a", "b", "c"]);
  });

  it("lrange with specific range", async () => {
    await store.rpush("list", "a", "b", "c", "d");
    expect(await store.lrange("list", 1, 2)).toEqual(["b", "c"]);
  });

  it("scan returns all keys", async () => {
    await store.set("kv1", "v");
    await store.set("kv2", "v");
    await store.rpush("list1", "v");

    const [cursor, keys] = await store.scan(0);
    expect(cursor).toBe(0);
    expect(keys.sort()).toEqual(["kv1", "kv2", "list1"]);
  });

  it("scan with match pattern filters correctly", async () => {
    await store.set("session:1", "v");
    await store.set("session:2", "v");
    await store.set("user:1", "v");

    const [, keys] = await store.scan(0, { match: "session:*" });
    expect(keys.sort()).toEqual(["session:1", "session:2"]);
  });
});

describe("isUpstashConfigured", () => {
  const savedUrl = process.env.UPSTASH_REDIS_REST_URL;
  const savedToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  afterEach(() => {
    // Restore original env
    if (savedUrl !== undefined) process.env.UPSTASH_REDIS_REST_URL = savedUrl;
    else delete process.env.UPSTASH_REDIS_REST_URL;
    if (savedToken !== undefined) process.env.UPSTASH_REDIS_REST_TOKEN = savedToken;
    else delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it("returns true when both env vars are set", () => {
    process.env.UPSTASH_REDIS_REST_URL = "http://localhost:6379";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    expect(isUpstashConfigured()).toBe(true);
  });

  it("returns false when URL is missing", () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    expect(isUpstashConfigured()).toBe(false);
  });

  it("returns false when token is missing", () => {
    process.env.UPSTASH_REDIS_REST_URL = "http://localhost:6379";
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    expect(isUpstashConfigured()).toBe(false);
  });
});

describe("getRedis", () => {
  const savedUrl = process.env.UPSTASH_REDIS_REST_URL;
  const savedToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  afterEach(() => {
    if (savedUrl !== undefined) process.env.UPSTASH_REDIS_REST_URL = savedUrl;
    else delete process.env.UPSTASH_REDIS_REST_URL;
    if (savedToken !== undefined) process.env.UPSTASH_REDIS_REST_TOKEN = savedToken;
    else delete process.env.UPSTASH_REDIS_REST_TOKEN;
    _resetRedisForTesting();
  });

  it("returns MemoryRedis when Upstash not configured", () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const redis = getRedis();
    expect(redis).toBeInstanceOf(MemoryRedis);
    consoleSpy.mockRestore();
  });

  it("returns singleton instance on repeated calls", () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const first = getRedis();
    const second = getRedis();
    expect(first).toBe(second);
    consoleSpy.mockRestore();
  });
});
