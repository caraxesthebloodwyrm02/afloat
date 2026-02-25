import { NextResponse } from "next/server";
import { createCheckoutSession } from "@/lib/stripe";

export async function POST() {
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    return NextResponse.json(
      { error: "server_error", message: "Payment not configured." },
      { status: 500 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

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
