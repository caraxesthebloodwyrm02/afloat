import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, isAuthenticated } from "@/lib/auth-middleware";
import { verifySessionChain } from "@/lib/provenance";
import { getSession } from "@/lib/session-controller";
import type { ApiError } from "@/types/api";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const authResult = await authenticateRequest(request);
  if (!isAuthenticated(authResult)) return authResult;

  const { user } = authResult;
  const { sessionId } = await params;

  // Ownership check
  const session = await getSession(sessionId);
  if (session && session.user_id !== user.user_id) {
    return NextResponse.json<ApiError>(
      { error: "forbidden", message: "Access denied." },
      { status: 403 }
    );
  }

  const result = await verifySessionChain(sessionId);

  return NextResponse.json({
    session_id: sessionId,
    ...result,
  });
}
