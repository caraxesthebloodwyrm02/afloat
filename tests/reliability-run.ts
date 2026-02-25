/**
 * 100-Session KPI Baseline Reliability Run
 *
 * This script runs against a LIVE deployment (local or production) to validate
 * that the tool meets its contract KPI baselines:
 *
 *   - Session success rate  ≥ 95%
 *   - Avg response latency  ≤ 3.0 seconds
 *   - Avg session duration   ≤ 2.0 minutes
 *
 * Usage:
 *   AFLOAT_BASE_URL=http://localhost:3000 AFLOAT_TEST_TOKEN=<jwt> npx tsx tests/reliability-run.ts
 *
 * The token must be a valid JWT for an active subscriber.
 * This script is NOT a vitest test — it's an executable script that produces a KPI report.
 *
 * Estimated OpenAI API cost: ~$0.10–0.30 for 100 sessions.
 */

const BASE_URL = process.env.AFLOAT_BASE_URL || "http://localhost:3000";
const AUTH_TOKEN = process.env.AFLOAT_TEST_TOKEN;
const TOTAL_SESSIONS = parseInt(process.env.AFLOAT_SESSION_COUNT || "100", 10);

// 30 test prompts covering all 4 gate types + out_of_scope
const TEST_PROMPTS: Array<{ prompt: string; expectedGate: string }> = [
  // meeting_triage
  { prompt: "Should I attend a 1-hour meeting about Q3 planning? The agenda is vague.", expectedGate: "meeting_triage" },
  { prompt: "My manager scheduled a sync about the project timeline. Worth attending?", expectedGate: "meeting_triage" },
  { prompt: "There's an optional all-hands tomorrow. Is it worth my time?",  expectedGate: "meeting_triage" },
  { prompt: "I got invited to a design review for a project I'm not on. Should I go?", expectedGate: "meeting_triage" },
  { prompt: "Should I set up a meeting with the vendor or just email them?", expectedGate: "meeting_triage" },
  { prompt: "Is this 30-minute standup actually necessary if we have a Slack channel?", expectedGate: "meeting_triage" },

  // priority_decision
  { prompt: "I have 5 tasks due this week. Which should I tackle first?", expectedGate: "priority_decision" },
  { prompt: "Bug fix or new feature — which is more urgent right now?", expectedGate: "priority_decision" },
  { prompt: "Should I focus on the client demo prep or the internal report?", expectedGate: "priority_decision" },
  { prompt: "I can only do 2 of these 4 things today. Help me pick.", expectedGate: "priority_decision" },
  { prompt: "Resume update vs. side project — what should I work on tonight?", expectedGate: "priority_decision" },
  { prompt: "Three emails need replies. One from my boss, one from a client, one from HR.", expectedGate: "priority_decision" },

  // quick_briefing
  { prompt: "Give me the gist of what a product-market fit means.", expectedGate: "quick_briefing" },
  { prompt: "What's the TLDR on the new company remote work policy?", expectedGate: "quick_briefing" },
  { prompt: "Summarize what a DPIA is so I can talk about it in a meeting.", expectedGate: "quick_briefing" },
  { prompt: "Brief me on what Stripe Checkout does so I can explain it to my team.", expectedGate: "quick_briefing" },
  { prompt: "What's the quick summary of GDPR consent requirements?", expectedGate: "quick_briefing" },
  { prompt: "Explain rate limiting in one paragraph so I sound smart in the review.", expectedGate: "quick_briefing" },

  // context_gate_resolution
  { prompt: "I'm stuck. I don't understand why the deployment keeps failing.", expectedGate: "context_gate_resolution" },
  { prompt: "I can't figure out what this project is actually trying to achieve.", expectedGate: "context_gate_resolution" },
  { prompt: "Everyone's talking about this initiative and I have no context.", expectedGate: "context_gate_resolution" },
  { prompt: "I inherited this codebase and don't know where to start reading.", expectedGate: "context_gate_resolution" },
  { prompt: "My team reorganized and I don't know what my new role covers.", expectedGate: "context_gate_resolution" },
  { prompt: "The client sent requirements but I don't understand the domain.", expectedGate: "context_gate_resolution" },

  // out_of_scope
  { prompt: "Write me a 2000-word essay on climate change.", expectedGate: "out_of_scope" },
  { prompt: "Build me a full React app with authentication.", expectedGate: "out_of_scope" },
  { prompt: "Can you do my homework? It's a 10-page paper.", expectedGate: "out_of_scope" },
  { prompt: "Translate this entire document from English to French.", expectedGate: "out_of_scope" },
  { prompt: "Generate a complete business plan with financial projections.", expectedGate: "out_of_scope" },
  { prompt: "Debug my 500-line Python script and fix all the errors.", expectedGate: "out_of_scope" },
];

