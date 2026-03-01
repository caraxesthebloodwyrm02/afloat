import { NextRequest, NextResponse } from "next/server";
import { getSession, endSession, deleteSession } from "@/lib/memory-session-store";
import type { SessionEndResponse, ApiError } from "@/types/api";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  const session = getSession(sessionId);

  if (!session) {
    return NextResponse.json<ApiError>(
      { error: "not_found", message: "Session not found." },
      { status: 404 }
    );
  }

  const result = endSession(sessionId);
  if (!result) {
    return NextResponse.json<ApiError>(
      { error: "not_found", message: "Session not found." },
      { status: 404 }
    );
  }

  deleteSession(sessionId);

  return NextResponse.json<SessionEndResponse>({
    session_id: sessionId,
    session_completed: result.session_completed,
  });
}