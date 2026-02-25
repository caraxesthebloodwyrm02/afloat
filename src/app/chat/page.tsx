"use client";

import { useState, useCallback, useEffect } from "react";
import { ChatWindow } from "@/components/chat-window";
import { ChatInput } from "@/components/chat-input";
import { SessionTimer } from "@/components/session-timer";
import { SessionStatus } from "@/components/session-status";

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

export default function ChatPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionState, setSessionState] = useState<SessionState>("waiting_for_input");
  const [messages, setMessages] = useState<Message[]>([]);
  const [startTime, setStartTime] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [token, setToken] = useState<string>("");

  useEffect(() => {
    const stored = localStorage.getItem("afloat_token");
    if (!stored) {
      setSessionState("not_subscribed");
      return;
    }
    setToken(stored);
  }, []);

  const startSession = useCallback(async () => {
    if (!token) {
      setSessionState("not_subscribed");
      return;
    }

    try {
      const res = await fetch("/api/v1/session/start", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 403) {
        setSessionState("not_subscribed");
        return;
      }

      if (!res.ok) {
        setSessionState("error");
        setErrorMessage("Failed to start session.");
        return;
      }

      const data = await res.json();
      setSessionId(data.session_id);
      setStartTime(Date.now());
      setMessages([]);
      setSessionState("waiting_for_input");
      setErrorMessage("");
    } catch {
      setSessionState("error");
      setErrorMessage("Network error. Please try again.");
    }
  }, [token]);

  useEffect(() => {
    if (token && !sessionId) {
      startSession();
    }
  }, [token, sessionId, startSession]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!sessionId || !token) return;

      setMessages((prev) => [...prev, { role: "user", content: text }]);
      setSessionState("waiting_for_response");

      try {
        const res = await fetch(`/api/v1/session/${sessionId}/message`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ message: text }),
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
    [sessionId, token]
  );

  const endSession = useCallback(async () => {
    if (!sessionId || !token) return;

    try {
      await fetch(`/api/v1/session/${sessionId}/end`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // best-effort
    }

    setSessionState("follow_up_delivered");
  }, [sessionId, token]);

  const handleNewSession = useCallback(() => {
    setSessionId(null);
    setMessages([]);
    setSessionState("waiting_for_input");
    setErrorMessage("");
    setStartTime(0);
  }, []);

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
