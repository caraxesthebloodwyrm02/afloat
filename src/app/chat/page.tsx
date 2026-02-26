"use client";

import { ChatInput } from "@/components/chat-input";
import { ChatWindow } from "@/components/chat-window";
import { SessionStatus } from "@/components/session-status";
import { SessionTimer } from "@/components/session-timer";
import { useCallback, useEffect, useRef, useState } from "react";

type SessionState =
  | "waiting_for_input"
  | "waiting_for_response"
  | "brief_delivered"
  | "follow_up_delivered"
  | "session_timed_out"
  | "error"
  | "not_subscribed";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const MAX_DURATION_MS = 120_000;

function readToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("afloat_token") ?? "";
}

export default function ChatPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionState, setSessionState] = useState<SessionState>(() =>
    readToken() ? "waiting_for_input" : "not_subscribed",
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [startTime, setStartTime] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const tokenRef = useRef(readToken());

  useEffect(() => {
    const tok = tokenRef.current;
    if (!tok || sessionId) return;

    const controller = new AbortController();
    let cancelled = false;

    fetch("/api/v1/session/start", {
      method: "POST",
      headers: { Authorization: `Bearer ${tok}` },
      signal: controller.signal,
    })
      .then((res) => {
        if (cancelled) return;
        if (res.status === 403) {
          setSessionState("not_subscribed");
          return;
        }
        if (!res.ok) {
          setSessionState("error");
          setErrorMessage("Failed to start session.");
          return;
        }
        return res.json().then((data) => {
          if (cancelled) return;
          setSessionId(data.session_id);
          setStartTime(Date.now());
          setMessages([]);
          setSessionState("waiting_for_input");
          setErrorMessage("");
        });
      })
      .catch(() => {
        if (cancelled) return;
        setSessionState("error");
        setErrorMessage("Network error. Please try again.");
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [sessionId]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!sessionId || !tokenRef.current) return;

      setMessages((prev) => [...prev, { role: "user", content: text }]);
      setSessionState("waiting_for_response");

      try {
        const res = await fetch(`/api/v1/session/${sessionId}/message`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${tokenRef.current}`,
          },
          body: JSON.stringify({
            message: text,
            history: messages.slice(-4).map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          if (data.error === "session_timeout") {
            setSessionState("session_timed_out");
            return;
          }
          if (data.error === "session_complete") {
            setSessionState("follow_up_delivered");
            return;
          }
          setSessionState("error");
          setErrorMessage(data.message || "Something went wrong.");
          return;
        }

        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.brief },
        ]);

        if (data.session_status === "complete" || data.turns_remaining === 0) {
          setSessionState("follow_up_delivered");
        } else {
          setSessionState("brief_delivered");
        }
      } catch {
        setSessionState("error");
        setErrorMessage("Network error. Please try again.");
      }
    },
    [sessionId, messages],
  );

  const endSession = useCallback(async () => {
    if (!sessionId || !tokenRef.current) return;

    try {
      await fetch(`/api/v1/session/${sessionId}/end`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenRef.current}` },
      });
    } catch {
      // best-effort
    }

    setSessionState("follow_up_delivered");
  }, [sessionId]);

  const handleNewSession = useCallback(() => {
    setSessionId(null);
    setMessages([]);
    setSessionState("waiting_for_input");
    setErrorMessage("");
    setStartTime(0);
  }, []);

  const handleTimerExpire = useCallback(() => {
    if (
      sessionState === "waiting_for_input" ||
      sessionState === "brief_delivered"
    ) {
      setSessionState("session_timed_out");
      // Best-effort end session on server
      if (sessionId && tokenRef.current) {
        fetch(`/api/v1/session/${sessionId}/end`, {
          method: "POST",
          headers: { Authorization: `Bearer ${tokenRef.current}` },
        }).catch(() => {});
      }
    }
  }, [sessionState, sessionId]);

  const isTimerActive =
    sessionState === "waiting_for_input" ||
    sessionState === "waiting_for_response" ||
    sessionState === "brief_delivered";

  const isInputDisabled =
    sessionState === "waiting_for_response" ||
    sessionState === "follow_up_delivered" ||
    sessionState === "session_timed_out" ||
    sessionState === "error" ||
    sessionState === "not_subscribed";

  const showDone = sessionState === "brief_delivered";

  const showStatusOverlay =
    sessionState === "follow_up_delivered" ||
    sessionState === "session_timed_out" ||
    sessionState === "error" ||
    sessionState === "not_subscribed";

  return (
    <div className="flex flex-col h-[calc(100vh-57px)] max-w-2xl mx-auto">
      <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
        <h1 className="text-base font-semibold text-zinc-900">Afloat</h1>
        {startTime > 0 && (
          <SessionTimer
            startTime={startTime}
            maxDurationMs={MAX_DURATION_MS}
            isActive={isTimerActive}
            onExpire={handleTimerExpire}
          />
        )}
      </header>

      <ChatWindow
        messages={messages}
        isLoading={sessionState === "waiting_for_response"}
      />

      {showStatusOverlay ? (
        <SessionStatus
          state={sessionState}
          errorMessage={errorMessage}
          onNewSession={handleNewSession}
          onRetry={sessionState === "error" ? handleNewSession : undefined}
        />
      ) : (
        <ChatInput
          onSend={sendMessage}
          onDone={endSession}
          disabled={isInputDisabled}
          showDone={showDone}
          placeholder={
            messages.length === 0
              ? "Describe what you're stuck on..."
              : "Ask a follow-up..."
          }
        />
      )}
    </div>
  );
}
