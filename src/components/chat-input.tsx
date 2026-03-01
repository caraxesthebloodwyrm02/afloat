"use client";

import { useState, type FormEvent } from "react";

interface ChatInputProps {
  onSend: (message: string) => void;
  onDone: () => void;
  disabled: boolean;
  showDone: boolean;
  turnsRemaining?: number | null;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  onDone,
  disabled,
  showDone,
  turnsRemaining,
  placeholder = "Describe what you're stuck on...",
}: ChatInputProps) {
  const [input, setInput] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setInput("");
  }

  return (
    <div className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/80 px-4 py-3">
      {turnsRemaining != null && turnsRemaining > 0 && (
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-2">
          {turnsRemaining} {turnsRemaining === 1 ? "turn" : "turns"} remaining
        </p>
      )}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          className="flex-1 h-10 px-4 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 focus:border-blue-300 dark:focus:border-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          disabled={disabled || !input.trim()}
          className="h-10 px-4 text-sm font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Send
        </button>
        {showDone && (
          <button
            type="button"
            onClick={onDone}
            className="h-10 px-4 text-sm font-medium border border-green-300 dark:border-green-700 rounded-lg hover:bg-green-50 dark:hover:bg-green-950 transition-colors text-green-700 dark:text-green-400"
          >
            Done
          </button>
        )}
      </form>
    </div>
  );
}