// Follow-up prompts (sent as second message in some sessions)
const FOLLOW_UPS = [
  "Can you clarify that?",
  "What would you recommend then?",
  "OK, but what if the deadline moves?",
  "That helps. One more thing — what's the risk?",
  "Thanks. Should I loop anyone else in?",
];

interface SessionResult {
  sessionId: string;
  success: boolean;
  gateType: string;
  expectedGate: string;
  gateMatch: boolean;
  latencyFirstTurn: number;
  latencySecondTurn: number | null;
  totalDurationMs: number;
  error: string | null;
  turnsCompleted: number;
}

async function apiCall(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<{ status: number; data: Record<string, unknown>; latencyMs: number }> {
  const start = Date.now();
  const options: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}),
    },
  };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(`${BASE_URL}${path}`, options);
  const latencyMs = Date.now() - start;
  const data = await response.json();
  return { status: response.status, data: data as Record<string, unknown>, latencyMs };
}

async function runSession(index: number): Promise<SessionResult> {
  const prompt = TEST_PROMPTS[index % TEST_PROMPTS.length];
  const sendFollowUp = index % 3 === 0; // ~33% of sessions get a follow-up
  const followUp = FOLLOW_UPS[index % FOLLOW_UPS.length];

  const sessionStart = Date.now();
  let sessionId = "";
  let gateType = "";
  let latencyFirst = 0;
  let latencySecond: number | null = null;
  let turnsCompleted = 0;

  try {
    // Start session
    const startRes = await apiCall("POST", "/api/v1/session/start");
    if (startRes.status !== 200) {
      return {
        sessionId: "",
        success: false,
        gateType: "",
        expectedGate: prompt.expectedGate,
        gateMatch: false,
        latencyFirstTurn: 0,
        latencySecondTurn: null,
        totalDurationMs: Date.now() - sessionStart,
        error: `session/start failed: ${startRes.status} ${JSON.stringify(startRes.data)}`,
        turnsCompleted: 0,
      };
    }
    sessionId = startRes.data.session_id as string;

    // First message
    const msgRes = await apiCall("POST", `/api/v1/session/${sessionId}/message`, {
      message: prompt.prompt,
    });
    latencyFirst = msgRes.latencyMs / 1000;
    turnsCompleted = 1;

    if (msgRes.status !== 200) {
      return {
        sessionId,
        success: false,
        gateType: "",
        expectedGate: prompt.expectedGate,
        gateMatch: false,
        latencyFirstTurn: latencyFirst,
        latencySecondTurn: null,
        totalDurationMs: Date.now() - sessionStart,
        error: `message failed: ${msgRes.status} ${JSON.stringify(msgRes.data)}`,
        turnsCompleted,
      };
    }

    gateType = msgRes.data.gate_type as string;

    // Optional follow-up
    if (sendFollowUp && (msgRes.data.turns_remaining as number) > 0) {
      const fuRes = await apiCall("POST", `/api/v1/session/${sessionId}/message`, {
        message: followUp,
      });
      latencySecond = fuRes.latencyMs / 1000;
      turnsCompleted = 2;

      if (fuRes.status !== 200) {
        return {
          sessionId,
          success: false,
          gateType,
          expectedGate: prompt.expectedGate,
          gateMatch: gateType === prompt.expectedGate,
          latencyFirstTurn: latencyFirst,
          latencySecondTurn: latencySecond,
          totalDurationMs: Date.now() - sessionStart,
          error: `follow-up failed: ${fuRes.status} ${JSON.stringify(fuRes.data)}`,
          turnsCompleted,
        };
      }
    }

    // End session
    await apiCall("POST", `/api/v1/session/${sessionId}/end`);

    return {
      sessionId,
      success: true,
      gateType,
      expectedGate: prompt.expectedGate,
      gateMatch: gateType === prompt.expectedGate,
      latencyFirstTurn: latencyFirst,
      latencySecondTurn: latencySecond,
      totalDurationMs: Date.now() - sessionStart,
      error: null,
      turnsCompleted,
    };
  } catch (err) {
    return {
      sessionId,
      success: false,
      gateType,
      expectedGate: prompt.expectedGate,
      gateMatch: false,
      latencyFirstTurn: latencyFirst,
      latencySecondTurn: latencySecond,
      totalDurationMs: Date.now() - sessionStart,
      error: err instanceof Error ? err.message : String(err),
      turnsCompleted,
    };
  }
}

