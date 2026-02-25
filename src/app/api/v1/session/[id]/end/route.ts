import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, isAuthenticated } from "@/lib/auth-middleware";
import { getSession, deleteSession } from "@/lib/session-controller";
import { writeSessionLog } from "@/lib/data-layer";
import { getUser } from "@/lib/data-layer";
import { shouldWriteTelemetry } from "@/lib/consent";
import { getSessionEndRateLimiter, checkRateLimit } from "@/lib/rate-limit";
import { writeAuditLog, hashIP, getClientIP } from "@/lib/audit";
import type { SessionEndResponse, ApiError } from "@/types/api";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(request);
  if (!isAuthenticated(authResult)) return authResult;

  const { user } = authResult;

  const rateLimitResponse = await checkRateLimit(
    getSessionEndRateLimiter(),
    user.user_id
  );
  if (rateLimitResponse) return rateLimitResponse;

  const { id: sessionId } = await params;
  const session = await getSession(sessionId);

  if (!session) {
    return NextResponse.json<ApiError>(
      { error: "not_found", message: "Session not found." },
      { status: 404 }
    );
  }

  if (session.user_id !== user.user_id) {
    return NextResponse.json<ApiError>(
      { error: "forbidden", message: "Access denied." },
      { status: 403 }
    );
  }

  const endTime = new Date().toISOString();
  const sessionCompleted = !session.error;
  const userProceeded = session.llm_call_count > 0 && !session.error;

  const userRecord = await getUser(user.user_id);
  const writeTelemetry = userRecord
    ? shouldWriteTelemetry(userRecord.consents)
    : true;

  if (writeTelemetry) {
    await writeSessionLog({
      session_id: session.session_id,
      user_id: session.user_id,
      start_time: session.start_time,
      end_time: endTime,
      turns: session.llm_call_count,
      gate_type: session.gate_type,
      user_proceeded: userProceeded,
      session_completed: sessionCompleted,
      latency_per_turn: session.latency_per_turn,
      error: session.error,
    });
  }

  await writeAuditLog({
    actor: user.user_id,
    action: "update",
    resource_type: "session_log",
    resource_id: session.session_id,
    outcome: "success",
    ip_hash: hashIP(getClientIP(request)),
    metadata: { action_detail: "session_end", telemetry_written: writeTelemetry },
  });

  await deleteSession(sessionId);

  return NextResponse.json<SessionEndResponse>({
    session_id: session.session_id,
    session_completed: sessionCompleted,
  });
}
