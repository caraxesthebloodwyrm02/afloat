'use client';

import { useState, useEffect, useCallback } from 'react';

interface SessionTimerProps {
  startTime: number;
  maxDurationMs: number;
  isActive: boolean;
  onExpire?: () => void;
}

export function SessionTimer({
  startTime,
  maxDurationMs,
  isActive,
  onExpire,
}: SessionTimerProps) {
  'use no memo';
  const calcRemaining = useCallback(() => {
    if (!startTime) return maxDurationMs;
    const elapsed = Date.now() - startTime;
    return Math.max(0, maxDurationMs - elapsed);
  }, [startTime, maxDurationMs]);

  const [remaining, setRemaining] = useState(calcRemaining);

  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      const newRemaining = calcRemaining();
      setRemaining(newRemaining);
      if (newRemaining <= 0 && onExpire) {
        onExpire();
      }
    }, 200);
    return () => clearInterval(interval);
  }, [isActive, calcRemaining, onExpire]);

  const totalSeconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  const isLow = totalSeconds <= 30;
  const isCritical = totalSeconds <= 15;

  return (
    <span
      className={`tabular-nums text-sm font-mono ${
        isLow
          ? `bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-md ${isCritical ? 'animate-pulse' : ''}`
          : 'text-zinc-500 dark:text-zinc-400'
      }`}
    >
      {formatted}
    </span>
  );
}
