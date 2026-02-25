import { describe, it, expect } from "vitest";

const VALID_GATE_TYPES = [
  "meeting_triage",
  "priority_decision",
  "quick_briefing",
  "context_gate_resolution",
  "out_of_scope",
];

function parseGateAndBrief(raw: string): { gate_type: string; brief: string } {
  const gateMatch = raw.match(/\[GATE:\s*(\w+)\]/);

  let gate_type = "unclassified";
  if (gateMatch) {
    const parsed = gateMatch[1];
    if (VALID_GATE_TYPES.includes(parsed)) {
      gate_type = parsed;
    }
  }

  const brief = raw
    .replace(/\[GATE:\s*\w+\]\s*/g, "")
    .replace(/\[BRIEF\]\s*/g, "")
    .trim();

  return { gate_type, brief };
}

describe("parseGateAndBrief", () => {
  it("parses meeting_triage gate type", () => {
    const raw = "[GATE: meeting_triage]\nYou should attend this meeting because...";
    const result = parseGateAndBrief(raw);
    expect(result.gate_type).toBe("meeting_triage");
    expect(result.brief).toContain("You should attend");
  });

  it("parses priority_decision gate type", () => {
    const raw = "[GATE: priority_decision]\nFocus on task 2 first because...";
    const result = parseGateAndBrief(raw);
    expect(result.gate_type).toBe("priority_decision");
  });

  it("parses quick_briefing gate type", () => {
    const raw = "[GATE: quick_briefing]\nThe gist of this proposal is...";
    const result = parseGateAndBrief(raw);
    expect(result.gate_type).toBe("quick_briefing");
  });

  it("parses context_gate_resolution gate type", () => {
    const raw = "[GATE: context_gate_resolution]\nHere's what's happening...";
    const result = parseGateAndBrief(raw);
    expect(result.gate_type).toBe("context_gate_resolution");
  });

  it("parses out_of_scope gate type", () => {
    const raw = "[GATE: out_of_scope] This is outside what I can help with in a quick session.";
    const result = parseGateAndBrief(raw);
    expect(result.gate_type).toBe("out_of_scope");
  });

  it("returns unclassified for missing gate tag", () => {
    const raw = "Here's some response without a gate tag.";
    const result = parseGateAndBrief(raw);
    expect(result.gate_type).toBe("unclassified");
    expect(result.brief).toBe("Here's some response without a gate tag.");
  });

  it("returns unclassified for invalid gate type", () => {
    const raw = "[GATE: unknown_type]\nSome response.";
    const result = parseGateAndBrief(raw);
    expect(result.gate_type).toBe("unclassified");
  });

  it("strips [BRIEF] tag from response", () => {
    const raw = "[GATE: meeting_triage]\n[BRIEF]\nYou should attend.";
    const result = parseGateAndBrief(raw);
    expect(result.brief).toBe("You should attend.");
  });

  it("handles empty response", () => {
    const result = parseGateAndBrief("");
    expect(result.gate_type).toBe("unclassified");
    expect(result.brief).toBe("");
  });
});
