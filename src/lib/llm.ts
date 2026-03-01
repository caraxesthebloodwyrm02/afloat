import OpenAI from "openai";
import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { SYSTEM_PROMPT } from "./prompt";
import type { GateType } from "@/types/session";
import { recordSafetyEvent } from "./safety-telemetry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LLMResponse {
  gate_type: GateType;
  brief: string;
  raw: string;
}

export interface ResponseQualityFlags {
  missing_gate_tag: boolean;
  exceeds_word_limit: boolean;
  word_count: number;
  ends_with_question: boolean;
}

export class LLMError extends Error {
  reason: "timeout" | "rate_limited" | "server_error" | "unknown";

  constructor(message: string, reason: LLMError["reason"]) {
    super(message);
    this.name = "LLMError";
    this.reason = reason;
  }
}

// ---------------------------------------------------------------------------
// Parsing & quality
// ---------------------------------------------------------------------------

const VALID_GATE_TYPES: GateType[] = [
  "meeting_triage",
  "priority_decision",
  "quick_briefing",
  "context_gate_resolution",
  "out_of_scope",
];

function parseGateAndBrief(raw: string): {
  gate_type: GateType;
  brief: string;
} {
  const gateMatch = raw.match(/\[GATE:\s*(\w+)\]/);

  let gate_type: GateType = "unclassified";
  if (gateMatch) {
    const parsed = gateMatch[1] as GateType;
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

/**
 * Heuristic token count for GPT models (~4 chars per token for English).
 * Used for REQ-D5: SYSTEM_PROMPT must stay under 500 tokens.
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

export function assessResponseQuality(
  gateType: GateType,
  brief: string,
): ResponseQualityFlags {
  const wordCount = brief.split(/\s+/).filter(Boolean).length;
  return {
    missing_gate_tag: gateType === "unclassified",
    exceeds_word_limit: wordCount > 150,
    word_count: wordCount,
    ends_with_question: brief.trimEnd().endsWith("?"),
  };
}

// ---------------------------------------------------------------------------
// Provider chain
// ---------------------------------------------------------------------------

type ProviderCallFn = (
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
) => Promise<string>;

interface Provider {
  name: string;
  call: ProviderCallFn;
}

/**
 * Build the ordered provider list from environment variables.
 * Only providers with a configured API key are included.
 * Order: OpenAI (rank 1) → Groq (rank 2) → Gemini (rank 3).
 */
function buildProviders(): Provider[] {
  const providers: Provider[] = [];

  // Rank 1 — OpenAI (with optional baseURL for OpenRouter or any compatible endpoint)
  if (process.env.OPENAI_API_KEY) {
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      ...(process.env.OPENAI_BASE_URL
        ? { baseURL: process.env.OPENAI_BASE_URL }
        : {}),
    });

    providers.push({
      name: "openai",
      call: async (messages) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        try {
          const completion = await client.chat.completions.create(
            {
              model: "gpt-4o-mini",
              max_tokens: 300,
              temperature: 0.3,
              messages:
                messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
            },
            { signal: controller.signal },
          );
          return completion.choices[0]?.message?.content ?? "";
        } finally {
          clearTimeout(timeout);
        }
      },
    });
  }

  // Rank 2 — Groq (free tier, very low latency, llama-3.1-8b-instant)
  if (process.env.GROQ_API_KEY) {
    const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

    providers.push({
      name: "groq",
      call: async (messages) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        try {
          const completion = await client.chat.completions.create(
            {
              model: "llama-3.1-8b-instant",
              max_tokens: 300,
              temperature: 0.3,
              messages:
                messages as Groq.Chat.Completions.ChatCompletionMessageParam[],
            },
            { signal: controller.signal },
          );
          return completion.choices[0]?.message?.content ?? "";
        } finally {
          clearTimeout(timeout);
        }
      },
    });
  }

  // Rank 3 — Gemini (Google free tier, gemini-1.5-flash)
  if (process.env.GEMINI_API_KEY) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: SYSTEM_PROMPT,
    });

    providers.push({
      name: "gemini",
      call: async (messages) => {
        // Gemini expects history without the last user message,
        // which is sent via sendMessage separately.
        const history = messages
          .slice(1, -1) // drop system (handled via systemInstruction) and last user msg
          .map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          }));

        const chat = model.startChat({ history });
        const lastMessage = messages.at(-1);
        if (!lastMessage) return "";

        const result = await chat.sendMessage(lastMessage.content);
        return result.response.text();
      },
    });
  }

  return providers;
}

// ---------------------------------------------------------------------------
// Normalise errors from any provider into LLMError
// ---------------------------------------------------------------------------

