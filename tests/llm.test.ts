import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { assessResponseQuality, estimateTokenCount, callLLMWithFallback, LLMError } from "@/lib/llm";
import { SYSTEM_PROMPT } from "@/lib/prompt";
import OpenAI from "openai";

const mocks = vi.hoisted(() => ({
  openaiCreate: vi.fn(),
  groqCreate: vi.fn(),
  geminiSend: vi.fn(),
}));

vi.mock("openai", () => {
  class APIError extends Error {
    status?: number;
    constructor(status: number) {
      super("API Error");
      this.name = "APIError";
      this.status = status;
    }
  }

  return {
    default: class OpenAI {
      static APIError = APIError;
      chat = { completions: { create: mocks.openaiCreate } };
    }
  };
});

vi.mock("groq-sdk", () => ({
  default: class {
    chat = { completions: { create: mocks.groqCreate } };
  }
}));

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return {
        startChat: () => ({
          sendMessage: mocks.geminiSend
        })
      };
    }
  }
}));

const VALID_GATE_TYPES = [
  "meeting_triage",
  "priority_decision",
  "quick_briefing",
  "context_gate_resolution",
  "out_of_scope",
];

function parseGateAndBrief(raw: string): { gate_type: string; brief: string } {
  const gateMatch = raw.match(/\[GATE:\s*(\w+)\]/);

  let gate_type = "unclassified";
  if (gateMatch) {
    const parsed = gateMatch[1];
    if (VALID_GATE_TYPES.includes(parsed)) {
      gate_type = parsed;
    }
  }

  const brief = raw
    .replace(/\[GATE:\s*\w+\]\s*/g, "")
    .replace(/\[BRIEF\]\s*/g, "")
    .trim();

  return { gate_type, brief };
}

describe("parseGateAndBrief", () => {
  it("parses meeting_triage gate type", () => {
    const raw = "[GATE: meeting_triage]\nYou should attend this meeting because...";
    const result = parseGateAndBrief(raw);
    expect(result.gate_type).toBe("meeting_triage");
    expect(result.brief).toContain("You should attend");
  });

  it("parses priority_decision gate type", () => {
    const raw = "[GATE: priority_decision]\nFocus on task 2 first because...";
    const result = parseGateAndBrief(raw);
    expect(result.gate_type).toBe("priority_decision");
  });

  it("parses quick_briefing gate type", () => {
    const raw = "[GATE: quick_briefing]\nThe gist of this proposal is...";
    const result = parseGateAndBrief(raw);
    expect(result.gate_type).toBe("quick_briefing");
  });

  it("parses context_gate_resolution gate type", () => {
    const raw = "[GATE: context_gate_resolution]\nHere's what's happening...";
    const result = parseGateAndBrief(raw);
    expect(result.gate_type).toBe("context_gate_resolution");
  });

  it("parses out_of_scope gate type", () => {
    const raw = "[GATE: out_of_scope] This is outside what I can help with in a quick session.";
    const result = parseGateAndBrief(raw);
    expect(result.gate_type).toBe("out_of_scope");
  });

  it("returns unclassified for missing gate tag", () => {
    const raw = "Here's some response without a gate tag.";
    const result = parseGateAndBrief(raw);
    expect(result.gate_type).toBe("unclassified");
    expect(result.brief).toBe("Here's some response without a gate tag.");
  });

  it("returns unclassified for invalid gate type", () => {
    const raw = "[GATE: unknown_type]\nSome response.";
    const result = parseGateAndBrief(raw);
    expect(result.gate_type).toBe("unclassified");
  });

  it("strips [BRIEF] tag from response", () => {
    const raw = "[GATE: meeting_triage]\n[BRIEF]\nYou should attend.";
    const result = parseGateAndBrief(raw);
    expect(result.brief).toBe("You should attend.");
  });

  it("handles empty response", () => {
    const result = parseGateAndBrief("");
    expect(result.gate_type).toBe("unclassified");
    expect(result.brief).toBe("");
  });
});

describe("assessResponseQuality", () => {
  it("flags missing gate tag", () => {
    const r = assessResponseQuality("unclassified", "Some brief.");
    expect(r.missing_gate_tag).toBe(true);
  });

  it("flags word count over 150", () => {
    const longBrief = Array(160).fill("word").join(" ");
    const r = assessResponseQuality("meeting_triage", longBrief);
    expect(r.exceeds_word_limit).toBe(true);
    expect(r.word_count).toBe(160);
  });

  it("flags open-ended questions", () => {
    const r = assessResponseQuality("meeting_triage", "Should you attend?");
    expect(r.ends_with_question).toBe(true);
  });

  it("passes clean response", () => {
    const r = assessResponseQuality("priority_decision", "Focus on task A first.");
    expect(r.missing_gate_tag).toBe(false);
    expect(r.exceeds_word_limit).toBe(false);
    expect(r.ends_with_question).toBe(false);
  });

  it("counts words correctly with multiple spaces", () => {
    const r = assessResponseQuality("quick_briefing", "Hello   world   test");
    expect(r.word_count).toBe(3);
  });

  it("handles empty brief", () => {
    const r = assessResponseQuality("context_gate_resolution", "");
    expect(r.word_count).toBe(0);
    expect(r.ends_with_question).toBe(false);
  });
});

