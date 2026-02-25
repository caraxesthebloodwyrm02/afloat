"use client";

import { useState, type FormEvent } from "react";

interface ChatInputProps {
  onSend: (message: string) => void;
  onDone: () => void;
  disabled: boolean;
  showDone: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  onDone,
  disabled,
  showDone,
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
    <div className="border-t border-zinc-100 px-4 py-3">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          className="flex-1 h-10 px-4 text-sm rounded-lg border border-zinc-200 bg-white placeholder:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          disabled={disabled || !input.trim()}
          className="h-10 px-4 text-sm font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Send
        </button>
        {showDone && (
          <button
            type="button"
            onClick={onDone}
            className="h-10 px-4 text-sm font-medium border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors text-zinc-600"
          >
            Done
          </button>
        )}
      </form>
    </div>
  );
}
