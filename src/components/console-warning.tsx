'use client';

import { useEffect, useState } from 'react';
import type { ConsoleWarningState } from '@/hooks/useConsoleWarning';
import type { CTAAction } from '@/hooks/useConsoleWarning';
import type { GateType } from '@/types/session';

// ── Console Warning UI (CW-1..CW-4, contract v1.10.0) ──
// Renders in the main chat output area as a structured warning sequence.
// Each phase auto-advances every ~3-4s for the demo diff effect.

interface ConsoleWarningProps {
  state: ConsoleWarningState;
  sessionsUsed: number;
  gateTypesResolved: GateType[];
  totalSessionTimeFormatted: string;
  onCTA: (action: CTAAction) => void;
  onDismiss: () => void;
}

export function ConsoleWarning({
  state,
  sessionsUsed,
  gateTypesResolved,
  totalSessionTimeFormatted,
  onCTA,
  onDismiss,
}: ConsoleWarningProps) {
  const [fadeIn, setFadeIn] = useState(false);

  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      setFadeIn(false);
      raf2 = requestAnimationFrame(() => setFadeIn(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [state.phase]);

  if (!state.visible || state.dismissed) return null;

  const transition = fadeIn
    ? 'opacity-100 translate-y-0'
    : 'opacity-0 translate-y-2';

  return (
    <div className="mx-4 my-3 space-y-3">
      {/* CW-1: Rate Limit Notice */}
      {(state.phase === 'rate_limit' || state.phaseIndex > 0) && (
        <div
          className={`flex items-center gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg transition-all duration-500 ${state.phase === 'rate_limit' ? transition : 'opacity-100'}`}
        >
          <svg
            className="w-5 h-5 text-amber-500 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
            />
          </svg>
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            You&apos;ve used all {sessionsUsed} free sessions.
          </p>
        </div>
      )}

      {/* CW-2: Value Recap */}
      {(state.phase === 'value_recap' || state.phaseIndex > 1) && (
        <div
          className={`px-4 py-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg transition-all duration-500 ${state.phase === 'value_recap' ? transition : 'opacity-100'}`}
        >
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Here&apos;s what you unlocked:{' '}
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {gateTypesResolved.length > 0
                ? gateTypesResolved.map((g) => g.replace(/_/g, ' ')).join(', ')
                : 'context gate resolution'}
            </span>
            . {sessionsUsed} context gates cleared in{' '}
            {totalSessionTimeFormatted}.
          </p>
        </div>
      )}

      {/* CW-3: Guided Tour */}
      {(state.phase === 'guided_tour' || state.phaseIndex > 2) && (
        <div
          className={`px-4 py-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg transition-all duration-500 ${state.phase === 'guided_tour' ? transition : 'opacity-100'}`}
        >
          <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
            What&apos;s next with Starter ($12/qtr):
          </p>
          <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-0.5">&#x2022;</span>5 sessions
              per day — unblock decisions whenever you need
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-0.5">&#x2022;</span>
              Same fast, grounded, no-fluff responses
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-0.5">&#x2022;</span>
              Cancel anytime — quarterly billing, no lock-in
            </li>
          </ul>
        </div>
      )}

      {/* CW-4: Subscription CTA */}
      {(state.phase === 'cta' || state.phase === 'complete') && (
        <div
          className={`px-4 py-4 bg-zinc-900 dark:bg-zinc-50 rounded-lg transition-all duration-500 ${state.phase === 'cta' ? transition : 'opacity-100'}`}
        >
          <div className="flex flex-col gap-2">
            <button
              onClick={() => onCTA('starter_quarterly')}
              className="w-full h-10 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-sm font-semibold rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Continue with Starter — $12/qtr
            </button>
            <button
              onClick={() => onCTA('session_pack')}
              className="w-full h-9 bg-transparent text-zinc-300 dark:text-zinc-600 text-sm font-medium rounded-lg border border-zinc-700 dark:border-zinc-300 hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors"
            >
              Grab a Session Pack — $4.99 for 10
            </button>
            <button
              onClick={onDismiss}
              className="w-full h-8 text-zinc-500 text-xs hover:text-zinc-300 dark:hover:text-zinc-700 transition-colors"
            >
              Maybe later
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Demo Diff Feature (3-4s animated sequence) ──
// Shows offers/promotions as a quick console-style diff in the chat area.

interface PromoDemoProps {
  onComplete?: () => void;
}

export function PromotionDemo({ onComplete }: PromoDemoProps) {
  const [step, setStep] = useState(0);

  const diffs = [
    { prefix: '-', text: 'Session limit reached', color: 'text-red-400' },
    {
      prefix: '+',
      text: 'Starter: $12/qtr — 5 sessions/day, cancel anytime',
      color: 'text-green-400',
    },
    {
      prefix: '+',
      text: 'Session Pack: $4.99 — 10 sessions, no expiry',
      color: 'text-green-400',
    },
    {
      prefix: '+',
      text: 'Access Pass: $7 — 30 sessions, lifetime',
      color: 'text-emerald-400',
    },
  ];

  useEffect(() => {
    if (step >= diffs.length) {
      const t = setTimeout(() => onComplete?.(), 1000);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setStep((s) => s + 1), 800);
    return () => clearTimeout(t);
  }, [step, diffs.length, onComplete]);

  return (
    <div className="mx-4 my-3 font-mono text-xs bg-zinc-950 border border-zinc-800 rounded-lg p-3 space-y-1 overflow-hidden">
      <p className="text-zinc-500 mb-2">{'// offers & promotions'}</p>
      {diffs.slice(0, step).map((d, i) => (
        <p
          key={i}
          className={`${d.color} transition-opacity duration-300 animate-in fade-in`}
        >
          {d.prefix} {d.text}
        </p>
      ))}
      {step < diffs.length && (
        <span className="inline-block w-2 h-4 bg-zinc-400 animate-pulse" />
      )}
    </div>
  );
}
