import { getRedis } from './redis';
import type { GateType } from '@/types/session';

// ── Lifecycle Event Types (contract v1.10.0 product_strategy) ──

export type LifecycleEventType =
  | 'trial_started'
  | 'trial_session_used'
  | 'trial_closed'
  | 'console_warning_displayed'
  | 'cta_clicked'
  | 'cta_dismissed'
  | 'subscription_started'
  | 'subscription_upgraded'
  | 'subscription_canceled'
  | 'session_pack_purchased'
  | 'access_pass_purchased'
  | 'session_completed'
  | 'churn_signal'
  | 'winback_sent'
  | 'winback_converted';

export interface LifecycleEvent {
  event_id: string;
  event_type: LifecycleEventType;
  user_id: string;
  timestamp: string;
  tier: string;
  metadata: Record<string, unknown>;
}

export interface TrialClosePayload {
  sessions_used: number;
  gate_types_resolved: GateType[];
  total_session_time_ms: number;
  conversion_status: 'pending' | 'converted' | 'dismissed';
}

export interface CTAPayload {
  component_id: string;
  action: 'redirect_stripe_checkout' | 'dismiss_and_log';
  plan?: string;
}

export interface ConversionPayload {
  from_tier: string;
  to_tier: string;
  billing_period: string;
  amount_usd: number;
  time_to_convert_ms: number;
}

// ── Event Bus (Redis-backed append-only log) ──

const EVENT_PREFIX = 'lifecycle:';
const EVENT_STREAM = 'lifecycle:stream';

export async function emitEvent(event: LifecycleEvent): Promise<void> {
  const redis = getRedis();
  const dateKey = event.timestamp.split('T')[0];

  // Append to date-partitioned list (for batch queries)
  await redis.rpush(`${EVENT_PREFIX}${dateKey}`, JSON.stringify(event));

  // Append to user-specific list (for journey reconstruction)
  await redis.rpush(
    `${EVENT_PREFIX}user:${event.user_id}`,
    JSON.stringify(event)
  );

  // Append to global stream (for real-time monitoring)
  await redis.rpush(EVENT_STREAM, JSON.stringify(event));
}

export async function getUserJourney(
  userId: string
): Promise<LifecycleEvent[]> {
  const redis = getRedis();
  const entries = await redis.lrange(`${EVENT_PREFIX}user:${userId}`, 0, -1);
  return entries.map(
    (e) => (typeof e === 'string' ? JSON.parse(e) : e) as LifecycleEvent
  );
}

export async function getEventsByDate(
  dateKey: string
): Promise<LifecycleEvent[]> {
  const redis = getRedis();
  const entries = await redis.lrange(`${EVENT_PREFIX}${dateKey}`, 0, -1);
  return entries.map(
    (e) => (typeof e === 'string' ? JSON.parse(e) : e) as LifecycleEvent
  );
}

// ── Trial Session Counter (contract: free_trial.max_sessions = 3) ──

const TRIAL_COUNTER_PREFIX = 'trial_count:';

export async function incrementTrialSession(userId: string): Promise<number> {
  const redis = getRedis();
  const key = `${TRIAL_COUNTER_PREFIX}${userId}`;
  const count = await redis.incr(key);
  // TTL: 90 days (contract window)
  if (count === 1) {
    await redis.expire(key, 90 * 24 * 60 * 60);
  }
  return count;
}

export async function getTrialSessionCount(userId: string): Promise<number> {
  const redis = getRedis();
  const count = await redis.get<number>(`${TRIAL_COUNTER_PREFIX}${userId}`);
  return typeof count === 'number' ? count : 0;
}

// ── Conversion Tracking ──

const CONVERSION_PREFIX = 'conversion:';

export async function trackConversion(
  userId: string,
  payload: ConversionPayload
): Promise<void> {
  const redis = getRedis();
  const entry = {
    user_id: userId,
    timestamp: new Date().toISOString(),
    ...payload,
  };
  await redis.rpush(`${CONVERSION_PREFIX}log`, JSON.stringify(entry));
  // Increment daily conversion counter
  const dateKey = new Date().toISOString().split('T')[0];
  await redis.incr(`${CONVERSION_PREFIX}daily:${dateKey}`);
}

