import { NextRequest, NextResponse } from 'next/server';
import { getRedis } from '@/lib/redis';

function getMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getPreviousMonthDays(): string[] {
  const now = new Date();
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 12 : now.getMonth();
  const daysInMonth = new Date(year, month, 0).getDate();

  const days: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(
      `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    );
  }
  return days;
}

interface DailyMetrics {
  total_sessions: number;
  sessions_by_tier: Record<string, number>;
  avg_duration_ms: number;
  avg_latency_ms: number;
  session_success_rate: number;
  gate_pass_rate: number;
  triggers_fired: number;
}

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
  const monthKey = getMonthKey();
  const days = getPreviousMonthDays();

  const dailyMetrics: DailyMetrics[] = [];
  for (const day of days) {
    const raw = await redis.get<string>(`metrics:daily:${day}`);
    if (raw) {
      dailyMetrics.push(
        (typeof raw === 'string' ? JSON.parse(raw) : raw) as DailyMetrics
      );
    }
  }

  const totalSessions = dailyMetrics.reduce((s, d) => s + d.total_sessions, 0);
  const avgLatency =
    dailyMetrics.length > 0
      ? dailyMetrics.reduce((s, d) => s + d.avg_latency_ms, 0) /
        dailyMetrics.length
      : 0;

  const tierTotals: Record<string, number> = {};
  for (const d of dailyMetrics) {
    for (const [tier, count] of Object.entries(d.sessions_by_tier)) {
      tierTotals[tier] = (tierTotals[tier] ?? 0) + count;
    }
  }

  const recommendations: string[] = [];

  const starterSessions = tierTotals['starter'] ?? 0;
  const proSessions = tierTotals['pro'] ?? 0;
  if (starterSessions > 0 && proSessions === 0) {
    recommendations.push(
      'No Pro tier usage detected. Consider adjusting Pro value proposition or pricing.'
    );
  }
  if (avgLatency > 3000) {
    recommendations.push(
      `Latency averaging ${Math.round(avgLatency)}ms — exceeds 3s target. Route to lighter models.`
    );
  }
  if (totalSessions < 100) {
    recommendations.push('Low session volume. Review acquisition strategy.');
  }

  const metrics = {
    month: monthKey,
    days_with_data: dailyMetrics.length,
    total_sessions: totalSessions,
    sessions_by_tier: tierTotals,
    avg_latency_ms: Math.round(avgLatency),
    recommendations,
    computed_at: new Date().toISOString(),
  };

  await redis.set(`metrics:monthly:${monthKey}`, JSON.stringify(metrics));
  if (recommendations.length > 0) {
    await redis.set(
      `analytics:recommendations:${monthKey}`,
      JSON.stringify(recommendations)
    );
  }

  return NextResponse.json({ ok: true, metrics });
}
