'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SubscriptionTier } from '@/types/session';

export interface SubscriptionState {
  tier: SubscriptionTier | 'unknown';
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'pending' | 'none';
  billingPeriod: string | null;
  sessionsRemaining: number | null;
  loading: boolean;
}

interface UseSubscriptionOptions {
  autoFetch?: boolean;
}

export function useSubscription({
  autoFetch = true,
}: UseSubscriptionOptions = {}) {
  const [state, setState] = useState<SubscriptionState>({
    tier: 'unknown',
    status: 'none',
    billingPeriod: null,
    sessionsRemaining: null,
    loading: true,
  });

  const fetchStatus = useCallback(async () => {
    const token = localStorage.getItem('afloat_token') ?? '';
    if (!token) {
      setState((prev) => ({ ...prev, loading: false, status: 'none' }));
      return;
    }

    try {
      const res = await fetch('/api/v1/subscription/status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setState((prev) => ({ ...prev, loading: false, status: 'none' }));
        return;
      }
      const data = await res.json();
      setState({
        tier: data.tier ?? 'unknown',
        status: data.status ?? 'none',
        billingPeriod: data.billing_period ?? null,
        sessionsRemaining: data.sessions_remaining ?? null,
        loading: false,
      });
    } catch {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => {
    if (!autoFetch) return;
    queueMicrotask(() => {
      void fetchStatus();
    });
  }, [autoFetch, fetchStatus]);

  const subscribe = useCallback(async (tier: string, billing?: string) => {
    const token = localStorage.getItem('afloat_token') ?? '';
    try {
      const res = await fetch('/api/v1/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tier, billing }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
      return data;
    } catch {
      return null;
    }
  }, []);

  return { ...state, fetchStatus, subscribe };
}
