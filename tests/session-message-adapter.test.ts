import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCallLLMWithRetry = vi.fn();

vi.mock("@/lib/llm", () => ({
  callLLMWithRetry: (...args: unknown[]) => mockCallLLMWithRetry(...args),
}));

import {
  generateMessageResponse,
  isPhase4MessageCapabilityEnabled,
} from "@/lib/session-message-adapter";

describe("session-message-adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.PHASE4_MESSAGE_CAPABILITY_ENABLED;
  });

  it("is disabled by default", () => {
    expect(isPhase4MessageCapabilityEnabled()).toBe(false);
  });

  it("delegates directly when phase-4 flag is disabled", async () => {
    mockCallLLMWithRetry.mockResolvedValue({
      gate_type: "context_gate_resolution",
      brief: "direct",
      raw: "raw-direct",
    });

    const result = await generateMessageResponse("hello", []);

    expect(result.brief).toBe("direct");
    expect(result.raw).toBe("raw-direct");
    expect(mockCallLLMWithRetry).toHaveBeenCalledTimes(1);
  });

  it("uses phase-4 capability branch when enabled", async () => {
    process.env.PHASE4_MESSAGE_CAPABILITY_ENABLED = "true";
    mockCallLLMWithRetry.mockResolvedValue({
      gate_type: "context_gate_resolution",
      brief: "enabled",
      raw: "raw-enabled",
    });

    const result = await generateMessageResponse("hello", []);

    expect(result.brief).toBe("enabled");
    expect(result.raw).toBe("[phase4] raw-enabled");
    expect(mockCallLLMWithRetry).toHaveBeenCalledTimes(1);
  });

  it("falls back safely if capability branch fails", async () => {
    process.env.PHASE4_MESSAGE_CAPABILITY_ENABLED = "1";
    mockCallLLMWithRetry
      .mockRejectedValueOnce(new Error("phase4-branch-failure"))
      .mockResolvedValueOnce({
        gate_type: "context_gate_resolution",
        brief: "fallback",
        raw: "raw-fallback",
      });

    const result = await generateMessageResponse("hello", []);

    expect(result.brief).toBe("fallback");
    expect(result.raw).toBe("raw-fallback");
    expect(mockCallLLMWithRetry).toHaveBeenCalledTimes(2);
  });
});
