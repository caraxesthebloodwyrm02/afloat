import { getRedis } from './redis';
import {
  TIER_CONFIGS,
  METERED_BILLING,
  type TierConfig,
  isActiveTier,
} from './pricing-config';

// ── Redis-backed parameter store with code defaults as fallback ──
// Parameters are read per-request (not cached across requests) so changes
// apply to the next session start without redeployment.

const PARAM_PREFIX = 'params:';

export async function getParam<T>(key: string, fallback: T): Promise<T> {
  const redis = getRedis();
  const val = await redis.get<T>(`${PARAM_PREFIX}${key}`);
  return val ?? fallback;
}

export async function setParam(
  key: string,
  value: unknown,
  reason: string
): Promise<void> {
  const redis = getRedis();
  await redis.set(`${PARAM_PREFIX}${key}`, JSON.stringify(value));

  const version = await redis.incr(`${PARAM_PREFIX}version`);

  await redis.rpush(
    `audit:${new Date().toISOString().split('T')[0]}`,
    JSON.stringify({
      log_id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      actor: 'admin',
      action: 'update',
      resource_type: 'parameter',
      resource_id: key,
      outcome: 'success',
      ip_hash: 'admin',
      metadata: { value, reason, params_version: version },
    })
  );
}

export async function getPerSessionPrice(): Promise<number> {
  return getParam('per_session_price', METERED_BILLING.perSessionPriceCents);
}

export async function getEffectiveTierConfig(
  tier: string
): Promise<TierConfig> {
  const base = isActiveTier(tier) ? TIER_CONFIGS[tier] : TIER_CONFIGS.starter;
  const tierKey = isActiveTier(tier) ? tier : 'starter';

  const [maxLlmCalls, maxDurationMs, maxSessionsPerDay, includedSessions] =
    await Promise.all([
      getParam(`tier:${tierKey}:maxLlmCalls`, base.maxLlmCalls),
      getParam(`tier:${tierKey}:maxDurationMs`, base.maxDurationMs),
      getParam(`tier:${tierKey}:maxSessionsPerDay`, base.maxSessionsPerDay),
      getParam(
        `tier:${tierKey}:includedSessions`,
        base.includedSessionsPerMonth
      ),
    ]);

  return {
    ...base,
    maxLlmCalls:
      typeof maxLlmCalls === 'number' ? maxLlmCalls : base.maxLlmCalls,
    maxDurationMs:
      typeof maxDurationMs === 'number' ? maxDurationMs : base.maxDurationMs,
    maxSessionsPerDay:
      typeof maxSessionsPerDay === 'number'
        ? maxSessionsPerDay
        : base.maxSessionsPerDay,
    includedSessionsPerMonth:
      typeof includedSessions === 'number'
        ? includedSessions
        : base.includedSessionsPerMonth,
  };
}

// ── Daily session counter (server-side enforcement) ──

function dailySessionKey(userId: string): string {
  const date = new Date().toISOString().split('T')[0];
  return `daily_sessions:${userId}:${date}`;
}

export async function incrementDailySessionCount(
  userId: string
): Promise<number> {
  const redis = getRedis();
  const key = dailySessionKey(userId);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, 86400);
  }
  return count;
}

export async function getDailySessionCount(userId: string): Promise<number> {
  const redis = getRedis();
  const count = await redis.get<number>(dailySessionKey(userId));
  return typeof count === 'number' ? count : 0;
}

export async function getParamsVersion(): Promise<number> {
  return getParam('version', 0);
}