async function main() {
  if (!AUTH_TOKEN) {
    console.error("ERROR: AFLOAT_TEST_TOKEN is required. Set it to a valid JWT for an active subscriber.");
    console.error("Usage: AFLOAT_BASE_URL=http://localhost:3000 AFLOAT_TEST_TOKEN=<jwt> npx tsx tests/reliability-run.ts");
    process.exit(1);
  }

  // Verify health endpoint first
  try {
    const health = await apiCall("GET", "/api/v1/health");
    if (health.status !== 200 || health.data.status !== "ok") {
      console.error(`ERROR: Health check failed: ${health.status} ${JSON.stringify(health.data)}`);
      process.exit(1);
    }
    console.log(`✓ Health check passed (${health.latencyMs}ms)`);
  } catch (err) {
    console.error(`ERROR: Cannot reach ${BASE_URL}: ${err}`);
    process.exit(1);
  }

  console.log(`\nRunning ${TOTAL_SESSIONS} sessions against ${BASE_URL}...\n`);

  const results: SessionResult[] = [];

  for (let i = 0; i < TOTAL_SESSIONS; i++) {
    const result = await runSession(i);
    results.push(result);

    const status = result.success ? "✓" : "✗";
    const gate = result.gateType || "—";
    const latency = result.latencyFirstTurn.toFixed(2);
    process.stdout.write(
      `  ${status} Session ${String(i + 1).padStart(3)}/${TOTAL_SESSIONS}  gate=${gate.padEnd(24)}  latency=${latency}s  ${result.error ? `ERROR: ${result.error}` : ""}\n`
    );
  }

  // ---------------------------------------------------------------------------
  // KPI Report
  // ---------------------------------------------------------------------------

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  const sessionSuccessRate = successful.length / results.length;

  const allLatencies = results
    .filter((r) => r.latencyFirstTurn > 0)
    .flatMap((r) => {
      const turns = [r.latencyFirstTurn];
      if (r.latencySecondTurn !== null) turns.push(r.latencySecondTurn);
      return turns;
    });
  const avgLatency = allLatencies.length > 0
    ? allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length
    : 0;

  const avgDuration = results.length > 0
    ? results.reduce((a, r) => a + r.totalDurationMs, 0) / results.length / 60_000
    : 0;

  const gateMatches = successful.filter((r) => r.gateMatch).length;
  const gateMatchRate = successful.length > 0 ? gateMatches / successful.length : 0;

  console.log("\n" + "=".repeat(70));
  console.log("  KPI BASELINE REPORT");
  console.log("=".repeat(70));
  console.log(`  Total sessions:        ${results.length}`);
  console.log(`  Successful:            ${successful.length}`);
  console.log(`  Failed:                ${failed.length}`);
  console.log("");

  const successIcon = sessionSuccessRate >= 0.95 ? "PASS ✓" : "FAIL ✗";
  const latencyIcon = avgLatency <= 3.0 ? "PASS ✓" : "FAIL ✗";
  const durationIcon = avgDuration <= 2.0 ? "PASS ✓" : "FAIL ✗";

  console.log(`  Session success rate:  ${(sessionSuccessRate * 100).toFixed(1)}%  (threshold ≥ 95%)    ${successIcon}`);
  console.log(`  Avg response latency:  ${avgLatency.toFixed(2)}s   (threshold ≤ 3.0s)    ${latencyIcon}`);
  console.log(`  Avg session duration:  ${avgDuration.toFixed(2)} min (threshold ≤ 2.0 min)  ${durationIcon}`);
  console.log(`  Gate type accuracy:    ${(gateMatchRate * 100).toFixed(1)}%  (informational — no contract threshold)`);
  console.log("=".repeat(70));

  // Gate type breakdown
  const gateCounts: Record<string, number> = {};
  for (const r of successful) {
    gateCounts[r.gateType] = (gateCounts[r.gateType] || 0) + 1;
  }
  console.log("\n  Gate type distribution:");
  for (const [gate, count] of Object.entries(gateCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${gate.padEnd(28)} ${count}`);
  }

  // Errors summary
  if (failed.length > 0) {
    console.log("\n  Errors:");
    const errorCounts: Record<string, number> = {};
    for (const r of failed) {
      const key = r.error || "unknown";
      errorCounts[key] = (errorCounts[key] || 0) + 1;
    }
    for (const [error, count] of Object.entries(errorCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`    [${count}x] ${error}`);
    }
  }

  console.log("");

  // Exit code reflects pass/fail
  const allPassed = sessionSuccessRate >= 0.95 && avgLatency <= 3.0 && avgDuration <= 2.0;
  if (allPassed) {
    console.log("  ✓ ALL KPI BASELINES MET");
  } else {
    console.log("  ✗ ONE OR MORE BASELINES FAILED");
  }

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
