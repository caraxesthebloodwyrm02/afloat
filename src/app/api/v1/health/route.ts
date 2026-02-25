import { NextResponse } from "next/server";
import type { HealthResponse } from "@/types/api";

export async function GET() {
  const response: HealthResponse = {
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "0.1.0",
  };
  return NextResponse.json(response);
}
