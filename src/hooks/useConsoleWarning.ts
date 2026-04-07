'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GateType } from '@/types/session';

// ── Console Warning Components (CW-1..CW-4 from contract v1.10.0) ──

export interface ConsoleWarningState {
  visible: boolean;
  phase:
    | 'idle'
    | 'rate_limit'
    | 'value_recap'
    | 'guided_tour'
    | 'cta'
    | 'complete';
  phaseIndex: number;
  dismissed: boolean;
}

export interface ConsoleWarningData {
  sessionsUsed: number;
  gateTypesResolved: GateType[];
  totalSessionTimeFormatted: string;
}

export type CTAAction = 'starter_quarterly' | 'session_pack' | 'dismiss';

interface UseConsoleWarningOptions {
  data: ConsoleWarningData;
  onCTAClick?: (action: CTAAction) => void;
  autoAdvanceMs?: number;
}

const PHASE_SEQUENCE: ConsoleWarningState['phase'][] = [
  'rate_limit',
  'value_recap',
  'guided_tour',
  'cta',
  'complete',
];

export function useConsoleWarning({
  data,
  onCTAClick,
  autoAdvanceMs = 3500,
}: UseConsoleWarningOptions) {
  const [state, setState] = useState<ConsoleWarningState>({
    visible: false,
    phase: 'idle',
    phaseIndex: -1,
    dismissed: false,
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCTAClickRef = useRef(onCTAClick);

  useEffect(() => {
    onCTAClickRef.current = onCTAClick;
  }, [onCTAClick]);

  const show = useCallback(() => {
    setState({
      visible: true,
      phase: 'rate_limit',
      phaseIndex: 0,
      dismissed: false,
    });
  }, []);

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setState((prev) => ({
      ...prev,
      dismissed: true,
      visible: false,
      phase: 'idle',
    }));
    onCTAClickRef.current?.('dismiss');
  }, []);

  const advance = useCallback(() => {
    setState((prev) => {
      const nextIndex = prev.phaseIndex + 1;
      if (nextIndex >= PHASE_SEQUENCE.length) {
        return { ...prev, phase: 'complete', phaseIndex: nextIndex };
      }
      return {
        ...prev,
        phase: PHASE_SEQUENCE[nextIndex],
        phaseIndex: nextIndex,
      };
    });
  }, []);

  const handleCTA = useCallback(
    (action: CTAAction) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      onCTAClickRef.current?.(action);
      if (action === 'dismiss') {
        dismiss();
      }
    },
    [dismiss]
  );

  // Auto-advance through phases for demo effect (~3-4s per phase)
  useEffect(() => {
    if (
      !state.visible ||
      state.dismissed ||
      state.phase === 'cta' ||
      state.phase === 'complete'
    ) {
      return;
    }

    timerRef.current = setTimeout(advance, autoAdvanceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state.visible, state.dismissed, state.phase, advance, autoAdvanceMs]);

  // ── Component content matching CW-1..CW-4 spec ──

  const components = {
    'CW-1': {
      id: 'CW-1' as const,
      type: 'rate_limit_notice' as const,
      content: `You've used all ${data.sessionsUsed} free sessions.`,
      style: 'warning_banner' as const,
    },
    'CW-2': {
      id: 'CW-2' as const,
      type: 'value_recap' as const,
      content: `Here's what you unlocked: ${data.gateTypesResolved.join(', ')}. ${data.sessionsUsed} context gates cleared in ${data.totalSessionTimeFormatted}.`,
      style: 'info_card' as const,
    },
    'CW-3': {
      id: 'CW-3' as const,
      type: 'guided_tour' as const,
      content: "What's next with Starter ($12/qtr):",
      items: [
        '5 sessions per day — unblock decisions whenever you need',
        'Same fast, grounded, no-fluff responses',
        'Cancel anytime — quarterly billing, no lock-in',
      ],
      style: 'feature_list' as const,
    },
    'CW-4': {
      id: 'CW-4' as const,
      type: 'subscription_cta' as const,
      actions: [
        {
          label: 'Continue with Starter — $12/qtr',
          plan: 'starter_quarterly' as CTAAction,
          primary: true,
        },
        {
          label: 'Grab a Session Pack — $4.99 for 10',
          plan: 'session_pack' as CTAAction,
          primary: false,
        },
        { label: 'Maybe later', plan: 'dismiss' as CTAAction, primary: false },
      ],
      style: 'button_group' as const,
    },
  };

  return {
    ...state,
    show,
    dismiss,
    advance,
    handleCTA,
    components,
    activeComponent:
      state.phase === 'rate_limit'
        ? components['CW-1']
        : state.phase === 'value_recap'
          ? components['CW-2']
          : state.phase === 'guided_tour'
            ? components['CW-3']
            : state.phase === 'cta'
              ? components['CW-4']
              : null,
  };
}
