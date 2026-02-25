import OpenAI from "openai";
import { SYSTEM_PROMPT } from "./prompt";
import type { GateType } from "@/types/session";

let openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing OPENAI_API_KEY environment variable");
    }
    openai = new OpenAI({ apiKey });
  }
  return openai;
}

const VALID_GATE_TYPES: GateType[] = [
  "meeting_triage",
  "priority_decision",
  "quick_briefing",
  "context_gate_resolution",
  "out_of_scope",
];

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

export async function callLLM(
  userMessage: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>
): Promise<LLMResponse> {
  const client = getOpenAI();

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...conversationHistory.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const completion = await client.chat.completions.create(
      {
        model: "gpt-4o-mini",
        max_tokens: 300,
        temperature: 0.3,
        messages,
      },
      { signal: controller.signal }
    );

    clearTimeout(timeout);

    const raw = completion.choices[0]?.message?.content ?? "";
    if (!raw) {
      return {
        gate_type: "unclassified",
        brief: "I wasn't able to generate a useful response. Please try rephrasing.",
        raw: "",
      };
    }

    const { gate_type, brief } = parseGateAndBrief(raw);
    return { gate_type, brief, raw };
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
