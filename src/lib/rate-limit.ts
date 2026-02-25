import { Ratelimit } from "@upstash/ratelimit";
import { getRedis } from "./redis";
import { NextResponse } from "next/server";
import type { ApiError } from "@/types/api";

let sessionLimiter: Ratelimit | null = null;
let dataRightsLimiter: Ratelimit | null = null;
let subscribeLimiter: Ratelimit | null = null;
let sessionEndLimiter: Ratelimit | null = null;

export function getSessionRateLimiter(): Ratelimit {
  if (!sessionLimiter) {
    sessionLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(30, "1 h"),
      prefix: "rl:session",
    });
  }
  return sessionLimiter;
}

export function getDataRightsRateLimiter(): Ratelimit {
  if (!dataRightsLimiter) {
    dataRightsLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(10, "1 h"),
      prefix: "rl:data_rights",
    });
  }
  return dataRightsLimiter;
}

export function getSubscribeRateLimiter(): Ratelimit {
  if (!subscribeLimiter) {
    subscribeLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(10, "1 h"),
      prefix: "rl:subscribe",
    });
  }
  return subscribeLimiter;
}

export function getSessionEndRateLimiter(): Ratelimit {
  if (!sessionEndLimiter) {
    sessionEndLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(30, "1 h"),
      prefix: "rl:session_end",
    });
  }
  return sessionEndLimiter;
}

export async function checkRateLimit(
  limiter: Ratelimit,
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
