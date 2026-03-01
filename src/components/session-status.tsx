"use client";

type SessionState =
  | "waiting_for_input"
  | "waiting_for_response"
  | "brief_delivered"
  | "follow_up_delivered"
  | "session_timed_out"
  | "error"
  | "not_subscribed";

interface SessionStatusProps {
  state: SessionState;
  errorMessage?: string;
  onNewSession: () => void;
  onRetry?: () => void;
}

export function SessionStatus({
  state,
  errorMessage,
  onNewSession,
  onRetry,
}: SessionStatusProps) {
  if (state === "follow_up_delivered") {
    return (
      <div className="border-t-2 border-green-400 dark:border-green-600 px-4 py-6 text-center space-y-3">
        <p className="text-sm text-green-600 dark:text-green-400">Session complete.</p>
        <button
          onClick={onNewSession}
          className="h-9 px-4 text-sm font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
        >
          Start a new session
        </button>
      </div>
    );
  }

  if (state === "session_timed_out") {
    return (
      <div className="border-t-2 border-amber-400 dark:border-amber-600 px-4 py-6 text-center space-y-3">
        <p className="text-sm text-amber-600 dark:text-amber-400">Session time limit reached.</p>
        <button
          onClick={onNewSession}
          className="h-9 px-4 text-sm font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
        >
          Start a new session
        </button>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="border-t-2 border-red-400 dark:border-red-600 bg-red-50 dark:bg-red-950 px-4 py-6 text-center space-y-3">
        <p className="text-sm text-red-500">{errorMessage || "Something went wrong."}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="h-9 px-4 text-sm font-medium border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900 transition-colors text-red-600 dark:text-red-400"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  if (state === "not_subscribed") {
    return (
      <div className="border-t-2 border-zinc-200 dark:border-zinc-700 px-4 py-6 text-center space-y-4">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Subscribe to start using Afloat.</p>
        <a
          href="/subscribe"
          className="inline-flex items-center justify-center h-10 px-6 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
        >
          Subscribe — from $9/quarter
        </a>
      </div>
    );
  }

  return null;
}
