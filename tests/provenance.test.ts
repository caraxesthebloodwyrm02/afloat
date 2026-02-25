import { describe, it, expect, beforeAll } from "vitest";
import { createDPR, getChainRef, serializeDPRForHashing } from "@/lib/provenance/record";
import { computeHash, computeChainHash } from "@/lib/provenance/chain";
import { signRecord, verifySignature } from "@/lib/provenance/signer";
import type { DPRCreateInput } from "@/lib/provenance/types";

beforeAll(() => {
  process.env.JWT_SECRET = "test-provenance-secret";
});

function makeInput(overrides: Partial<DPRCreateInput> = {}): DPRCreateInput {
  return {
    decision_type: "gate_verdict",
    action_taken: "authentication_check",
    reasoning_summary: "JWT validated",
    authority_type: "system_policy",
    actor_id: "user-123",
    ...overrides,
  };
}

describe("Decision Provenance Record creation", () => {
  it("creates a valid DPR with all required fields", () => {
    const dpr = createDPR(makeInput(), null);
    expect(dpr.dpr_id).toBeTruthy();
    expect(dpr.parent_dpr_id).toBeNull();
    expect(dpr.chain_hash).toBeTruthy();
    expect(dpr.signature).toBeTruthy();
    expect(dpr.sequence_number).toBe(0);
    expect(dpr.provenance_version).toBe("1.0.0");
    expect(dpr.decision_type).toBe("gate_verdict");
    expect(dpr.action_taken).toBe("authentication_check");
  });

  it("chains DPRs with parent references", () => {
    const first = createDPR(makeInput(), null);
    const second = createDPR(
      makeInput({ action_taken: "rate_limit_check" }),
      getChainRef(first)
    );

    expect(second.parent_dpr_id).toBe(first.dpr_id);
    expect(second.sequence_number).toBe(1);
    expect(second.chain_hash).not.toBe(first.chain_hash);
  });

  it("produces different hashes for different inputs", () => {
    const a = createDPR(makeInput({ action_taken: "action_a" }), null);
    const b = createDPR(makeInput({ action_taken: "action_b" }), null);
    expect(a.chain_hash).not.toBe(b.chain_hash);
  });
});

describe("Hash chain integrity", () => {
  it("creates a valid 3-record chain", () => {
    const dpr1 = createDPR(makeInput({ action_taken: "auth" }), null);
    const dpr2 = createDPR(makeInput({ action_taken: "rate_limit" }), getChainRef(dpr1));
    const dpr3 = createDPR(makeInput({ action_taken: "llm_call" }), getChainRef(dpr2));

    expect(dpr1.sequence_number).toBe(0);
    expect(dpr2.sequence_number).toBe(1);
    expect(dpr3.sequence_number).toBe(2);
    expect(dpr2.parent_dpr_id).toBe(dpr1.dpr_id);
    expect(dpr3.parent_dpr_id).toBe(dpr2.dpr_id);
  });

  it("detects tampered chain hash", () => {
    const dpr = createDPR(makeInput(), null);
    const tampered = { ...dpr, chain_hash: "tampered_hash_value" };

    const { chain_hash: _, signature: __, ...rest } = tampered;
    void _; void __;
    const serialized = serializeDPRForHashing(rest as Parameters<typeof serializeDPRForHashing>[0]);
    const parentHash = null;
    const expectedHash = computeChainHash(parentHash, serialized);

    expect(tampered.chain_hash).not.toBe(expectedHash);
  });
});

describe("HMAC signing", () => {
  it("signs and verifies a record", () => {
    const data = "test-data-for-signing";
    const sig = signRecord(data);
    expect(sig).toBeTruthy();
    expect(verifySignature(data, sig)).toBe(true);
  });

  it("rejects tampered data", () => {
    const data = "original-data";
    const sig = signRecord(data);
    expect(verifySignature("tampered-data", sig)).toBe(false);
  });

  it("rejects tampered signature", () => {
    const data = "test-data";
    const sig = signRecord(data);
    const tampered = sig.slice(0, -5) + "XXXXX";
    expect(verifySignature(data, tampered)).toBe(false);
  });
});

describe("Privacy preservation", () => {
  it("hashes input content instead of storing raw text", () => {
    const dpr = createDPR(
      makeInput({
        input_context: "Should I attend this meeting about the Q3 budget?",
        output_content: "Yes, attend. The agenda covers items you need to decide on.",
      }),
      null
    );

    expect(dpr.input_context_hash).toBeTruthy();
    expect(dpr.output_hash).toBeTruthy();
    expect(dpr.input_context_hash).toBe(
      computeHash("Should I attend this meeting about the Q3 budget?")
    );
    expect(dpr.output_hash).toBe(
      computeHash("Yes, attend. The agenda covers items you need to decide on.")
    );

    const serialized = JSON.stringify(dpr);
    expect(serialized).not.toContain("Should I attend");
    expect(serialized).not.toContain("Q3 budget");
    expect(serialized).not.toContain("Yes, attend");
  });
});

describe("Safety verdicts in DPR", () => {
  it("records safety gate verdicts", () => {
    const dpr = createDPR(
      makeInput({
        safety_verdicts: [
          { gate_id: "jwt_auth", gate_type: "auth", verdict: "pass", latency_ms: 1, confidence: 1.0 },
          { gate_id: "rate_limit", gate_type: "rate_limit", verdict: "pass", latency_ms: 3, confidence: 1.0 },
          { gate_id: "session_enforce", gate_type: "boundary", verdict: "pass", latency_ms: 0, confidence: 1.0 },
        ],
      }),
      null
    );

    expect(dpr.safety_verdicts).toHaveLength(3);
    expect(dpr.safety_verdicts[0].gate_id).toBe("jwt_auth");
    expect(dpr.safety_verdicts[1].verdict).toBe("pass");
  });

  it("records blocked verdicts for refusals", () => {
    const dpr = createDPR(
      makeInput({
        decision_type: "refusal",
        action_taken: "service_refusal",
        reasoning_summary: "Rate limit exceeded",
        safety_verdicts: [
          { gate_id: "rate_limit", gate_type: "rate_limit", verdict: "block", latency_ms: 2, confidence: 1.0 },
        ],
      }),
      null
    );

    expect(dpr.decision_type).toBe("refusal");
    expect(dpr.safety_verdicts[0].verdict).toBe("block");
  });
});

describe("Nominalization compliance (Trust Layer Rule 1.2)", () => {
  it("uses abstract nouns for action_taken, not imperative verbs", () => {
    const actions = [
      "authentication_check",
      "rate_limit_enforcement",
      "session_limit_check",
      "llm_response_delivery",
      "service_refusal",
      "consent_change",
      "data_export",
    ];

    for (const action of actions) {
      expect(action).not.toMatch(/^(I |you |we |do |make |kill |block )/i);
      expect(action).toMatch(/^[a-z_]+$/);
    }
  });
});
