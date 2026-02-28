"use client";

import { useState } from "react";

export default function SubscribePage() {
  const [loading, setLoading] = useState<string | null>(null);

  async function handleSubscribe(tier: "trial" | "continuous") {
    setLoading(tier);
    try {
      const res = await fetch("/api/v1/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-6">
      <div className="max-w-2xl w-full text-center space-y-8">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
          Subscribe to Afloat
        </h1>
        <p className="text-zinc-500">
          Quick decision support — choose the plan that fits.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Trial Tier */}
          <div className="bg-zinc-50 rounded-xl p-6 space-y-4 text-left">
            <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wide">
              Trial
            </h2>
            <div className="text-3xl font-semibold text-zinc-900">
              $9<span className="text-lg font-normal text-zinc-400">/quarter</span>
            </div>
            <ul className="text-sm text-zinc-500 space-y-2">
              <li>2-minute sessions</li>
              <li>4 context gate types</li>
              <li>Under 3-second response time</li>
              <li>Cancel anytime</li>
            </ul>
            <button
              onClick={() => handleSubscribe("trial")}
              disabled={loading !== null}
              className="w-full h-10 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              {loading === "trial" ? "Redirecting..." : "Get Started — $9/quarter"}
            </button>
          </div>

          {/* Continuous Tier */}
          <div className="bg-zinc-900 rounded-xl p-6 space-y-4 text-left">
            <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wide">
              Continuous
            </h2>
            <div className="text-3xl font-semibold text-white">
              $3<span className="text-lg font-normal text-zinc-400">/hour</span>
            </div>
            <ul className="text-sm text-zinc-400 space-y-2">
              <li>Up to 30-minute sessions</li>
              <li>6 turns per session</li>
              <li>Deeper analysis</li>
              <li>Metered usage — pay for what you use</li>
            </ul>
            <button
              onClick={() => handleSubscribe("continuous")}
              disabled={loading !== null}
              className="w-full h-10 bg-white text-zinc-900 text-sm font-medium rounded-lg hover:bg-zinc-100 transition-colors disabled:opacity-50"
            >
              {loading === "continuous" ? "Redirecting..." : "Subscribe — $3/hour"}
            </button>
          </div>
        </div>

        <p className="text-xs text-zinc-400">
          Payments processed securely by Stripe. We never see your card details.
        </p>
      </div>
    </div>
  );
}
