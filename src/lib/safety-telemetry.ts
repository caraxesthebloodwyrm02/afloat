import { getRedis } from "./redis";

export interface SafetyEvent {
  event_type: "pipeline_result" | "pre_check_block" | "pii_detection" | "response_quality_flag" | "safety_gradient_block";
  timestamp?: string;
  [key: string]: unknown;
}

export async function recordSafetyEvent(event: SafetyEvent): Promise<void> {
  try {
    const redis = getRedis();
    const dateKey = new Date().toISOString().split("T")[0];
    const fullEvent = { ...event, timestamp: event.timestamp ?? new Date().toISOString() };
    await redis.rpush(`safety_events:${dateKey}`, JSON.stringify(fullEvent));
  } catch {
    // Telemetry is non-critical. Silent failure.
    // Mirrors GRID principle: observability must never break the request path.
  }
}

export async function getSafetyEvents(dateKey: string): Promise<SafetyEvent[]> {
  const redis = getRedis();
  const entries = await redis.lrange(`safety_events:${dateKey}`, 0, -1);
  return entries.map((e) => (typeof e === "string" ? JSON.parse(e) : e) as SafetyEvent);
}
