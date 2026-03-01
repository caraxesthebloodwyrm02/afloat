"use client";

import { useEffect, useRef } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatWindowProps {
  messages: Message[];
  isLoading: boolean;
  turnsRemaining?: number | null;
}

export function ChatWindow({ messages, isLoading, turnsRemaining }: ChatWindowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, isLoading]);

  let assistantCount = 0;

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
      {messages.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center h-full gap-2">
          <div className="w-8 h-px bg-zinc-300 dark:bg-zinc-700" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Describe what you&apos;re stuck on.
          </p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Sessions are time-limited and private.
          </p>
        </div>
      )}

      {messages.map((msg, i) => {
        const isAssistant = msg.role === "assistant";
        if (isAssistant) assistantCount++;
        const isFirstBrief = isAssistant && assistantCount === 1;

        return (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                  : isFirstBrief
                    ? "bg-blue-50 dark:bg-blue-950 text-zinc-800 dark:text-zinc-200 border border-blue-100 dark:border-blue-900"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200"
              }`}
            >
              {msg.content}
            </div>
          </div>
        );
      })}

      {isLoading && (
        <div className="flex justify-start">
          <div className="bg-zinc-100 dark:bg-zinc-800 rounded-2xl px-4 py-3">
            <div className="flex gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-300 dark:bg-blue-700 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-2 h-2 rounded-full bg-blue-300 dark:bg-blue-700 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-2 h-2 rounded-full bg-blue-300 dark:bg-blue-700 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        </div>
      )}

      {!isLoading && turnsRemaining != null && turnsRemaining > 0 && messages.length > 0 && (
        <p className="text-xs text-zinc-400 dark:text-zinc-500 text-center">
          {turnsRemaining} {turnsRemaining === 1 ? "turn" : "turns"} remaining
        </p>
      )}
    </div>
  );
}
