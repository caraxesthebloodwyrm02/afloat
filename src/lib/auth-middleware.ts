import { NextRequest, NextResponse } from "next/server";
import { verifyToken, type JWTPayload } from "./auth";
import type { ApiError } from "@/types/api";

export async function authenticateRequest(
  request: NextRequest
): Promise<{ user: JWTPayload } | NextResponse<ApiError>> {
  const authHeader = request.headers.get("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "unauthorized" as const, message: "Authentication required." },
      { status: 401 }
    );
  }

  const token = authHeader.slice(7);
  const payload = await verifyToken(token);

  if (!payload) {
    return NextResponse.json(
      { error: "unauthorized" as const, message: "Invalid or expired token." },
      { status: 401 }
    );
  }

  return { user: payload };
}

export function isAuthenticated(
  result: { user: JWTPayload } | NextResponse<ApiError>
): result is { user: JWTPayload } {
  return "user" in result;
}
