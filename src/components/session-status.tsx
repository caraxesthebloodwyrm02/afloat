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
      <div className="px-4 py-3 text-center space-y-3">
        <p className="text-sm text-zinc-400">Session complete.</p>
        <button
          onClick={onNewSession}
          className="h-9 px-4 text-sm font-medium border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors text-zinc-600"
        >
          Start a new session
        </button>
      </div>
    );
  }

  if (state === "session_timed_out") {
    return (
      <div className="px-4 py-3 text-center space-y-3">
        <p className="text-sm text-zinc-400">Session time limit reached.</p>
        <button
          onClick={onNewSession}
          className="h-9 px-4 text-sm font-medium border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors text-zinc-600"
        >
          Start a new session
        </button>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="px-4 py-3 text-center space-y-3">
        <p className="text-sm text-red-500">{errorMessage || "Something went wrong."}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="h-9 px-4 text-sm font-medium border border-red-200 rounded-lg hover:bg-red-50 transition-colors text-red-600"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  if (state === "not_subscribed") {
    return (
      <div className="px-4 py-6 text-center space-y-4">
        <p className="text-sm text-zinc-500">Subscribe to start using Afloat.</p>
        <a
          href="/subscribe"
          className="inline-flex items-center justify-center h-10 px-6 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors"
        >
          Subscribe — $3/month
        </a>
      </div>
    );
  }

  return null;
}
