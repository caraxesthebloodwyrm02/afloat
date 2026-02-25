import { NextRequest, NextResponse } from "next/server";
import { retrieveCheckoutSession } from "@/lib/stripe";
import { getUserByStripeCustomerId } from "@/lib/data-layer";
import { createToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  let body: { session_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "empty_input", message: "Invalid request." },
      { status: 400 }
    );
  }

  const { session_id } = body;
  if (!session_id) {
    return NextResponse.json(
      { error: "empty_input", message: "Missing session_id." },
      { status: 400 }
    );
  }

  try {
    const checkoutSession = await retrieveCheckoutSession(session_id);
    const stripeCustomerId = checkoutSession.customer as string;

    if (!stripeCustomerId) {
      return NextResponse.json(
        { error: "server_error", message: "Could not identify customer." },
        { status: 500 }
      );
    }

    const user = await getUserByStripeCustomerId(stripeCustomerId);
    if (!user) {
      return NextResponse.json(
        { error: "not_found", message: "User account not yet created. Please wait a moment and retry." },
        { status: 404 }
      );
    }

    const token = await createToken({
      user_id: user.user_id,
      sub: user.stripe_customer_id,
    });

    return NextResponse.json({ token, user_id: user.user_id });
  } catch {
    return NextResponse.json(
      { error: "server_error", message: "Verification failed." },
      { status: 500 }
    );
  }
}
