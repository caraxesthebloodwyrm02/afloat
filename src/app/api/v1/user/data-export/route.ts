import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, isAuthenticated } from "@/lib/auth-middleware";
import { getDataRightsRateLimiter, checkRateLimit } from "@/lib/rate-limit";
import { exportUserData } from "@/lib/data-layer";
import { writeAuditLog, hashIP, getClientIP } from "@/lib/audit";
import type { ApiError } from "@/types/api";

export async function GET(request: NextRequest) {
  const authResult = await authenticateRequest(request);
  if (!isAuthenticated(authResult)) return authResult;

  const { user } = authResult;

  const rateLimitResponse = await checkRateLimit(
    getDataRightsRateLimiter(),
    user.user_id
  );
  if (rateLimitResponse) return rateLimitResponse;

  const data = await exportUserData(user.user_id);
  if (!data) {
    return NextResponse.json<ApiError>(
      { error: "not_found", message: "User not found." },
      { status: 404 }
    );
  }

  await writeAuditLog({
    actor: user.user_id,
    action: "export",
    resource_type: "user_profile",
    resource_id: user.user_id,
    outcome: "success",
    ip_hash: hashIP(getClientIP(request)),
    metadata: {
      format: request.nextUrl.searchParams.get("format") || "json",
    },
  });

  const format = request.nextUrl.searchParams.get("format");
  if (format === "portable") {
    return NextResponse.json(data, {
      headers: {
        "Content-Disposition": `attachment; filename="afloat-data-export-${user.user_id}.json"`,
      },
    });
  }

  return NextResponse.json(data);
}