function classifyError(err: unknown, providerName: string): LLMError {
  if (err instanceof Error && err.name === "AbortError") {
    return new LLMError("That took too long. Please try again.", "timeout");
  }

  // OpenAI SDK errors
  if (err instanceof OpenAI.APIError) {
    if (err.status === 429) {
      return new LLMError(
        `${providerName} rate limit reached. Trying next provider.`,
        "rate_limited",
      );
    }
    if (err.status && err.status >= 500) {
      return new LLMError(
        "I couldn't process that. Please try again.",
        "server_error",
      );
    }
  }

  // Groq SDK mirrors the OpenAI SDK error shape
  if (
    err instanceof Error &&
    "status" in err &&
    typeof (err as { status: unknown }).status === "number"
  ) {
    const status = (err as { status: number }).status;
    if (status === 429) {
      return new LLMError(
        `${providerName} rate limit reached. Trying next provider.`,
        "rate_limited",
      );
    }
    if (status >= 500) {
      return new LLMError(
        "I couldn't process that. Please try again.",
        "server_error",
      );
    }
  }

  return new LLMError("I couldn't process that. Please try again.", "unknown");
}

// ---------------------------------------------------------------------------
// Core call — single provider
// ---------------------------------------------------------------------------

/**
 * Call one specific provider. Throws LLMError on any failure.
 * Does not retry — retries and fallthrough happen at a higher level.
 */
async function callProvider(
  provider: Provider,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
): Promise<LLMResponse> {
  try {
    const raw = await provider.call(messages);

    if (!raw) {
      return {
        gate_type: "unclassified",
        brief:
          "I wasn't able to generate a useful response. Please try rephrasing.",
        raw: "",
      };
    }

    const { gate_type, brief } = parseGateAndBrief(raw);
    const qualityFlags = assessResponseQuality(gate_type, brief);

    // Fire-and-forget telemetry
    if (
      qualityFlags.missing_gate_tag ||
      qualityFlags.exceeds_word_limit ||
      qualityFlags.ends_with_question
    ) {
      recordSafetyEvent({
        event_type: "response_quality_flag",
        flags: qualityFlags,
      }).catch(() => {});
    }

    return { gate_type, brief, raw };
  } catch (err) {
    throw classifyError(err, provider.name);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the message array that every provider receives.
 */
function buildMessages(
  userMessage: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>,
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    ...conversationHistory.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];
}

/**
 * Call the LLM with ordered provider fallback.
 *
 * Strategy (mirrors the Gate Pattern in request_processing_contract.json §pipeline step 7):
 *   - Try each provider in rank order.
 *   - On rate_limited or any error: fall through to the next provider.
 *   - On server_error: retry the same provider once after 1 second before falling through.
 *   - Throw LLMError("unknown") only when all providers are exhausted.
 *
 * This replaces both callLLM and callLLMWithRetry from the previous implementation.
 * callLLMWithRetry is kept as an alias for backward compatibility.
 */
export async function callLLMWithFallback(
  userMessage: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<LLMResponse> {
  const providers = buildProviders();

  if (providers.length === 0) {
    throw new LLMError(
      "No LLM provider is configured. Set at least one of: OPENAI_API_KEY, GROQ_API_KEY, GEMINI_API_KEY.",
      "unknown",
    );
  }

  const messages = buildMessages(userMessage, conversationHistory);
  let lastError: LLMError | null = null;

  for (const provider of providers) {
    try {
      return await callProvider(provider, messages);
    } catch (err) {
      const llmErr =
        err instanceof LLMError
          ? err
          : new LLMError("Unknown error", "unknown");
      lastError = llmErr;

      // server_error: retry this provider once before falling through
      if (llmErr.reason === "server_error") {
        try {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return await callProvider(provider, messages);
        } catch {
          // fall through to next provider
        }
      }

      // rate_limited, timeout, unknown: fall through immediately
      continue;
    }
  }

  // All providers exhausted
  throw (
    lastError ??
    new LLMError(
      "All providers unavailable. Please try again later.",
      "unknown",
    )
  );
}

/**
 * Backward-compatible alias. All callers (session-message-adapter.ts etc.)
 * that reference callLLMWithRetry will now use the full fallback chain.
 */
export const callLLMWithRetry = callLLMWithFallback;

/**
 * Low-level single call to the primary provider (OpenAI).
 * Kept for direct use or testing. Does not fall back.
 */
export async function callLLM(
  userMessage: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<LLMResponse> {
  const providers = buildProviders();
  const primary = providers[0];

  if (!primary) {
    throw new LLMError(
      "No LLM provider is configured. Set at least one of: OPENAI_API_KEY, GROQ_API_KEY, GEMINI_API_KEY.",
      "unknown",
    );
  }

  const messages = buildMessages(userMessage, conversationHistory);
  return callProvider(primary, messages);
}
