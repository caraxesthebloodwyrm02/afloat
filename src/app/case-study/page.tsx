import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Case Study — Safety-Hardened API Engineering | Afloat',
  description:
    'How Afloat implements a 7-stage safety pipeline, HMAC-signed audit trails, and fail-closed multi-model routing in a production AI assistant.',
};

function Section({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">
          {label}
        </p>
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function PipelineStep({
  number,
  name,
  description,
}: {
  number: string;
  name: string;
  description: string;
}) {
  return (
    <div className="flex gap-4 items-start">
      <span className="text-xs font-mono text-zinc-300 dark:text-zinc-600 mt-1 shrink-0 w-5 text-right">
        {number}
      </span>
      <div>
        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          {name}
        </p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {description}
        </p>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
        {value}
      </p>
      <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">{label}</p>
    </div>
  );
}

export default function CaseStudyPage() {
  return (
    <div className="flex flex-col items-center px-6 py-16">
      <div className="max-w-2xl w-full space-y-16">
        {/* Hero */}
        <div className="space-y-4">
          <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">
            Case Study
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 leading-tight">
            Safety-Hardened API Engineering
            <br />
            <span className="text-zinc-400 dark:text-zinc-500">
              in a Production AI Assistant
            </span>
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 leading-relaxed">
            Afloat is a short-session cognitive assistant deployed to production
            on Vercel. It handles real users, real payments, and real model
            inference. This case study walks through the security and safety
            engineering decisions that make it work under adversarial conditions.
          </p>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-4 gap-4 bg-zinc-50 dark:bg-zinc-900 rounded-xl p-6 border border-zinc-200 dark:border-zinc-800">
          <Stat value="7" label="Safety stages" />
          <Stat value="396" label="Passing tests" />
          <Stat value="25" label="Library modules" />
          <Stat value="14" label="API endpoints" />
        </div>

        {/* Safety Pipeline */}
        <Section label="01 / Core Architecture" title="7-Stage Safety Pipeline">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Every request passes through a sequential pipeline before reaching
            the language model. Each stage can independently reject the request.
            The pipeline is fail-closed: if any stage throws an exception, the
            request is denied, not passed through.
          </p>
          <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl p-6 space-y-4 border border-zinc-200 dark:border-zinc-800">
            <PipelineStep
              number="1"
              name="Authentication"
              description="JWT verification via jose. Tokens are httpOnly cookies with server-side refresh. Expired tokens fail closed."
            />
            <PipelineStep
              number="2"
              name="Rate Limiting"
              description="Upstash Redis sliding window. Per-user and global limits. Exceeding the limit returns 429, never silently queues."
            />
            <PipelineStep
              number="3"
              name="Session Lock"
              description="Enforces turn count and timer constraints. Trial: 2 turns / 120s. Continuous: 6 turns / 30min. No extensions."
            />
            <PipelineStep
              number="4"
              name="Pre-Check"
              description="Structural validation of the request payload. Malformed input rejected before any processing cost is incurred."
            />
            <PipelineStep
              number="5"
              name="PII Detection"
              description="Pattern-based scanning for personal identifiable information. Detected PII is never forwarded to the model or logged."
            />
            <PipelineStep
              number="6"
              name="Content Filtering"
              description="Classification of harmful content. Distress signals route to care pathways. Malicious content is blocked and audited."
            />
            <PipelineStep
              number="7"
              name="LLM Routing"
              description="Multi-model dispatch with Ollama-first preference and OpenAI lifeguard fallback. Errors classified and normalized."
            />
          </div>
        </Section>

        {/* Provenance */}
        <Section label="02 / Audit Trail" title="HMAC-Signed Provenance Chains">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Every decision the system makes — routing choices, safety
            classifications, session state transitions — is recorded in a
            provenance chain. Each record is linked to its parent via a unique
            ID and signed with HMAC-SHA256, making the chain tamper-evident.
          </p>
          <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl p-6 border border-zinc-200 dark:border-zinc-800">
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">
                  Chain integrity
                </span>
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  HMAC-SHA256 per record
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">
                  Record linkage
                </span>
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  Parent DPR ID reference
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">
                  Verification
                </span>
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  Per-session provenance endpoint
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">
                  Signing key isolation
                </span>
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  Separate from JWT secret
                </span>
              </div>
            </div>
          </div>
        </Section>

        {/* Secret Governance */}
        <Section label="03 / Secrets" title="Two-Step Secret Governance">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Secrets are not just environment variables — they pass through a
            governance layer that validates presence, complexity, and
            cross-contamination at startup, then scrubs them from memory on
            shutdown.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl p-5 border border-zinc-200 dark:border-zinc-800 space-y-2">
              <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">
                Step 1 — Entry
              </p>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                At startup, instrumentation validates all 14 required secrets
                exist, meet minimum complexity, and cross-checks that
                JWT_SECRET and PROVENANCE_SIGNING_KEY are not identical.
              </p>
            </div>
            <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl p-5 border border-zinc-200 dark:border-zinc-800 space-y-2">
              <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">
                Step 2 — Cleanup
              </p>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                On SIGTERM, SIGINT, or uncaught exceptions, the scrub function
                zeroes sensitive values from the process environment before the
                runtime exits.
              </p>
            </div>
          </div>
        </Section>

        {/* Multi-Model Routing */}
        <Section
          label="04 / Model Routing"
          title="Fail-Closed Multi-Model Dispatch"
        >
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            The routing layer discovers available models at runtime, ranks them
            by task fit, and dispatches with structured error classification.
            Local inference is preferred. Cloud escalation is a fallback, not
            a default.
          </p>
          <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl p-6 border border-zinc-200 dark:border-zinc-800 space-y-4">
            <div className="space-y-3 text-sm">
              <div className="flex gap-3 items-start">
                <span className="text-zinc-300 dark:text-zinc-600 mt-0.5 shrink-0">
                  1
                </span>
                <span className="text-zinc-600 dark:text-zinc-300">
                  <strong className="text-zinc-800 dark:text-zinc-200">
                    Catalog discovery
                  </strong>{' '}
                  — Ollama endpoint queried for available models via /api/tags
                </span>
              </div>
              <div className="flex gap-3 items-start">
                <span className="text-zinc-300 dark:text-zinc-600 mt-0.5 shrink-0">
                  2
                </span>
                <span className="text-zinc-600 dark:text-zinc-300">
                  <strong className="text-zinc-800 dark:text-zinc-200">
                    Candidate ranking
                  </strong>{' '}
                  — Models scored by scope, task type, and consented routing
                  memory
                </span>
              </div>
              <div className="flex gap-3 items-start">
                <span className="text-zinc-300 dark:text-zinc-600 mt-0.5 shrink-0">
                  3
                </span>
                <span className="text-zinc-600 dark:text-zinc-300">
                  <strong className="text-zinc-800 dark:text-zinc-200">
                    Error classification
                  </strong>{' '}
                  — Failures normalized into typed errors: timeout, rate_limited,
                  server_error, unknown
                </span>
              </div>
              <div className="flex gap-3 items-start">
                <span className="text-zinc-300 dark:text-zinc-600 mt-0.5 shrink-0">
                  4
                </span>
                <span className="text-zinc-600 dark:text-zinc-300">
                  <strong className="text-zinc-800 dark:text-zinc-200">
                    Lifeguard escalation
                  </strong>{' '}
                  — OpenAI used only for deep-read, high-complexity failures
                  where local models cannot satisfy the request
                </span>
              </div>
            </div>
          </div>
        </Section>

        {/* Stack */}
        <Section label="05 / Stack" title="Production Signals">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-3">
              <div>
                <p className="text-zinc-400 dark:text-zinc-500 text-xs uppercase tracking-wide">
                  Framework
                </p>
                <p className="text-zinc-800 dark:text-zinc-200">
                  Next.js 16, React 19, TypeScript strict
                </p>
              </div>
              <div>
                <p className="text-zinc-400 dark:text-zinc-500 text-xs uppercase tracking-wide">
                  Auth
                </p>
                <p className="text-zinc-800 dark:text-zinc-200">
                  JWT via jose, httpOnly cookies
                </p>
              </div>
              <div>
                <p className="text-zinc-400 dark:text-zinc-500 text-xs uppercase tracking-wide">
                  Payments
                </p>
                <p className="text-zinc-800 dark:text-zinc-200">
                  Stripe server-side, webhook verification
                </p>
              </div>
              <div>
                <p className="text-zinc-400 dark:text-zinc-500 text-xs uppercase tracking-wide">
                  Session Store
                </p>
                <p className="text-zinc-800 dark:text-zinc-200">
                  Upstash Redis, ephemeral
                </p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-zinc-400 dark:text-zinc-500 text-xs uppercase tracking-wide">
                  Testing
                </p>
                <p className="text-zinc-800 dark:text-zinc-200">
                  396 tests, 72% coverage, CI gates
                </p>
              </div>
              <div>
                <p className="text-zinc-400 dark:text-zinc-500 text-xs uppercase tracking-wide">
                  Deployment
                </p>
                <p className="text-zinc-800 dark:text-zinc-200">
                  Vercel production + preview branches
                </p>
              </div>
              <div>
                <p className="text-zinc-400 dark:text-zinc-500 text-xs uppercase tracking-wide">
                  CI/CD
                </p>
                <p className="text-zinc-800 dark:text-zinc-200">
                  Lint, typecheck, test, build on every push
                </p>
              </div>
              <div>
                <p className="text-zinc-400 dark:text-zinc-500 text-xs uppercase tracking-wide">
                  Dependency Management
                </p>
                <p className="text-zinc-800 dark:text-zinc-200">
                  Automated Dependabot + auto-merge pipeline
                </p>
              </div>
            </div>
          </div>
        </Section>

        {/* CTA */}
        <div className="border-t border-zinc-200 dark:border-zinc-800 pt-10 space-y-4 text-center">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            Need this level of engineering?
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
            I build safety-hardened API backends for AI products, fintech, and
            regulated industries. Fail-closed pipelines, audit trails, secret
            governance, and production deployment included.
          </p>
          <div className="flex gap-3 justify-center pt-2">
            <Link
              href="/"
              className="inline-flex items-center justify-center h-10 px-6 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
            >
              Try the live app
            </Link>
            <a
              href="https://github.com/caraxesthebloodwyrm02/afloat"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center h-10 px-6 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-sm font-medium rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              View source
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
