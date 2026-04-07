import type { LifecycleSummary } from './events';
import type { GateType } from '@/types/session';

// ── Lifecycle Messaging Engine (contract v1.10.0 product_strategy) ──
// Generates targeted, personalized messages based on user journey stage,
// usage patterns, and selectively picked accomplishments.

export type MessageChannel = 'in_app' | 'email' | 'console_warning';
export type MessageIntent =
  | 'first_buyer'
  | 'trial_close'
  | 'winback'
  | 'upgrade'
  | 'retention';

export interface TargetedMessage {
  intent: MessageIntent;
  channel: MessageChannel;
  headline: string;
  body: string;
  cta: { label: string; action: string } | null;
  personalization: Record<string, string>;
}

// ── Gate type → human-readable accomplishment mapping ──

const GATE_ACCOMPLISHMENTS: Record<GateType, string> = {
  meeting_triage: 'triaged a meeting decision',
  priority_decision: 'sorted a priority conflict',
  quick_briefing: 'got a quick briefing',
  context_gate_resolution: 'resolved a context gate',
  out_of_scope: 'tested the scope boundary',
  unclassified: 'explored the assistant',
};

function formatGateAccomplishments(gates: GateType[]): string {
  if (gates.length === 0) return "explored Afloat's capabilities";
  return gates
    .filter((g) => g !== 'out_of_scope' && g !== 'unclassified')
    .map((g) => GATE_ACCOMPLISHMENTS[g])
    .join(', ');
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m`;
}

// ── First Buyer Messaging (landing new subscribers) ──

export function generateFirstBuyerMessage(
  summary: LifecycleSummary
): TargetedMessage {
  const accomplishments = formatGateAccomplishments(summary.gate_types_used);

  if (summary.sessions_total === 0) {
    return {
      intent: 'first_buyer',
      channel: 'in_app',
      headline: 'Your first session is waiting',
      body: "Describe what you're stuck on — a meeting decision, a priority conflict, or anything that needs a quick second opinion. 3 free sessions, no commitment.",
      cta: { label: 'Start your first session', action: '/chat' },
      personalization: { stage: 'pre_first_session' },
    };
  }

  if (summary.journey_stage === 'trial' && summary.sessions_total < 3) {
    return {
      intent: 'first_buyer',
      channel: 'in_app',
      headline: `${3 - summary.sessions_total} free session${3 - summary.sessions_total > 1 ? 's' : ''} left`,
      body: `You've already ${accomplishments}. Use your remaining sessions to see the full value.`,
      cta: { label: 'Continue exploring', action: '/chat' },
      personalization: {
        sessions_left: String(3 - summary.sessions_total),
        accomplishments,
      },
    };
  }

  return {
    intent: 'first_buyer',
    channel: 'in_app',
    headline: 'Ready to continue?',
    body: `You ${accomplishments} across ${summary.sessions_total} sessions. Starter is $12/quarter — same fast, grounded responses, 5 sessions per day.`,
    cta: { label: 'Get Started — $12/quarter', action: '/subscribe' },
    personalization: {
      sessions_total: String(summary.sessions_total),
      accomplishments,
    },
  };
}

// ── Trial Close Messaging (session 3/3 reached) ──

export function generateTrialCloseMessage(
  summary: LifecycleSummary,
  totalTimeMs: number
): TargetedMessage {
  const accomplishments = formatGateAccomplishments(summary.gate_types_used);
  const timeStr = formatDuration(totalTimeMs);

  return {
    intent: 'trial_close',
    channel: 'console_warning',
    headline: 'Trial complete',
    body: `You ${accomplishments} in ${timeStr}. Your next session is one click away.`,
    cta: {
      label: 'Continue with Starter — $12/qtr',
      action: '/subscribe?tier=starter',
    },
    personalization: {
      accomplishments,
      time_formatted: timeStr,
      gate_count: String(summary.gate_types_used.length),
    },
  };
}

