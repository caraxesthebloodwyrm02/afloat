import { NextResponse } from "next/server";
import {
  createSession,
} from "@/lib/memory-session-store";
import type { SessionStartResponse } from "@/types/api";
import { getTierLimits } from "@/types/session";

export async function POST() {
  const userId = "test-user";
  const tier = "trial";
  const session = createSession(userId, tier);
  const limits = getTierLimits(tier);

  return NextResponse.json<SessionStartResponse>({
    session_id: session.session_id,
    tier,
    max_duration_ms: limits.maxDurationMs,
    max_turns: limits.maxLlmCalls,
  });
}