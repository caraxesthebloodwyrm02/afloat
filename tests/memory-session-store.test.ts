import { describe, it, expect, beforeEach } from "vitest";
import {
  createSession,
  getSession,
  getSessionDeadline,
  deleteSession,
  enforceSessionLimits,
  recordTurn,
  endSession,
  clearAllSessions,
} from "@/lib/memory-session-store";
import { getTierLimits } from "@/types/session";

describe("In-Memory Session Store", () => {
  beforeEach(() => {
    clearAllSessions();
  });

  describe("createSession", () => {
    it("creates a session with correct initial state", () => {
      const session = createSession("user-123", "trial");
      expect(session.session_id).toBeDefined();
      expect(session.user_id).toBe("user-123");
      expect(session.tier).toBe("trial");
      expect(session.llm_call_count).toBe(0);
      expect(session.gate_type).toBeNull();
      expect(session.latency_per_turn).toEqual([]);
      expect(session.conversation_history).toEqual([]);
      expect(session.start_time).toBeDefined();
    });

    it("defaults to trial tier when not specified", () => {
      const session = createSession("user-456");
      expect(session.tier).toBe("trial");
    });

    it("stores session in memory for retrieval", () => {
      const session = createSession("user-789");
      const retrieved = getSession(session.session_id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.session_id).toBe(session.session_id);
    });
  });

  describe("getSession", () => {
    it("returns null for non-existent session", () => {
      const retrieved = getSession("non-existent-id");
      expect(retrieved).toBeNull();
    });
  });

  describe("getSessionDeadline", () => {
    it("returns correct deadline based on tier", () => {
      const session = createSession("user-123", "trial");
      const limits = getTierLimits("trial");
      const deadline = getSessionDeadline(session.session_id);
      
      expect(deadline).not.toBeNull();
      const expectedDeadline = new Date(session.start_time).getTime() + limits.maxDurationMs;
      expect(deadline).toBe(expectedDeadline);
    });
  });

  describe("deleteSession", () => {
    it("removes session from memory", () => {
      const session = createSession("user-123");
      expect(getSession(session.session_id)).not.toBeNull();
      
      deleteSession(session.session_id);
      expect(getSession(session.session_id)).toBeNull();
    });
  });
});

