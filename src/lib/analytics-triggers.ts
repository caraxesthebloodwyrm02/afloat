import { getRedis } from './redis';

// ── Event-Driven Analytics Triggers (lighter version) ──
// Simple numeric thresholds. Evolve toward Echoes-style geometric
// triggers after baseline data exists.

export interface TriggerResult {
  trigger_id: string;
  fired: boolean;
  value: number;
  threshold: number;
  action: string;
  metadata: Record<string, unknown>;
}

const TRIGGER_KEY_PREFIX = 'analytics:triggers:';

async function recordTrigger(result: TriggerResult): Promise<void> {
  if (!result.fired) return;
  const redis = getRedis();
  const dateKey = new Date().toISOString().split('T')[0];
  await redis.rpush(
    `${TRIGGER_KEY_PREFIX}${dateKey}`,
    JSON.stringify({
      ...result,
      timestamp: new Date().toISOString(),
    })
  );
}

// ── Churn signal: user inactive > N days ──

export async function evaluateChurnSignal(
  userId: string,
  lastActiveTimestamp: string | null,
  thresholdDays: number = 14
): Promise<TriggerResult> {
  const daysSinceActive = lastActiveTimestamp
    ? Math.floor(
        (Date.now() - new Date(lastActiveTimestamp).getTime()) / 86400_000
      )
    : 999;

  const result: TriggerResult = {
    trigger_id: 'churn_signal',
    fired: daysSinceActive > thresholdDays,
    value: daysSinceActive,
    threshold: thresholdDays,
    action: 'flag_winback',
    metadata: { user_id: userId, last_active: lastActiveTimestamp },
  };

  await recordTrigger(result);
  return result;
}

// ── Ceiling hit: user hits daily cap frequently ──

export async function evaluateCeilingHit(
  userId: string,
  dailyCount: number,
  dailyCap: number | null
): Promise<TriggerResult> {
  const atCeiling = dailyCap !== null && dailyCount >= dailyCap;

  const result: TriggerResult = {
    trigger_id: 'ceiling_hit',
    fired: atCeiling,
    value: dailyCount,
    threshold: dailyCap ?? 0,
    action: 'flag_tier_review',
    metadata: { user_id: userId },
  };

  await recordTrigger(result);
  return result;
}

// ── Quality drift: missing gate tag rate ──

export async function evaluateQualityDrift(
  missingGateTagCount: number,
  totalResponses: number,
  thresholdRate: number = 0.1
): Promise<TriggerResult> {
  const rate = totalResponses > 0 ? missingGateTagCount / totalResponses : 0;

  const result: TriggerResult = {
    trigger_id: 'quality_drift',
    fired: rate > thresholdRate,
    value: rate,
    threshold: thresholdRate,
    action: 'prompt_review',
    metadata: { missing_count: missingGateTagCount, total: totalResponses },
  };

  await recordTrigger(result);
  return result;
}

// ── Latency breach: avg latency > threshold for consecutive days ──

export async function evaluateLatencyBreach(
  avgLatencyMs: number,
  thresholdMs: number = 3000
): Promise<TriggerResult> {
  const result: TriggerResult = {
    trigger_id: 'latency_breach',
    fired: avgLatencyMs > thresholdMs,
    value: avgLatencyMs,
    threshold: thresholdMs,
    action: 'route_lighter_models',
    metadata: {},
  };

  await recordTrigger(result);
  return result;
}

// ── Retrieve accumulated triggers for a date ──

export async function getTriggersForDate(
  dateKey: string
): Promise<TriggerResult[]> {
  const redis = getRedis();
  const entries = await redis.lrange(`${TRIGGER_KEY_PREFIX}${dateKey}`, 0, -1);
  return entries.map(
    (e) => (typeof e === 'string' ? JSON.parse(e) : e) as TriggerResult
  );
}
