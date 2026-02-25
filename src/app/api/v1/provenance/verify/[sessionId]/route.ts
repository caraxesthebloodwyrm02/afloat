import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, isAuthenticated } from "@/lib/auth-middleware";
import { verifySessionChain } from "@/lib/provenance";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const authResult = await authenticateRequest(request);
  if (!isAuthenticated(authResult)) return authResult;

  const { sessionId } = await params;
  const result = await verifySessionChain(sessionId);

  return NextResponse.json({
    session_id: sessionId,
    ...result,
  });
}
