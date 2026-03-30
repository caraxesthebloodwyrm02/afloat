/**
 * Unit tests for MemoryRatelimit and checkRateLimit.
 *
 * Tests the actual rate limiter class directly — no mocks needed.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRatelimit, checkRateLimit } from "@/lib/rate-limit";

describe("MemoryRatelimit", () => {
  it("allows requests under threshold", async () => {
    const limiter = new MemoryRatelimit(3, 60_000);
    const r1 = await limiter.limit("user-1");
    const r2 = await limiter.limit("user-1");
    const r3 = await limiter.limit("user-1");
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    expect(r3.success).toBe(true);
  });

  it("blocks at threshold", async () => {
    const limiter = new MemoryRatelimit(2, 60_000);
    await limiter.limit("user-1");
    await limiter.limit("user-1");
    const blocked = await limiter.limit("user-1");
    expect(blocked.success).toBe(false);
  });

  it("resets after window expires", async () => {
    vi.useFakeTimers();
    try {
      const limiter = new MemoryRatelimit(1, 1_000);
      await limiter.limit("user-1");

      const blocked = await limiter.limit("user-1");
      expect(blocked.success).toBe(false);

      vi.advanceTimersByTime(1_001);
      const allowed = await limiter.limit("user-1");
      expect(allowed.success).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns reset timestamp in the future", async () => {
    const limiter = new MemoryRatelimit(1, 60_000);
    const result = await limiter.limit("user-1");
    expect(result.reset).toBeGreaterThan(Date.now() - 1);
  });

  it("tracks identifiers independently", async () => {
    const limiter = new MemoryRatelimit(1, 60_000);
    const r1 = await limiter.limit("user-a");
    const r2 = await limiter.limit("user-b");
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);

    const r3 = await limiter.limit("user-a");
    expect(r3.success).toBe(false);
  });
});

describe("checkRateLimit", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null when under limit", async () => {
    const limiter = new MemoryRatelimit(10, 60_000);
    const result = await checkRateLimit(limiter, "user-1");
    expect(result).toBeNull();
  });

  it("returns 429 response with Retry-After when limit exceeded", async () => {
    const limiter = new MemoryRatelimit(1, 60_000);
    await limiter.limit("user-1"); // use up the quota

    const response = await checkRateLimit(limiter, "user-1");
    expect(response).not.toBeNull();
    expect(response!.status).toBe(429);
    expect(response!.headers.get("Retry-After")).toBeTruthy();

    const body = await response!.json();
    expect(body.error).toBe("rate_limit");
    expect(body.message).toContain("Too many requests");
  });
});
