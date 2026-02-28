import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, isAuthenticated } from "@/lib/auth-middleware";
import { createSession } from "@/lib/session-controller";
import { getUser } from "@/lib/data-layer";
import { getSessionRateLimiter, checkRateLimit } from "@/lib/rate-limit";
import { writeAuditLog, hashIP, getClientIP } from "@/lib/audit";
import { getTierLimits } from "@/types/session";
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

  // Inform user if their account is pending deletion
  if (userRecord.pending_deletion) {
    return NextResponse.json<ApiError>(
      {
        error: "forbidden",
        message: `Your account is scheduled for deletion on ${userRecord.pending_deletion.deletion_date}. Visit settings to cancel deletion and continue using Afloat.`,
      },
      { status: 403 }
    );
  }

  const tier = userRecord.subscription_tier ?? "trial";
  const session = await createSession(user.user_id, tier);

  await writeAuditLog({
    actor: user.user_id,
    action: "create",
    resource_type: "session_log",
    resource_id: session.session_id,
    outcome: "success",
    ip_hash: hashIP(getClientIP(request)),
    metadata: { tier },
  });

  const limits = getTierLimits(tier);

  return NextResponse.json<SessionStartResponse>({
    session_id: session.session_id,
    tier,
    max_duration_ms: limits.maxDurationMs,
    max_turns: limits.maxLlmCalls,
  });
}
