'use client';

import { useState } from 'react';

type PlanKey = 'starter' | 'pro';
type BillingKey = 'quarterly' | 'monthly' | 'annual';

export default function SubscribePage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [starterBilling, setStarterBilling] = useState<BillingKey>('quarterly');

  async function handleSubscribe(tier: PlanKey, billing?: BillingKey) {
    setLoading(tier);
    try {
      const res = await fetch('/api/v1/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, billing }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setLoading(null);
    }
  }

  const starterPrices: Record<BillingKey, string> = {
    quarterly: '$12/quarter',
    monthly: '$4.99/month',
    annual: '$29/year',
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-6">
      <div className="max-w-3xl w-full text-center space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Choose your plan
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400">
            5 free sessions to start — no card required.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl p-6 space-y-4 text-left border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wide">
                Starter
              </h2>
              <span className="text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full font-medium">
                Most popular
              </span>
            </div>
            <div className="text-3xl font-semibold text-zinc-900 dark:text-zinc-100">
              {starterBilling === 'quarterly' && (
                <>
                  {`$12`}
                  <span className="text-lg font-normal text-zinc-400">
                    /quarter
                  </span>
                </>
              )}
              {starterBilling === 'monthly' && (
                <>
                  {`$4.99`}
                  <span className="text-lg font-normal text-zinc-400">
                    /month
                  </span>
                </>
              )}
              {starterBilling === 'annual' && (
                <>
                  {`$29`}
                  <span className="text-lg font-normal text-zinc-400">
                    /year
                  </span>
                </>
              )}
            </div>
            <div className="flex gap-1 bg-zinc-200 dark:bg-zinc-800 rounded-lg p-0.5">
              {(['quarterly', 'monthly', 'annual'] as BillingKey[]).map((b) => (
                <button
                  key={b}
                  onClick={() => setStarterBilling(b)}
                  className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${
                    starterBilling === b
                      ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                  }`}
                >
                  {b === 'quarterly'
                    ? 'Quarterly'
                    : b === 'monthly'
                      ? 'Monthly'
                      : 'Annual'}
                </button>
              ))}
            </div>
            <ul className="text-sm text-zinc-500 dark:text-zinc-400 space-y-2">
              <li>5-minute sessions, 10 per day</li>
              <li>4 turns per session</li>
              <li>200 sessions included per month</li>
              <li>$0.10 per session after that</li>
            </ul>
            <button
              onClick={() => handleSubscribe('starter', starterBilling)}
              disabled={loading !== null}
              className="w-full h-10 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50"
            >
              {loading === 'starter'
                ? 'Redirecting...'
                : `Get Started — ${starterPrices[starterBilling]}`}
            </button>
          </div>

          <div className="bg-zinc-900 dark:bg-zinc-50 rounded-xl p-6 space-y-4 text-left border border-zinc-800 dark:border-zinc-200">
            <h2 className="text-sm font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">
              Pro
            </h2>
            <div className="text-3xl font-semibold text-white dark:text-zinc-900">
              $24
              <span className="text-lg font-normal text-zinc-400 dark:text-zinc-500">
                /quarter
              </span>
            </div>
            <ul className="text-sm text-zinc-400 dark:text-zinc-500 space-y-2">
              <li>Up to 30-minute sessions</li>
              <li>8 turns per session, unlimited daily</li>
              <li>Full model catalog + deep analysis</li>
              <li>$9.99/mo or $59/yr also available</li>
            </ul>
            <button
              onClick={() => handleSubscribe('pro', 'quarterly')}
              disabled={loading !== null}
              className="w-full h-10 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-sm font-medium rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              {loading === 'pro' ? 'Redirecting...' : 'Subscribe — $24/quarter'}
            </button>
          </div>
        </div>

        <p className="text-xs text-zinc-400">
          Metered billing — pay for what you use. Payments processed securely by
          Stripe.
        </p>
      </div>
    </div>
  );
}
