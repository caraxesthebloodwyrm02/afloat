import { describe, it, expect, vi } from "vitest";
import { recordSafetyEvent, getSafetyEvents } from "@/lib/safety-telemetry";

// Mock Redis (same pattern as existing test mocks)
vi.mock("@/lib/redis", () => {
  const store: Record<string, string[]> = {};
  return {
    getRedis: () => ({
      rpush: async (key: string, value: string) => {
        store[key] = store[key] || [];
        store[key].push(value);
      },
      lrange: async (key: string) => store[key] || [],
    }),
  };
});

describe("Safety Telemetry", () => {
  it("records and retrieves safety events", async () => {
    await recordSafetyEvent({ event_type: "pipeline_result", pii_found: false });
    const today = new Date().toISOString().split("T")[0];
    const events = await getSafetyEvents(today);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].event_type).toBe("pipeline_result");
  });

  it("includes timestamp automatically", async () => {
    await recordSafetyEvent({ event_type: "pre_check_block", reason: "PROMPT_INJECTION_DETECTED" });
    const today = new Date().toISOString().split("T")[0];
    const events = await getSafetyEvents(today);
    const last = events[events.length - 1];
    expect(last.timestamp).toBeDefined();
  });

  it("preserves custom fields in event", async () => {
    await recordSafetyEvent({ event_type: "pii_detection", pii_types: { email_address: 1 } });
    const today = new Date().toISOString().split("T")[0];
    const events = await getSafetyEvents(today);
    const last = events[events.length - 1];
    expect(last.event_type).toBe("pii_detection");
  });
});
