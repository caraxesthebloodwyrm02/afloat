import { NextRequest, NextResponse } from "next/server";
import { createCheckoutSession, createMeteredCheckoutSession, isStripeConfigured } from "@/lib/stripe";
import { getSubscribeRateLimiter, checkRateLimit } from "@/lib/rate-limit";
import { hashIP, getClientIP } from "@/lib/audit";

export async function POST(request: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "not_available", message: "Billing is not configured." },
      { status: 501 }
    );
  }

  // Rate limit by IP to prevent unauthenticated spam
  const ip = hashIP(getClientIP(request));
  const rateLimitResponse = await checkRateLimit(
    getSubscribeRateLimiter(),
    ip
  );
  if (rateLimitResponse) return rateLimitResponse;

  let tier = "trial";
  try {
    const body = await request.json();
    if (body.tier === "continuous") tier = "continuous";
  } catch {
    // Default to trial if no body
  }

  const trialPriceId = process.env.STRIPE_PRICE_ID;
  const continuousPriceId = process.env.STRIPE_CONTINUOUS_PRICE_ID;

  const priceId = tier === "continuous" ? continuousPriceId : trialPriceId;
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
    const session = tier === "continuous"
      ? await createMeteredCheckoutSession(priceId, `${appUrl}/subscribe/success`, `${appUrl}/subscribe`)
      : await createCheckoutSession(priceId, `${appUrl}/subscribe/success`, `${appUrl}/subscribe`);

    return NextResponse.json({ url: session.url });
  } catch {
    return NextResponse.json(
      { error: "server_error", message: "Failed to create checkout session." },
      { status: 500 }
    );
  }
}
