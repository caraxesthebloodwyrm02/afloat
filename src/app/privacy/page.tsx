import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Afloat",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-12 space-y-8">
      <h1 className="text-2xl font-semibold text-zinc-900">Privacy Policy</h1>
      <p className="text-xs text-zinc-400">Version: v1.0 &middot; Effective: March 1, 2026</p>

      <section className="space-y-3">
        <h2 className="text-base font-medium text-zinc-800">What Afloat Does</h2>
        <p className="text-sm text-zinc-600 leading-relaxed">
          Afloat is a short-session cognitive assistant. You describe what you&apos;re stuck on, and
          it provides a brief to help you get past the block. Sessions last under 2 minutes.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-medium text-zinc-800">Data We Collect</h2>
        <ul className="text-sm text-zinc-600 space-y-2 leading-relaxed">
          <li>
            <strong>Session input (your text):</strong> Processed in memory on our servers to generate a
            response. Never written to our database. Discarded from our systems after the response
            is delivered. However, your text is sent to OpenAI for processing, and OpenAI may
            retain it in abuse monitoring logs for up to 30 days by default.
          </li>
          <li>
            <strong>Session telemetry:</strong> If you consent, we record session duration, response
            latency, gate type detected, and whether you proceeded. No message content is stored.
          </li>
          <li>
            <strong>Account data:</strong> A pseudonymous user ID, your Stripe customer reference
            (no card details), subscription status, and your consent preferences.
          </li>
          <li>
            <strong>Audit logs:</strong> Records of data operations (exports, deletions, consent
            changes) with hashed IP addresses. Raw IPs are never stored.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-medium text-zinc-800">Consent Categories</h2>
        <ul className="text-sm text-zinc-600 space-y-2 leading-relaxed">
          <li>
            <strong>Essential processing (required):</strong> Necessary for the service to function.
            Covers session delivery and account management.
          </li>
          <li>
            <strong>Session telemetry (optional):</strong> Performance metrics that help us improve
            response quality. No personal text is included. You can opt out anytime in Settings.
          </li>
          <li>
            <strong>Marketing communications (optional):</strong> Occasional feature updates. No
            spam. You can opt out anytime in Settings.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-medium text-zinc-800">Your Data Rights</h2>
        <ul className="text-sm text-zinc-600 space-y-2 leading-relaxed">
          <li>
            <strong>Access:</strong> Export all your data in JSON format via Settings or the API.
          </li>
          <li>
            <strong>Deletion:</strong> Request permanent deletion of all your data. There is a 7-day
            grace period during which you can cancel the request.
          </li>
          <li>
            <strong>Portability:</strong> Download your data in a portable JSON + CSV format.
          </li>
          <li>
            <strong>Rectification:</strong> Correct your display name or email preference via
            Settings or the API.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-medium text-zinc-800">Data Retention</h2>
        <ul className="text-sm text-zinc-600 space-y-2 leading-relaxed">
          <li><strong>User text input:</strong> 0 days on our servers. OpenAI retains prompts/responses for up to 30 days in abuse monitoring logs by default.</li>
          <li><strong>Session telemetry:</strong> 90 days, then aggregated and anonymized</li>
          <li><strong>Consent records:</strong> Account lifetime + 365 days</li>
          <li><strong>Subscription reference:</strong> Account lifetime + 30 days</li>
          <li><strong>Audit logs:</strong> 365 days active, then 2 years cold storage</li>
          <li><strong>Anonymized aggregates:</strong> Indefinite (no re-identification possible)</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-medium text-zinc-800">Third-Party Processors</h2>
        <ul className="text-sm text-zinc-600 space-y-2 leading-relaxed">
          <li>
            <strong>OpenAI:</strong> Processes your session text to generate briefs. Not used
            for model training (since March 2023). However, OpenAI retains prompts and responses
            in abuse monitoring logs for up to 30 days by default. Zero Data Retention requires
            separate approval.{" "}
            <a href="https://openai.com/policies/privacy-policy" className="underline hover:text-zinc-900">
              OpenAI Privacy Policy
            </a>
          </li>
          <li>
            <strong>Stripe:</strong> Handles payment processing. We never see or store your card
            details. Stripe is PCI-DSS compliant.{" "}
            <a href="https://stripe.com/privacy" className="underline hover:text-zinc-900">
              Stripe Privacy Policy
            </a>
          </li>
          <li>
            <strong>Vercel:</strong> Hosts the application. Server logs (IP addresses, request
            metadata) are managed by Vercel.{" "}
            <a href="https://vercel.com/legal/privacy-policy" className="underline hover:text-zinc-900">
              Vercel Privacy Policy
            </a>
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-medium text-zinc-800">Applicable Frameworks</h2>
        <p className="text-sm text-zinc-600 leading-relaxed">
          This policy is designed with GDPR, CCPA, and DPDPA principles in mind.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-medium text-zinc-800">Contact</h2>
        <p className="text-sm text-zinc-600 leading-relaxed">
          For privacy inquiries, contact us at:{" "}
          <a href="mailto:irfankabir02@gmail.com" className="font-mono underline hover:text-zinc-900">irfankabir02@gmail.com</a>
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-medium text-zinc-800">Changes to This Policy</h2>
        <p className="text-sm text-zinc-600 leading-relaxed">
          Material changes will be communicated via email and an in-app banner at least 14 days
          before they take effect. If changes are material, you will be asked to re-consent.
        </p>
      </section>
    </div>
  );
}
