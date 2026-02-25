import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, isAuthenticated } from "@/lib/auth-middleware";
import { createSession } from "@/lib/session-controller";
import { getUser } from "@/lib/data-layer";
import { getSessionRateLimiter, checkRateLimit } from "@/lib/rate-limit";
import { writeAuditLog, hashIP, getClientIP } from "@/lib/audit";
import type { SessionStartResponse, ApiError } from "@/types/api";

export async function POST(request: NextRequest) {
  const authResult = await authenticateRequest(request);
  if (!isAuthenticated(authResult)) return authResult;

  const { user } = authResult;

  const rateLimitResponse = await checkRateLimit(
    getSessionRateLimiter(),
    user.user_id
  );
  if (rateLimitResponse) return rateLimitResponse;

  const userRecord = await getUser(user.user_id);
  if (!userRecord || userRecord.subscription_status !== "active") {
    return NextResponse.json<ApiError>(
      { error: "forbidden", message: "Active subscription required." },
      { status: 403 }
    );
  }

  const session = await createSession(user.user_id);

  await writeAuditLog({
    actor: user.user_id,
    action: "create",
    resource_type: "session_log",
    resource_id: session.session_id,
    outcome: "success",
    ip_hash: hashIP(getClientIP(request)),
    metadata: {},
  });

  return NextResponse.json<SessionStartResponse>({
    session_id: session.session_id,
  });
}
