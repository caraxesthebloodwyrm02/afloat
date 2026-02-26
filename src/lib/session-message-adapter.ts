import { callLLMWithRetry, type LLMResponse } from "@/lib/llm";

const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

export function isPhase4MessageCapabilityEnabled(): boolean {
  const rawValue = (process.env.PHASE4_MESSAGE_CAPABILITY_ENABLED ?? "").trim().toLowerCase();
  return ENABLED_VALUES.has(rawValue);
}

async function callPhase4Capability(
  userMessage: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>
): Promise<LLMResponse> {
  const response = await callLLMWithRetry(userMessage, conversationHistory);
  return {
    ...response,
    raw: response.raw ? `[phase4] ${response.raw}` : response.raw,
  };
}

export async function generateMessageResponse(
  userMessage: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>
): Promise<LLMResponse> {
  if (!isPhase4MessageCapabilityEnabled()) {
    return callLLMWithRetry(userMessage, conversationHistory);
  }

  try {
    return await callPhase4Capability(userMessage, conversationHistory);
  } catch {
    return callLLMWithRetry(userMessage, conversationHistory);
  }
}
