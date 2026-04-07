import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthenticated } from '@/lib/auth-middleware';
import { getUser } from '@/lib/data-layer';
import { getDailySessionCount } from '@/lib/param-store';
import { getEffectiveTierConfig } from '@/lib/param-store';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!isAuthenticated(authResult)) return authResult;

  const { user } = authResult;
  const userRecord = await getUser(user.user_id);

  if (!userRecord) {
    return NextResponse.json(
      { error: 'not_found', message: 'User not found.' },
      { status: 404 }
    );
  }

  const tier = userRecord.subscription_tier ?? 'starter';
  const config = await getEffectiveTierConfig(tier);
  const dailyCount = await getDailySessionCount(user.user_id);

  return NextResponse.json({
    tier,
    subscription_status: userRecord.subscription_status,
    billing_cycle_anchor: userRecord.billing_cycle_anchor,
    sessions_used_today: dailyCount,
    max_sessions_per_day: config.maxSessionsPerDay,
    max_llm_calls: config.maxLlmCalls,
    max_duration_ms: config.maxDurationMs,
    included_sessions_per_month: config.includedSessionsPerMonth,
  });
}
