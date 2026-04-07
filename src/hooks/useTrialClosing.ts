'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FREE_TRIAL_MAX_SESSIONS } from '@/types/session';
import type { GateType } from '@/types/session';

export interface TrialClosingState {
  isTrialUser: boolean;
  sessionsUsed: number;
  sessionsRemaining: number;
  isTrialExhausted: boolean;
  gateTypesResolved: GateType[];
  totalSessionTimeMs: number;
  closingTriggered: boolean;
}

interface UseTrialClosingOptions {
  tier: string;
  userId: string;
  onTrialClose?: (state: TrialClosingState) => void;
}

export function useTrialClosing({
  tier,
  userId,
  onTrialClose,
}: UseTrialClosingOptions) {
  const [state, setState] = useState<TrialClosingState>({
    isTrialUser: tier === 'free_trial',
    sessionsUsed: 0,
    sessionsRemaining: FREE_TRIAL_MAX_SESSIONS,
    isTrialExhausted: false,
    gateTypesResolved: [],
    totalSessionTimeMs: 0,
    closingTriggered: false,
  });

  const onTrialCloseRef = useRef(onTrialClose);

  useEffect(() => {
    onTrialCloseRef.current = onTrialClose;
  }, [onTrialClose]);

  // Fetch trial count on mount for free_trial users
  useEffect(() => {
    if (tier !== 'free_trial') return;
    const token = localStorage.getItem('afloat_token') ?? '';
    if (!token) return;

    fetch('/api/v1/trial/status', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setState((prev) => ({
          ...prev,
          sessionsUsed: data.sessions_used ?? 0,
          sessionsRemaining: Math.max(
            0,
            FREE_TRIAL_MAX_SESSIONS - (data.sessions_used ?? 0)
          ),
          isTrialExhausted:
            (data.sessions_used ?? 0) >= FREE_TRIAL_MAX_SESSIONS,
          gateTypesResolved: data.gate_types_resolved ?? [],
        }));
      })
      .catch(() => {});
  }, [tier, userId]);

  const recordTrialSession = useCallback(
    (gateType: GateType, durationMs: number) => {
      setState((prev) => {
        const sessionsUsed = prev.sessionsUsed + 1;
        const sessionsRemaining = Math.max(
          0,
          FREE_TRIAL_MAX_SESSIONS - sessionsUsed
        );
        const isTrialExhausted = sessionsUsed >= FREE_TRIAL_MAX_SESSIONS;
        const gateTypesResolved = prev.gateTypesResolved.includes(gateType)
          ? prev.gateTypesResolved
          : [...prev.gateTypesResolved, gateType];

        const nextState: TrialClosingState = {
          ...prev,
          sessionsUsed,
          sessionsRemaining,
          isTrialExhausted,
          gateTypesResolved,
          totalSessionTimeMs: prev.totalSessionTimeMs + durationMs,
          closingTriggered: isTrialExhausted,
        };

        // Fire closing callback when trial exhausted
        if (isTrialExhausted && !prev.closingTriggered) {
          setTimeout(() => onTrialCloseRef.current?.(nextState), 0);
        }

        return nextState;
      });
    },
    []
  );

  return { ...state, recordTrialSession };
}
