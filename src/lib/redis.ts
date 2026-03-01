import { Redis } from "@upstash/redis";

let redis: Redis | null = null;
let memoryStore: MemoryRedis | null = null;

/**
 * Minimal in-memory Redis-compatible store for development.
 * Supports the subset of commands used by data-layer and session-controller.
 * Does NOT persist across restarts.
 */
class MemoryRedis {
  private store = new Map<string, { value: unknown; expiresAt: number | null }>();
  private lists = new Map<string, string[]>();

  private isExpired(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return true;
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return true;
    }
    return false;
  }

  async get<T = string>(key: string): Promise<T | null> {
    if (this.isExpired(key)) return null;
    return (this.store.get(key)?.value ?? null) as T | null;
  }

  async set(
    key: string,
    value: unknown,
    opts?: { ex?: number; nx?: boolean }
  ): Promise<"OK" | null> {
    if (opts?.nx && this.store.has(key) && !this.isExpired(key)) {
      return null;
    }
    const expiresAt = opts?.ex ? Date.now() + opts.ex * 1000 : null;
    this.store.set(key, { value, expiresAt });
    return "OK";
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (this.store.delete(key)) count++;
      if (this.lists.delete(key)) count++;
    }
    return count;
  }

  async rpush(key: string, ...values: string[]): Promise<number> {
    const list = this.lists.get(key) ?? [];
    list.push(...values);
    this.lists.set(key, list);
    return list.length;
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const list = this.lists.get(key) ?? [];
    const end = stop === -1 ? list.length : stop + 1;
    return list.slice(start, end);
  }

  async scan(
    cursor: number,
    opts?: { match?: string; count?: number }
  ): Promise<[number, string[]]> {
    const allKeys = [...this.store.keys(), ...this.lists.keys()];
    const unique = [...new Set(allKeys)];

    if (opts?.match) {
      const regex = new RegExp("^" + opts.match.replace(/\*/g, ".*") + "$");
      const matched = unique.filter((k) => regex.test(k));
      return [0, matched];
    }

    return [0, unique];
  }
}

export function isUpstashConfigured(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

export function getRedis(): Redis | MemoryRedis {
  if (isUpstashConfigured()) {
    if (!redis) {
      redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
      });
    }
    return redis;
  }

  if (!memoryStore) {
    console.warn(
      "[afloat] No Redis configured — using in-memory store. Data will not persist across restarts."
    );
    memoryStore = new MemoryRedis();
  }
  return memoryStore;
}