describe("Session Enforcement Rules", () => {
  beforeEach(() => {
    clearAllSessions();
  });

  describe("Empty Input Check", () => {
    it("rejects empty message", () => {
      const session = createSession("user-123");
      const deadline = getSessionDeadline(session.session_id)!;
      const result = enforceSessionLimits(session, "", deadline);
      
      expect(result.allowed).toBe(false);
      expect(result.errorCode).toBe("empty_input");
      expect(result.errorMessage).toBe("Please describe what you're stuck on.");
    });

    it("rejects whitespace-only message", () => {
      const session = createSession("user-123");
      const deadline = getSessionDeadline(session.session_id)!;
      const result = enforceSessionLimits(session, "   \n\t  ", deadline);
      
      expect(result.allowed).toBe(false);
      expect(result.errorCode).toBe("empty_input");
    });

    it("allows message with content", () => {
      const session = createSession("user-123");
      const deadline = getSessionDeadline(session.session_id)!;
      const result = enforceSessionLimits(session, "Hello world", deadline);
      
      expect(result.allowed).toBe(true);
    });
  });

  describe("Timer Enforcement (120-second server-side)", () => {
    it("allows requests within deadline", () => {
      const session = createSession("user-123");
      const deadline = Date.now() + 60_000;
      const result = enforceSessionLimits(session, "Test message", deadline);
      
      expect(result.allowed).toBe(true);
    });

    it("rejects requests after deadline with session_timeout error", () => {
      const session = createSession("user-123");
      const expiredDeadline = Date.now() - 1000;
      const result = enforceSessionLimits(session, "Test message", expiredDeadline);
      
      expect(result.allowed).toBe(false);
      expect(result.errorCode).toBe("session_timeout");
      expect(result.errorMessage).toBe("Session time limit reached.");
    });

    it("uses trial tier deadline (120s / 120000ms)", () => {
      const limits = getTierLimits("trial");
      
      expect(limits.maxDurationMs).toBe(120_000);
    });
  });

  describe("Turn Limit Enforcement (max 2 LLM calls / max 3 turns)", () => {
    it("allows first LLM call (turn count 0)", () => {
      const session = createSession("user-123");
      session.llm_call_count = 0;
      const deadline = getSessionDeadline(session.session_id)!;
      const result = enforceSessionLimits(session, "First message", deadline);
      
      expect(result.allowed).toBe(true);
    });

    it("allows second LLM call (turn count 1)", () => {
      const session = createSession("user-123");
      session.llm_call_count = 1;
      const deadline = getSessionDeadline(session.session_id)!;
      const result = enforceSessionLimits(session, "Follow-up message", deadline);
      
      expect(result.allowed).toBe(true);
    });

    it("rejects third LLM call (turn count 2) with session_complete error", () => {
      const session = createSession("user-123");
      session.llm_call_count = 2;
      const deadline = getSessionDeadline(session.session_id)!;
      const result = enforceSessionLimits(session, "Third message", deadline);
      
      expect(result.allowed).toBe(false);
      expect(result.errorCode).toBe("session_complete");
      expect(result.errorMessage).toBe("Session limit reached.");
    });

    it("correctly tracks turns_remaining after each call", () => {
      const session = createSession("user-123");
      const limits = getTierLimits("trial");
      
      expect(limits.maxLlmCalls - session.llm_call_count).toBe(2);
      
      session.llm_call_count = 1;
      expect(limits.maxLlmCalls - session.llm_call_count).toBe(1);
      
      session.llm_call_count = 2;
      expect(limits.maxLlmCalls - session.llm_call_count).toBe(0);
    });
  });

  describe("recordTurn", () => {
    it("increments llm_call_count", () => {
      const session = createSession("user-123");
      const initialCount = session.llm_call_count;
      
      recordTurn(session, 500, "priority_decision", "Test brief", "Test message");
      
      expect(session.llm_call_count).toBe(initialCount + 1);
    });

    it("records latency in seconds", () => {
      const session = createSession("user-123");
      
      recordTurn(session, 1500, "meeting_triage", "Brief", "Message");
      
      expect(session.latency_per_turn).toContain(1.5);
    });

    it("sets gate_type on first turn only", () => {
      const session = createSession("user-123");
      
      recordTurn(session, 100, "priority_decision", "Brief 1", "Message 1");
      expect(session.gate_type).toBe("priority_decision");
      
      recordTurn(session, 100, "meeting_triage", "Brief 2", "Message 2");
      expect(session.gate_type).toBe("priority_decision");
    });

    it("appends to conversation_history", () => {
      const session = createSession("user-123");
      
      recordTurn(session, 100, "meeting_triage", "First brief", "First message");
      
      expect(session.conversation_history).toHaveLength(2);
      expect(session.conversation_history[0]).toEqual({ role: "user", content: "First message" });
      expect(session.conversation_history[1]).toEqual({ role: "assistant", content: "First brief" });
    });
  });
});

describe("endSession", () => {
  beforeEach(() => {
    clearAllSessions();
  });

  it("marks session as completed", () => {
    const session = createSession("user-123");
    const result = endSession(session.session_id);
    
    expect(result).not.toBeNull();
    expect(result!.session_completed).toBe(true);
  });

  it("returns null for non-existent session", () => {
    const result = endSession("non-existent-id");
    expect(result).toBeNull();
  });
});

describe("Multiple Sessions", () => {
  beforeEach(() => {
    clearAllSessions();
  });

  it("maintains separate state for different sessions", () => {
    const session1 = createSession("user-1");
    const session2 = createSession("user-2");
    
    recordTurn(session1, 100, "priority_decision", "Brief 1", "Message 1");
    recordTurn(session2, 200, "meeting_triage", "Brief 2", "Message 2");
    
    const retrieved1 = getSession(session1.session_id);
    const retrieved2 = getSession(session2.session_id);
    
    expect(retrieved1!.llm_call_count).toBe(1);
    expect(retrieved1!.gate_type).toBe("priority_decision");
    expect(retrieved2!.llm_call_count).toBe(1);
    expect(retrieved2!.gate_type).toBe("meeting_triage");
  });
});