import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthenticated } from '@/lib/auth-middleware';
import { createSession } from '@/lib/session-controller';
import { getUser } from '@/lib/data-layer';
import { getSessionRateLimiter, checkRateLimit } from '@/lib/rate-limit';
import { auditAction } from '@/lib/audit';
import { FREE_TRIAL_MAX_SESSIONS } from '@/types/session';
import { getEffectiveTierConfig } from '@/lib/param-store';
import {
  incrementDailySessionCount,
  getDailySessionCount,
} from '@/lib/param-store';
import { incrementTrialSession, getTrialSessionCount } from '@/lib/events';
import { reportSessionUsage } from '@/lib/stripe';
import type { SessionStartResponse, ApiError } from '@/types/api';

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!isAuthenticated(authResult)) return authResult;

  const { user } = authResult;

  const rateLimitResponse = await checkRateLimit(
    getSessionRateLimiter(),
    user.user_id
  );
  if (rateLimitResponse) return rateLimitResponse;

  const userRecord = await getUser(user.user_id);
  if (!userRecord || userRecord.subscription_status !== 'active') {
    return NextResponse.json<ApiError>(
      { error: 'forbidden', message: 'Active subscription required.' },
      { status: 403 }
    );
  }

  if (userRecord.pending_deletion) {
    return NextResponse.json<ApiError>(
      {
        error: 'forbidden',
        message: `Your account is scheduled for deletion on ${userRecord.pending_deletion.deletion_date}. Visit settings to cancel deletion and continue using Afloat.`,
      },
      { status: 403 }
    );
  }

  const tier = userRecord.subscription_tier ?? 'starter';
  const config = await getEffectiveTierConfig(tier);

  // Enforce free trial total session cap
  if (tier === 'free_trial') {
    const trialCount = await getTrialSessionCount(user.user_id);
    const maxTrialSessions = config.maxSessionsTotal ?? FREE_TRIAL_MAX_SESSIONS;
    if (trialCount >= maxTrialSessions) {
      return NextResponse.json<ApiError>(
        {
          error: 'trial_exhausted',
          message: `Free trial limit reached (${maxTrialSessions} sessions). Subscribe to continue.`,
        },
        { status: 403 }
      );
    }
    await incrementTrialSession(user.user_id);
  }

  // Enforce daily session cap (Starter tier)
  if (config.maxSessionsPerDay !== null) {
    const dailyCount = await getDailySessionCount(user.user_id);
    if (dailyCount >= config.maxSessionsPerDay) {
      return NextResponse.json<ApiError>(
        {
          error: 'daily_limit',
          message: `Daily session limit reached (${config.maxSessionsPerDay}). Try again tomorrow.`,
        },
        { status: 429 }
      );
    }
  }

  await incrementDailySessionCount(user.user_id);

  const session = await createSession(user.user_id, tier);

  // Report metered session usage to Stripe
  if (tier !== 'free_trial') {
    try {
      await reportSessionUsage(userRecord.stripe_customer_id);
    } catch {
      // Best-effort — don't block session start
    }
  }

  await auditAction(request, user, {
    action: 'create',
    resource_type: 'session_log',
    resource_id: session.session_id,
    outcome: 'success',
    metadata: { tier },
  });

  return NextResponse.json<SessionStartResponse>({
    session_id: session.session_id,
    tier,
    max_duration_ms: config.maxDurationMs,
    max_turns: config.maxLlmCalls,
  });
}
