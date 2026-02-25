"use client";

import { useState } from "react";

export default function SubscribePage() {
  const [loading, setLoading] = useState(false);

  async function handleSubscribe() {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/subscribe", {
        method: "POST",
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-6">
      <div className="max-w-md w-full text-center space-y-8">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
          Subscribe to Afloat
        </h1>
        <p className="text-zinc-500">
          Quick decision support — under 2 minutes per session.
        </p>

        <div className="bg-zinc-50 rounded-xl p-6 space-y-4">
          <div className="text-3xl font-semibold text-zinc-900">
            $3<span className="text-lg font-normal text-zinc-400">/month</span>
          </div>
          <ul className="text-sm text-zinc-500 space-y-2 text-left">
            <li>Unlimited sessions</li>
            <li>4 context gate types supported</li>
            <li>Under 3-second response time</li>
            <li>Cancel anytime</li>
          </ul>
        </div>

        <button
          onClick={handleSubscribe}
          disabled={loading}
          className="w-full h-12 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50"
        >
          {loading ? "Redirecting to checkout..." : "Subscribe — $3/month"}
        </button>

        <p className="text-xs text-zinc-400">
          Payments processed securely by Stripe. We never see your card details.
        </p>
      </div>
    </div>
  );
}
