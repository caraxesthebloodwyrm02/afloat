import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { getRedis, isUpstashConfigured } from "./redis";
import { NextResponse } from "next/server";
import type { ApiError } from "@/types/api";

/**
 * Simple in-memory rate limiter for when Upstash is not available.
 * Uses a sliding window with Map storage. Not shared across workers.
 */
class MemoryRatelimit {
  private windows = new Map<string, number[]>();
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  async limit(identifier: string): Promise<{ success: boolean; reset: number }> {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const timestamps = (this.windows.get(identifier) ?? []).filter((t) => t > windowStart);

    if (timestamps.length >= this.maxRequests) {
      const oldestInWindow = timestamps[0];
      return { success: false, reset: oldestInWindow + this.windowMs };
    }

    timestamps.push(now);
    this.windows.set(identifier, timestamps);
    return { success: true, reset: now + this.windowMs };
  }
}

type RateLimiter = Ratelimit | MemoryRatelimit;

let sessionLimiter: RateLimiter | null = null;
let dataRightsLimiter: RateLimiter | null = null;
let subscribeLimiter: RateLimiter | null = null;
let sessionEndLimiter: RateLimiter | null = null;

function createLimiter(maxRequests: number, windowMs: number, prefix: string): RateLimiter {
  if (isUpstashConfigured()) {
    return new Ratelimit({
      redis: getRedis() as Redis,
      limiter: Ratelimit.slidingWindow(maxRequests, `${windowMs / 3_600_000} h`),
      prefix,
    });
  }
  return new MemoryRatelimit(maxRequests, windowMs);
}

export function getSessionRateLimiter(): RateLimiter {
  if (!sessionLimiter) {
    sessionLimiter = createLimiter(30, 3_600_000, "rl:session");
  }
  return sessionLimiter;
}

export function getDataRightsRateLimiter(): RateLimiter {
  if (!dataRightsLimiter) {
    dataRightsLimiter = createLimiter(10, 3_600_000, "rl:data_rights");
  }
  return dataRightsLimiter;
}

export function getSubscribeRateLimiter(): RateLimiter {
  if (!subscribeLimiter) {
    subscribeLimiter = createLimiter(10, 3_600_000, "rl:subscribe");
  }
  return subscribeLimiter;
}

export function getSessionEndRateLimiter(): RateLimiter {
  if (!sessionEndLimiter) {
    sessionEndLimiter = createLimiter(30, 3_600_000, "rl:session_end");
  }
  return sessionEndLimiter;
}

export async function checkRateLimit(
  limiter: RateLimiter,
  identifier: string
): Promise<NextResponse<ApiError> | null> {
  const { success, reset } = await limiter.limit(identifier);

  if (!success) {
    const retryAfter = Math.ceil((reset - Date.now()) / 1000);
    return NextResponse.json(
      {
        error: "rate_limit" as const,
        message: "Too many requests. Please try again later.",
      },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      }
    );
  }

  return null;
}
