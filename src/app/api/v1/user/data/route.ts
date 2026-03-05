import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-middleware";
import { getDataRightsRateLimiter, checkRateLimit } from "@/lib/rate-limit";
import { markUserForDeletion, getUser } from "@/lib/data-layer";
import { auditAction } from "@/lib/audit";
import type { ApiError } from "@/types/api";

export async function DELETE(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!isAuthenticated(authResult)) return authResult;

  const { user } = authResult;

  const rateLimitResponse = await checkRateLimit(
    getDataRightsRateLimiter(),
    user.user_id
  );
  if (rateLimitResponse) return rateLimitResponse;

  const userRecord = await getUser(user.user_id);
  if (!userRecord) {
    return NextResponse.json<ApiError>(
      { error: "not_found", message: "User not found." },
      { status: 404 }
    );
  }

  if (userRecord.pending_deletion) {
    return NextResponse.json({
      message: "Deletion already requested.",
      deletion_date: userRecord.pending_deletion.deletion_date,
      grace_period_days: 7,
    });
  }

  const success = await markUserForDeletion(user.user_id);
  if (!success) {
    return NextResponse.json<ApiError>(
      { error: "server_error", message: "Failed to process deletion request." },
      { status: 500 }
    );
  }

  const updatedUser = await getUser(user.user_id);

  await auditAction(request, user, {
    action: "delete",
    resource_type: "user_profile",
    resource_id: user.user_id,
    outcome: "success",
    metadata: {
      deletion_date: updatedUser?.pending_deletion?.deletion_date,
      grace_period_days: 7,
    },
  });

  return NextResponse.json({
    message:
      "Deletion requested. Your data will be permanently deleted after a 7-day grace period. Log in before then to cancel.",
    deletion_date: updatedUser?.pending_deletion?.deletion_date,
    grace_period_days: 7,
  });
}