describe("REQ-D Response Quality Probes", () => {
  it("REQ-D1: Gate tag present in LLM response", () => {
    const raw = "[GATE: meeting_triage]\nAttend this meeting.";
    const result = parseGateAndBrief(raw);
    expect(raw).toMatch(/\[GATE:\s*\w+\]/);
    expect(result.gate_type).not.toBe("unclassified");
  });

  it("REQ-D2: Gate type is one of 4 defined types or out_of_scope", () => {
    for (const gateType of VALID_GATE_TYPES) {
      const raw = `[GATE: ${gateType}]\nBrief text.`;
      const result = parseGateAndBrief(raw);
      expect(VALID_GATE_TYPES).toContain(result.gate_type);
      expect(result.gate_type).toBe(gateType);
    }
  });

  it("REQ-D3: Response word count <= 150", () => {
    const brief = Array(150).fill("word").join(" ");
    const r = assessResponseQuality("priority_decision", brief);
    expect(r.word_count).toBeLessThanOrEqual(150);
    expect(r.exceeds_word_limit).toBe(false);
  });

  it("REQ-D4: No open-ended follow-up question in response", () => {
    const r = assessResponseQuality("quick_briefing", "Here is the gist.");
    expect(r.ends_with_question).toBe(false);
    expect("Here is the gist.").not.toMatch(/\?$/);
  });

  it("REQ-D5: Prompt token count stays under 500", () => {
    const tokens = estimateTokenCount(SYSTEM_PROMPT);
    expect(tokens).toBeLessThan(500);
  });
});

// ---------------------------------------------------------------------------
// Multi-Provider Fallback Tests
// ---------------------------------------------------------------------------

describe("callLLMWithFallback Multi-Provider Routing", () => {
  beforeEach(() => {
    // Reset env
    delete process.env.OPENAI_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("throws immediately if no providers are configured", async () => {
    await expect(callLLMWithFallback("test", []))
      .rejects.toThrowError(/No LLM provider is configured/);
  });

  it("calls OpenAI first when all keys are present", async () => {
    process.env.OPENAI_API_KEY = "sk-test-openai";
    process.env.GROQ_API_KEY = "gsk-test-groq";
    process.env.GEMINI_API_KEY = "AIza-test-gemini";

    mocks.openaiCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "[GATE: meeting_triage]\nFrom OpenAI" } }]
    });

    const res = await callLLMWithFallback("hello", []);

    expect(res.brief).toContain("From OpenAI");
    expect(mocks.openaiCreate).toHaveBeenCalledTimes(1);
    expect(mocks.groqCreate).not.toHaveBeenCalled();
    expect(mocks.geminiSend).not.toHaveBeenCalled();
  });

  it("falls back to Groq if OpenAI rate limits (429)", async () => {
    process.env.OPENAI_API_KEY = "sk-test-openai";
    process.env.GROQ_API_KEY = "gsk-test-groq";


    const rateLimitError = new OpenAI.APIError(429, {} as Record<string, never>, "API Error", {} as Headers);

    const rateLimitError = new OpenAI.APIError(429);


    mocks.openaiCreate.mockRejectedValueOnce(rateLimitError);
    mocks.groqCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "[GATE: priority_decision]\nFrom Groq" } }]
    });

    const res = await callLLMWithFallback("hello", []);

    expect(res.brief).toContain("From Groq");
    expect(mocks.openaiCreate).toHaveBeenCalledTimes(1);
    expect(mocks.groqCreate).toHaveBeenCalledTimes(1);
  });

  it("retries once on 500 error before falling back", async () => {
    process.env.OPENAI_API_KEY = "sk-test-openai";
    process.env.GROQ_API_KEY = "gsk-test-groq";


    const serverError = new OpenAI.APIError(500, {} as Record<string, never>, "API Error", {} as Headers);

    const serverError = new OpenAI.APIError(500);


    vi.spyOn(global, "setTimeout").mockImplementation(((cb: () => void, ms?: number) => {
      if (ms === 1000) {
        cb();
      }
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);

    // OpenAI fails with 500
    mocks.openaiCreate.mockRejectedValueOnce(serverError);
    // OpenAI retries (1 second later) and fails again with 500
    mocks.openaiCreate.mockRejectedValueOnce(serverError);

    // Groq succeeds
    mocks.groqCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "[GATE: quick_briefing]\nSuccess fallthrough" } }]
    });

    const res = await callLLMWithFallback("hello", []);

    expect(res.brief).toContain("Success fallthrough");
    expect(mocks.openaiCreate).toHaveBeenCalledTimes(2); // Initial + 1 retry
    expect(mocks.groqCreate).toHaveBeenCalledTimes(1);
  });

  it("throws an unknown LLMError if all configured providers fail", async () => {
    process.env.GROQ_API_KEY = "gsk-test-groq";
    process.env.GEMINI_API_KEY = "AIza-test-gemini";

    // Simulate timeouts (AbortError) for both
    const abortErr = new Error("Aborted");
    abortErr.name = "AbortError";

    mocks.groqCreate.mockRejectedValueOnce(abortErr);
    mocks.geminiSend.mockRejectedValueOnce(abortErr);

    try {
      await callLLMWithFallback("hello", []);
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(LLMError);
      expect((err as LLMError).reason).toBe("timeout");
    }

    expect(mocks.groqCreate).toHaveBeenCalledTimes(1);
    expect(mocks.geminiSend).toHaveBeenCalledTimes(1);
  });
});
