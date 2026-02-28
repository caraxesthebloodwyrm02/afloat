/**
 * Edge case tests for session enforcement and input handling.
 *
 * Covers: empty input, whitespace-only, long input, special characters,
 * emoji, code snippets, non-English text, rapid state transitions,
 * and boundary timing conditions.
 */

import { describe, it, expect } from "vitest";
import { enforceSessionLimits } from "@/lib/session-controller";
import { MAX_LLM_CALLS, MAX_DURATION_MS } from "@/types/session";
import type { SessionState } from "@/types/session";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<SessionState> = {}): SessionState {
  return {
    session_id: "edge-test-session",
    user_id: "edge-test-user",
    tier: "trial",
    start_time: new Date().toISOString(),
    llm_call_count: 0,
    gate_type: null,
    latency_per_turn: [],
    conversation_history: [],
    session_completed: null,
    user_proceeded: null,
    error: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Empty / whitespace input
// ---------------------------------------------------------------------------

describe("empty and whitespace input", () => {
  it("rejects empty string", () => {
    const result = enforceSessionLimits(makeSession(), "");
    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe("empty_input");
  });

  it("rejects single space", () => {
    const result = enforceSessionLimits(makeSession(), " ");
    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe("empty_input");
  });

  it("rejects multiple spaces", () => {
    const result = enforceSessionLimits(makeSession(), "     ");
    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe("empty_input");
  });

  it("rejects tabs only", () => {
    const result = enforceSessionLimits(makeSession(), "\t\t\t");
    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe("empty_input");
  });

  it("rejects newlines only", () => {
    const result = enforceSessionLimits(makeSession(), "\n\n\n");
    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe("empty_input");
  });

  it("rejects mixed whitespace", () => {
    const result = enforceSessionLimits(makeSession(), " \t \n \r ");
    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe("empty_input");
  });
});

// ---------------------------------------------------------------------------
// Special characters, emoji, code, non-English
// ---------------------------------------------------------------------------

describe("special character input", () => {
  it("accepts message with emoji", () => {
    const result = enforceSessionLimits(makeSession(), "Should I attend this meeting? 🤔");
    expect(result.allowed).toBe(true);
  });

  it("accepts message with unicode characters", () => {
    const result = enforceSessionLimits(makeSession(), "Héllo wörld — dashes and «quotes»");
    expect(result.allowed).toBe(true);
  });

  it("accepts message in non-English (Bengali)", () => {
    const result = enforceSessionLimits(makeSession(), "আমি কি এই মিটিংয়ে যাবো?");
    expect(result.allowed).toBe(true);
  });

  it("accepts message in non-English (Japanese)", () => {
    const result = enforceSessionLimits(makeSession(), "この会議に出席すべきですか？");
    expect(result.allowed).toBe(true);
  });

  it("accepts message with code snippet", () => {
    const code = "```js\nconst x = await fetch('/api');\nconsole.log(x);\n```";
    const result = enforceSessionLimits(makeSession(), code);
    expect(result.allowed).toBe(true);
  });

  it("accepts message with HTML-like content", () => {
    const result = enforceSessionLimits(makeSession(), "<script>alert('xss')</script> Should I do this?");
    expect(result.allowed).toBe(true);
  });

  it("accepts message with SQL-like content", () => {
    const result = enforceSessionLimits(makeSession(), "SELECT * FROM users; DROP TABLE -- should I refactor this query?");
    expect(result.allowed).toBe(true);
  });

  it("accepts message with only emoji", () => {
    const result = enforceSessionLimits(makeSession(), "🤔🤷‍♂️");
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Long input (enforcement layer — route-level 2000 char check is separate)
// ---------------------------------------------------------------------------

describe("long input at enforcement layer", () => {
  it("accepts message at exactly 2000 characters", () => {
    const msg = "x".repeat(2000);
    const result = enforceSessionLimits(makeSession(), msg);
    expect(result.allowed).toBe(true);
  });

  it("accepts message at 1999 characters", () => {
    const msg = "a".repeat(1999);
    const result = enforceSessionLimits(makeSession(), msg);
    expect(result.allowed).toBe(true);
  });

  it("accepts very long message (enforcement layer does not cap length)", () => {
    const msg = "b".repeat(5000);
    const result = enforceSessionLimits(makeSession(), msg);
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Turn limit boundaries
// ---------------------------------------------------------------------------

describe("turn limit boundary conditions", () => {
  it("allows first message (llm_call_count = 0)", () => {
    const result = enforceSessionLimits(makeSession({ llm_call_count: 0 }), "hello");
    expect(result.allowed).toBe(true);
  });

  it("allows second message (llm_call_count = 1)", () => {
    const result = enforceSessionLimits(makeSession({ llm_call_count: 1 }), "follow-up");
    expect(result.allowed).toBe(true);
  });

  it("rejects at exact turn limit (llm_call_count = MAX_LLM_CALLS)", () => {
    const result = enforceSessionLimits(makeSession({ llm_call_count: MAX_LLM_CALLS }), "too many");
    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe("session_complete");
  });

  it("rejects beyond turn limit (llm_call_count > MAX_LLM_CALLS)", () => {
    const result = enforceSessionLimits(makeSession({ llm_call_count: MAX_LLM_CALLS + 1 }), "way too many");
    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe("session_complete");
  });
});

// ---------------------------------------------------------------------------
// Timer boundary conditions
// ---------------------------------------------------------------------------

describe("timer boundary conditions", () => {
  it("allows message at exactly 119 seconds", () => {
    const start = new Date(Date.now() - 119_000).toISOString();
    const result = enforceSessionLimits(makeSession({ start_time: start }), "still here");
    expect(result.allowed).toBe(true);
  });

  it("rejects message at exactly 121 seconds", () => {
    const start = new Date(Date.now() - 121_000).toISOString();
    const result = enforceSessionLimits(makeSession({ start_time: start }), "too late");
    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe("session_timeout");
  });

  it("rejects message well past timeout (5 minutes)", () => {
    const start = new Date(Date.now() - 300_000).toISOString();
    const result = enforceSessionLimits(makeSession({ start_time: start }), "way too late");
    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe("session_timeout");
  });

  it("allows message right after session start (0 seconds)", () => {
    const result = enforceSessionLimits(makeSession(), "instant");
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Combined edge conditions
// ---------------------------------------------------------------------------

describe("combined edge conditions", () => {
  it("empty input takes priority over turn exhaustion", () => {
    const result = enforceSessionLimits(
      makeSession({ llm_call_count: MAX_LLM_CALLS }),
      ""
    );
    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe("empty_input");
  });

  it("empty input takes priority over timeout", () => {
    const start = new Date(Date.now() - 200_000).toISOString();
    const result = enforceSessionLimits(
      makeSession({ start_time: start }),
      "   "
    );
    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe("empty_input");
  });

  it("timeout takes priority over turn exhaustion when both apply", () => {
    const start = new Date(Date.now() - 200_000).toISOString();
    const result = enforceSessionLimits(
      makeSession({ start_time: start, llm_call_count: MAX_LLM_CALLS }),
      "valid input"
    );
    expect(result.allowed).toBe(false);
    // enforceSessionLimits checks timeout before turns
    expect(result.errorCode).toBe("session_timeout");
  });
});

// ---------------------------------------------------------------------------
// MAX constants validation
// ---------------------------------------------------------------------------

describe("contract-aligned constants", () => {
  it("MAX_LLM_CALLS matches contract (2)", () => {
    expect(MAX_LLM_CALLS).toBe(2);
  });

  it("MAX_DURATION_MS matches contract (120000ms = 2 minutes)", () => {
    expect(MAX_DURATION_MS).toBe(120_000);
  });
});
