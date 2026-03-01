import OpenAI from "openai";
import { SYSTEM_PROMPT } from "./prompt";
import type { GateType } from "@/types/session";
import { recordSafetyEvent } from "./safety-telemetry";

type LLMProvider = "openai" | "ollama" | "anthropic";

let openaiClient: OpenAI | null = null;

interface ProviderConfig {
  provider: LLMProvider;
}

function detectProvider(): ProviderConfig {
  if (process.env.OPENAI_API_KEY) return { provider: "openai" };
  if (process.env.OLLAMA_BASE_URL) return { provider: "ollama" };
  if (process.env.ANTHROPIC_API_KEY) return { provider: "anthropic" };
  throw new Error(
    "No LLM provider configured. Set one of: OPENAI_API_KEY, OLLAMA_BASE_URL, ANTHROPIC_API_KEY"
  );
}

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const { provider } = detectProvider();
    if (provider === "ollama") {
      const baseURL = process.env.OLLAMA_BASE_URL!.replace(/\/+$/, "") + "/v1";
      openaiClient = new OpenAI({ baseURL, apiKey: "ollama" });
    } else if (provider === "openai") {
      openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
  }
  return openaiClient!;
}

function getOllamaModel(): string {
  return process.env.OLLAMA_MODEL ?? "llama3";
}

async function callAnthropic(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  systemPrompt: string
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");

  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 300,
        system: systemPrompt,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      if (response.status === 429) {
        throw new LLMError("The service is busy. Please try again in a moment.", "rate_limited");
      }
      if (response.status >= 500) {
        throw new LLMError("I couldn't process that. Please try again.", "server_error");
      }
      throw new LLMError("I couldn't process that. Please try again.", "unknown");
    }

    const data = await response.json();
    const textBlock = data.content?.find((b: { type: string }) => b.type === "text");
    return textBlock?.text ?? "";
  } catch (error: unknown) {
    clearTimeout(timeout);
    if (error instanceof LLMError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new LLMError("That took too long. Please try again.", "timeout");
    }
    throw new LLMError("I couldn't process that. Please try again.", "unknown");
  }
}

const VALID_GATE_TYPES: GateType[] = [
  "meeting_triage",
  "priority_decision",
  "quick_briefing",
  "context_gate_resolution",
  "out_of_scope",
];

/**
 * Heuristic token count for GPT models (~4 chars per token for English).
 * Used for REQ-D5: SYSTEM_PROMPT must stay under 500 tokens.
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface LLMResponse {
  gate_type: GateType;
  brief: string;
  raw: string;
}

function parseGateAndBrief(raw: string): { gate_type: GateType; brief: string } {
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

export interface ResponseQualityFlags {
  missing_gate_tag: boolean;
  exceeds_word_limit: boolean;
  word_count: number;
  ends_with_question: boolean;
}

export function assessResponseQuality(gateType: GateType, brief: string): ResponseQualityFlags {
  const wordCount = brief.split(/\s+/).filter(Boolean).length;
  return {
    missing_gate_tag: gateType === "unclassified",
    exceeds_word_limit: wordCount > 150,
    word_count: wordCount,
    ends_with_question: brief.trimEnd().endsWith("?"),
  };
}

export async function callLLM(
  userMessage: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>
): Promise<LLMResponse> {
  const { provider } = detectProvider();

  const allMessages: Array<{ role: "user" | "assistant"; content: string }> = [
    ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: userMessage },
  ];

  let raw: string;

  if (provider === "anthropic") {
    raw = await callAnthropic(allMessages, SYSTEM_PROMPT);
  } else {
    // OpenAI or Ollama (OpenAI-compatible)
    const client = getOpenAIClient();
    const model =
      provider === "ollama"
        ? getOllamaModel()
        : (process.env.OPENAI_MODEL ?? "gpt-4o-mini");

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...allMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const completion = await client.chat.completions.create(
        {
          model,
          max_tokens: 300,
          temperature: 0.3,
          messages,
        },
        { signal: controller.signal }
      );

      clearTimeout(timeout);
      raw = completion.choices[0]?.message?.content ?? "";
    } catch (error: unknown) {
      clearTimeout(timeout);

      if (error instanceof Error && error.name === "AbortError") {
        throw new LLMError("That took too long. Please try again.", "timeout");
      }

      if (error instanceof OpenAI.APIError) {
        if (error.status === 429) {
          throw new LLMError(
            "The service is busy. Please try again in a moment.",
            "rate_limited"
          );
        }

        if (error.status && error.status >= 500) {
          throw new LLMError(
            "I couldn't process that. Please try again.",
            "server_error"
          );
        }
      }

      throw new LLMError(
        "I couldn't process that. Please try again.",
        "unknown"
      );
    }
  }

  if (!raw) {
    return {
      gate_type: "unclassified",
      brief: "I wasn't able to generate a useful response. Please try rephrasing.",
      raw: "",
    };
  }

  const { gate_type, brief } = parseGateAndBrief(raw);
  const qualityFlags = assessResponseQuality(gate_type, brief);

  // Fire-and-forget telemetry
  if (qualityFlags.missing_gate_tag || qualityFlags.exceeds_word_limit || qualityFlags.ends_with_question) {
    recordSafetyEvent({ event_type: "response_quality_flag", flags: qualityFlags }).catch(() => {});
  }

  return { gate_type, brief, raw };
}

export async function callLLMWithRetry(
  userMessage: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>
): Promise<LLMResponse> {
  try {
    return await callLLM(userMessage, conversationHistory);
  } catch (error) {
    if (error instanceof LLMError && error.reason === "server_error") {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return await callLLM(userMessage, conversationHistory);
    }
    throw error;
  }
}

export class LLMError extends Error {
  reason: "timeout" | "rate_limited" | "server_error" | "unknown";

  constructor(message: string, reason: LLMError["reason"]) {
    super(message);
    this.name = "LLMError";
    this.reason = reason;
  }
}
