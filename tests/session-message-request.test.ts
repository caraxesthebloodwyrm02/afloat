import { createDefaultConsents } from "@/lib/consent";
import {
  buildLLMRoutingContext,
  MAX_SESSION_MESSAGE_HISTORY_CONTENT_LENGTH,
  normalizeOpenAIOverridePolicy,
  normalizeSessionMessageHistory,
  normalizeSessionMessageRequestBody,
} from "@/lib/session-message-request";
import { describe, expect, it } from "vitest";

describe("session-message-request", () => {
  it("normalizes override policy to auto unless explicitly forced or disabled", () => {
    expect(normalizeOpenAIOverridePolicy("force")).toBe("force");
    expect(normalizeOpenAIOverridePolicy("never")).toBe("never");
    expect(normalizeOpenAIOverridePolicy("sometimes")).toBe("auto");
    expect(normalizeOpenAIOverridePolicy(undefined)).toBe("auto");
  });

  it("filters and bounds client history entries", () => {
    const normalized = normalizeSessionMessageHistory([
      { role: "system", content: "drop me" },
      { role: "assistant", content: "keep me" },
      { role: "user", content: "x".repeat(MAX_SESSION_MESSAGE_HISTORY_CONTENT_LENGTH + 25) },
      { role: "assistant", content: "third" },
      { role: "user", content: "fourth" },
      { role: "assistant", content: "fifth" },
    ]);

    expect(normalized).toHaveLength(4);
    expect(normalized.map((entry) => entry.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    expect(normalized[0]?.content.length).toBe(
      MAX_SESSION_MESSAGE_HISTORY_CONTENT_LENGTH,
    );
  });

  it("normalizes the full request body with safe defaults", () => {
    expect(normalizeSessionMessageRequestBody(null)).toEqual({
      message: "",
      history: [],
      deep_read: false,
      openai_override: "auto",
    });

    expect(
      normalizeSessionMessageRequestBody({
        message: "analyze this",
        history: [{ role: "user", content: "context" }],
        deep_read: true,
        openai_override: "force",
      }),
    ).toEqual({
      message: "analyze this",
      history: [{ role: "user", content: "context" }],
      deep_read: true,
      openai_override: "force",
    });
  });

  it("derives routing context from server-side consent state", () => {
    const routingEnabled = buildLLMRoutingContext(
      "user-1",
      { consents: createDefaultConsents(true, true, false, true) },
      { deep_read: true, openai_override: "never" },
    );
    expect(routingEnabled).toEqual({
      user_id: "user-1",
      allow_routing_memory: true,
      deep_read_override: true,
      openai_override: "never",
    });

    const routingDisabled = buildLLMRoutingContext(
      "user-2",
      { consents: createDefaultConsents(true, true, false, false) },
      { deep_read: false, openai_override: "auto" },
    );
    expect(routingDisabled.allow_routing_memory).toBe(false);
  });
});