// ── Win-back Messaging (churned users) ──

export function generateWinbackMessage(
  summary: LifecycleSummary
): TargetedMessage {
  const daysSinceActive = summary.last_active
    ? Math.round(
        (Date.now() - new Date(summary.last_active).getTime()) /
          (24 * 60 * 60 * 1000)
      )
    : 0;

  // Offer session pack for light re-engagement, access pass for deeper win-back
  const isLongChurn = daysSinceActive > 30;

  if (isLongChurn) {
    return {
      intent: 'winback',
      channel: 'email',
      headline: 'We kept your seat',
      body: `It's been ${daysSinceActive} days. Grab an Access Pass — 30 sessions for $7, no subscription needed. Use them whenever.`,
      cta: {
        label: 'Get Access Pass — $7',
        action: '/subscribe?tier=access_pass',
      },
      personalization: {
        days_inactive: String(daysSinceActive),
        previous_tier: summary.tier,
        offer: 'access_pass',
      },
    };
  }

  return {
    intent: 'winback',
    channel: 'email',
    headline: "Quick decisions don't wait",
    body: `A Session Pack gets you 10 sessions for $4.99 — no commitment, no expiry. Pick up where you left off.`,
    cta: {
      label: 'Grab a Session Pack — $4.99',
      action: '/subscribe?tier=session_pack',
    },
    personalization: {
      days_inactive: String(daysSinceActive),
      previous_tier: summary.tier,
      offer: 'session_pack',
    },
  };
}

// ── Upgrade Messaging (starter → pro migration) ──

export function generateUpgradeMessage(
  summary: LifecycleSummary
): TargetedMessage {
  return {
    intent: 'upgrade',
    channel: 'in_app',
    headline: "You're hitting the ceiling",
    body: `${summary.sessions_total} sessions and counting. Pro gives you 30-minute sessions, 6 turns, and no daily limit — $24/quarter.`,
    cta: { label: 'Upgrade to Pro — $24/qtr', action: '/subscribe?tier=pro' },
    personalization: {
      sessions_total: String(summary.sessions_total),
      gate_types: String(summary.gate_types_used.length),
    },
  };
}

// ── Compressed Lifecycle Summary (concise, insight-highlighted) ──

export function compressLifecycleSummary(summary: LifecycleSummary): string {
  const lines: string[] = [];
  lines.push(`[${summary.journey_stage.toUpperCase()}] ${summary.user_id}`);
  lines.push(
    `Tier: ${summary.tier}${summary.billing_period ? ` (${summary.billing_period})` : ''}`
  );
  lines.push(
    `Sessions: ${summary.sessions_total} | Gates: ${summary.gate_types_used.join(', ') || 'none'}`
  );

  if (summary.time_to_conversion_ms !== null) {
    lines.push(
      `Time to convert: ${formatDuration(summary.time_to_conversion_ms)}`
    );
  }

  if (summary.insights.length > 0) {
    lines.push(`Insights: ${summary.insights[0]}`);
    if (summary.insights.length > 1) {
      lines.push(`  +${summary.insights.length - 1} more`);
    }
  }

  return lines.join('\n');
}

// ── Message Router (selects best message for user state) ──

export function routeMessage(summary: LifecycleSummary): TargetedMessage {
  switch (summary.journey_stage) {
    case 'trial':
      return generateFirstBuyerMessage(summary);
    case 'at_risk':
      return generateTrialCloseMessage(
        summary,
        summary.time_to_first_session_ms ?? 0
      );
    case 'churned':
      return generateWinbackMessage(summary);
    case 'active':
      if (summary.sessions_total > 20) {
        return generateUpgradeMessage(summary);
      }
      return {
        intent: 'retention',
        channel: 'in_app',
        headline: 'Welcome back',
        body: 'What do you need to decide today?',
        cta: null,
        personalization: {},
      };
    default:
      return generateFirstBuyerMessage(summary);
  }
}
