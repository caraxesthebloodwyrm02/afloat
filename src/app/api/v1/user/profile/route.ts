import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, isAuthenticated } from "@/lib/auth-middleware";
import { getDataRightsRateLimiter, checkRateLimit } from "@/lib/rate-limit";
import { getUser, updateUser } from "@/lib/data-layer";
import { writeAuditLog, hashIP, getClientIP } from "@/lib/audit";
import type { ApiError } from "@/types/api";

const ALLOWED_FIELDS = ["display_name", "email_preference"];

export async function PATCH(request: NextRequest) {
  const authResult = await authenticateRequest(request);
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

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ApiError>(
      { error: "empty_input", message: "Invalid request body." },
      { status: 400 }
    );
  }

  const updates: Record<string, string> = {};
  for (const field of ALLOWED_FIELDS) {
    if (field in body && typeof body[field] === "string") {
      updates[field] = body[field] as string;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json<ApiError>(
      {
        error: "empty_input",
        message: `No valid fields to update. Allowed: ${ALLOWED_FIELDS.join(", ")}`,
      },
      { status: 400 }
    );
  }

  if (updates.display_name) userRecord.display_name = updates.display_name;
  if (updates.email_preference) userRecord.email_preference = updates.email_preference;

  await updateUser(userRecord);

  await writeAuditLog({
    actor: user.user_id,
    action: "update",
    resource_type: "user_profile",
    resource_id: user.user_id,
    outcome: "success",
    ip_hash: hashIP(getClientIP(request)),
    metadata: { fields_updated: Object.keys(updates) },
  });

  return NextResponse.json({
    message: "Profile updated.",
    updated_fields: Object.keys(updates),
  });
}