export async function getDailyConversions(dateKey: string): Promise<number> {
  const redis = getRedis();
  const count = await redis.get<number>(`${CONVERSION_PREFIX}daily:${dateKey}`);
  return typeof count === 'number' ? count : 0;
}

// ── Lifecycle Summary (compressed scope, usage-pattern insights) ──

export interface LifecycleSummary {
  user_id: string;
  journey_stage: 'trial' | 'active' | 'at_risk' | 'churned' | 'winback_target';
  sessions_total: number;
  gate_types_used: GateType[];
  time_to_first_session_ms: number | null;
  time_to_conversion_ms: number | null;
  tier: string;
  billing_period: string | null;
  last_active: string;
  insights: string[];
}

export async function buildLifecycleSummary(
  userId: string
): Promise<LifecycleSummary> {
  const events = await getUserJourney(userId);

  const gateTypes = new Set<GateType>();
  let sessionsTotal = 0;
  let firstSessionTime: string | null = null;
  let conversionTime: string | null = null;
  let trialStartTime: string | null = null;
  let tier = 'free_trial';
  let billingPeriod: string | null = null;
  let lastActive = '';
  let journeyStage: LifecycleSummary['journey_stage'] = 'trial';

  for (const event of events) {
    lastActive = event.timestamp;

    switch (event.event_type) {
      case 'trial_started':
        trialStartTime = event.timestamp;
        break;
      case 'session_completed':
        sessionsTotal++;
        if (!firstSessionTime) firstSessionTime = event.timestamp;
        if (event.metadata.gate_type) {
          gateTypes.add(event.metadata.gate_type as GateType);
        }
        break;
      case 'subscription_started':
        conversionTime = event.timestamp;
        tier = (event.metadata.tier as string) ?? tier;
        billingPeriod = (event.metadata.billing as string) ?? null;
        journeyStage = 'active';
        break;
      case 'subscription_canceled':
        journeyStage = 'churned';
        break;
      case 'trial_closed':
        if (journeyStage === 'trial') journeyStage = 'at_risk';
        break;
      case 'winback_converted':
        journeyStage = 'active';
        break;
    }
  }

  // Insights based on usage patterns
  const insights: string[] = [];

  if (sessionsTotal === 0) {
    insights.push('No sessions completed — onboarding friction likely');
  } else if (sessionsTotal <= 2 && journeyStage === 'trial') {
    insights.push('Low trial usage — consider nudge at session 2');
  }

  if (gateTypes.size >= 3) {
    insights.push(`Power user signal: ${gateTypes.size} gate types explored`);
  }

  if (conversionTime && trialStartTime) {
    const ttc =
      new Date(conversionTime).getTime() - new Date(trialStartTime).getTime();
    if (ttc < 24 * 60 * 60 * 1000) {
      insights.push('Fast converter — high intent user (< 24h)');
    }
  }

  if (journeyStage === 'churned') {
    insights.push(
      'Winback candidate — offer session pack ($4.99/10) or access pass ($7/30)'
    );
  }

  const timeToFirst =
    firstSessionTime && trialStartTime
      ? new Date(firstSessionTime).getTime() -
        new Date(trialStartTime).getTime()
      : null;

  const timeToConversion =
    conversionTime && trialStartTime
      ? new Date(conversionTime).getTime() - new Date(trialStartTime).getTime()
      : null;

  return {
    user_id: userId,
    journey_stage: journeyStage,
    sessions_total: sessionsTotal,
    gate_types_used: Array.from(gateTypes),
    time_to_first_session_ms: timeToFirst,
    time_to_conversion_ms: timeToConversion,
    tier,
    billing_period: billingPeriod,
    last_active: lastActive,
    insights,
  };
}
