import { NextRequest, NextResponse } from "next/server";
import { createCheckoutSession } from "@/lib/stripe";
import { getSubscribeRateLimiter, checkRateLimit } from "@/lib/rate-limit";
import { hashIP, getClientIP } from "@/lib/audit";

export async function POST(request: NextRequest) {
  // Rate limit by IP to prevent unauthenticated spam
  const ip = hashIP(getClientIP(request));
  const rateLimitResponse = await checkRateLimit(
    getSubscribeRateLimiter(),
    ip
  );
  if (rateLimitResponse) return rateLimitResponse;

  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    return NextResponse.json(
      { error: "server_error", message: "Payment not configured." },
      { status: 500 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return NextResponse.json(
      { error: "server_error", message: "Application URL not configured." },
      { status: 500 }
    );
  }

  try {
    const session = await createCheckoutSession(
      priceId,
      `${appUrl}/subscribe/success`,
      `${appUrl}/subscribe`
    );

    return NextResponse.json({ url: session.url });
  } catch {
    return NextResponse.json(
      { error: "server_error", message: "Failed to create checkout session." },
      { status: 500 }
    );
  }
}
