import { authenticateRequest, isAuthenticated } from "@/lib/auth-middleware";
import { getSessionDPRs, verifySessionChain } from "@/lib/provenance";
import { getSession } from "@/lib/session-controller";
import type { ApiError } from "@/types/api";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const authResult = await authenticateRequest(request);
  if (!isAuthenticated(authResult)) return authResult;

  const { user } = authResult;
  const { sessionId } = await params;

  // Ownership check: verify the session belongs to the requesting user.
  // If session is deleted, fall back to DPR chain actor_id for authorization.
  const session = await getSession(sessionId);
  if (session && session.user_id !== user.user_id) {
    return NextResponse.json<ApiError>(
      { error: "forbidden", message: "Access denied." },
      { status: 403 },
    );
  }

  const chain = await getSessionDPRs(sessionId);
  if (chain.length === 0) {
    return NextResponse.json<ApiError>(
      {
        error: "not_found",
        message: "No provenance records found for this session.",
      },
      { status: 404 },
    );
  }

  // Post-deletion ownership: check actor_id in chain records
  if (!session) {
    const chainOwnerId = chain[0].actor_id;
    if (chainOwnerId !== user.user_id) {
      return NextResponse.json<ApiError>(
        { error: "forbidden", message: "Access denied." },
        { status: 403 },
      );
    }
  }

  const integrity = await verifySessionChain(sessionId);

  return NextResponse.json({
    session_id: sessionId,
    chain_length: chain.length,
    chain_integrity: integrity,
    records: chain,
  });
}
