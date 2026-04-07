import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthenticated } from '@/lib/auth-middleware';
import { getUser } from '@/lib/data-layer';
import { getTrialSessionCount } from '@/lib/events';
import { getEffectiveTierConfig } from '@/lib/param-store';
import { FREE_TRIAL_MAX_SESSIONS } from '@/types/session';

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
  if (tier !== 'free_trial') {
    return NextResponse.json({
      is_trial: false,
      tier,
      sessions_used: 0,
      sessions_remaining: 0,
      max_sessions: 0,
    });
  }

  const config = await getEffectiveTierConfig(tier);
  const maxSessions = config.maxSessionsTotal ?? FREE_TRIAL_MAX_SESSIONS;
  const sessionsUsed = await getTrialSessionCount(user.user_id);

  return NextResponse.json({
    is_trial: true,
    tier,
    sessions_used: sessionsUsed,
    sessions_remaining: Math.max(0, maxSessions - sessionsUsed),
    max_sessions: maxSessions,
  });
}
