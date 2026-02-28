import { NextResponse } from "next/server";
import type { HealthResponse } from "@/types/api";
import { version } from "../../../../../package.json";

export async function GET() {
  const response: HealthResponse = {
    status: "ok",
    timestamp: new Date().toISOString(),
    version,
  };
  return NextResponse.json(response);
}
