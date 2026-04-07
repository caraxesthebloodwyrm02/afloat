import { NextRequest, NextResponse } from 'next/server';
import { getRedis } from '@/lib/redis';

function getWeekKey(): string {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const weekNum = Math.ceil(
    ((now.getTime() - jan1.getTime()) / 86400_000 + jan1.getDay() + 1) / 7
  );
  return `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function getPast7Days(): string[] {
  const days: string[] = [];
  for (let i = 1; i <= 7; i++) {
    days.push(new Date(Date.now() - i * 86400_000).toISOString().split('T')[0]);
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
  const weekKey = getWeekKey();
  const days = getPast7Days();

  const dailyMetrics: DailyMetrics[] = [];
  for (const day of days) {
    const raw = await redis.get<string>(`metrics:daily:${day}`);
    if (raw) {
      dailyMetrics.push(
        (typeof raw === 'string' ? JSON.parse(raw) : raw) as DailyMetrics
      );
    }
  }

  if (dailyMetrics.length === 0) {
    const empty = { week: weekKey, status: 'no_data', days_with_data: 0 };
    await redis.set(`metrics:weekly:${weekKey}`, JSON.stringify(empty));
    return NextResponse.json({ ok: true, metrics: empty });
  }

  const totalSessions = dailyMetrics.reduce((s, d) => s + d.total_sessions, 0);
  const avgLatency =
    dailyMetrics.reduce((s, d) => s + d.avg_latency_ms, 0) /
    dailyMetrics.length;
  const avgSuccessRate =
    dailyMetrics.reduce((s, d) => s + d.session_success_rate, 0) /
    dailyMetrics.length;
  const avgGatePass =
    dailyMetrics.reduce((s, d) => s + d.gate_pass_rate, 0) /
    dailyMetrics.length;
  const totalTriggers = dailyMetrics.reduce((s, d) => s + d.triggers_fired, 0);

  const tierTotals: Record<string, number> = {};
  for (const d of dailyMetrics) {
    for (const [tier, count] of Object.entries(d.sessions_by_tier)) {
      tierTotals[tier] = (tierTotals[tier] ?? 0) + count;
    }
  }

  const notes: string[] = [];
  if (avgSuccessRate < 0.95)
    notes.push(
      `Session success rate below target: ${(avgSuccessRate * 100).toFixed(1)}%`
    );
  if (avgLatency > 3000)
    notes.push(`Average latency above 3s: ${Math.round(avgLatency)}ms`);
  if (avgGatePass < 0.7)
    notes.push(
      `Gate pass rate below target: ${(avgGatePass * 100).toFixed(1)}%`
    );
  if (totalTriggers > 0)
    notes.push(`${totalTriggers} analytics triggers fired this week`);

  const metrics = {
    week: weekKey,
    days_with_data: dailyMetrics.length,
    total_sessions: totalSessions,
    sessions_by_tier: tierTotals,
    avg_latency_ms: Math.round(avgLatency),
    avg_success_rate: Math.round(avgSuccessRate * 1000) / 1000,
    avg_gate_pass_rate: Math.round(avgGatePass * 1000) / 1000,
    total_triggers_fired: totalTriggers,
    notes,
    computed_at: new Date().toISOString(),
  };

  await redis.set(`metrics:weekly:${weekKey}`, JSON.stringify(metrics));
  if (notes.length > 0) {
    await redis.rpush(`analytics:notes:${weekKey}`, ...notes);
  }

  return NextResponse.json({ ok: true, metrics });
}
