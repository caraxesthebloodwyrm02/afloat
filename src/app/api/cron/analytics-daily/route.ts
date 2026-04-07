import { NextRequest, NextResponse } from 'next/server';
import { getRedis } from '@/lib/redis';
import { getTriggersForDate } from '@/lib/analytics-triggers';
import type { SessionLog } from '@/types/session';

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured' },
      { status: 500 }
    );
  }

  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const redis = getRedis();
  const yesterday = new Date(Date.now() - 86400_000)
    .toISOString()
    .split('T')[0];

  const rawLogs = await redis.lrange(`sessions:${yesterday}`, 0, -1);
  const logs: SessionLog[] = rawLogs.map(
    (e) => (typeof e === 'string' ? JSON.parse(e) : e) as SessionLog
  );

  const sessionsByTier: Record<string, number> = {};
  let totalDurationMs = 0;
  let totalCalls = 0;
  let completedCount = 0;
  let proceededCount = 0;
  const latencies: number[] = [];

  for (const log of logs) {
    sessionsByTier[log.tier] = (sessionsByTier[log.tier] ?? 0) + 1;
    if (log.session_completed) completedCount++;
    if (log.user_proceeded) proceededCount++;
    totalCalls += log.turns;

    const durationMs =
      new Date(log.end_time).getTime() - new Date(log.start_time).getTime();
    totalDurationMs += durationMs;

    for (const lat of log.latency_per_turn) {
      latencies.push(lat);
    }
  }

  const avgDurationMs = logs.length > 0 ? totalDurationMs / logs.length : 0;
  const avgCallsPerSession = logs.length > 0 ? totalCalls / logs.length : 0;
  const avgLatencyMs =
    latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : 0;
  const successRate = logs.length > 0 ? completedCount / logs.length : 0;
  const gatePassRate = logs.length > 0 ? proceededCount / logs.length : 0;

  const triggers = await getTriggersForDate(yesterday);
  const firedTriggers = triggers.filter((t) => t.fired);

  const metrics = {
    date: yesterday,
    total_sessions: logs.length,
    sessions_by_tier: sessionsByTier,
    avg_duration_ms: Math.round(avgDurationMs),
    avg_calls_per_session: Math.round(avgCallsPerSession * 10) / 10,
    avg_latency_ms: Math.round(avgLatencyMs),
    session_success_rate: Math.round(successRate * 1000) / 1000,
    gate_pass_rate: Math.round(gatePassRate * 1000) / 1000,
    triggers_fired: firedTriggers.length,
    computed_at: new Date().toISOString(),
  };

  await redis.set(`metrics:daily:${yesterday}`, JSON.stringify(metrics));

  return NextResponse.json({ ok: true, metrics });
}
