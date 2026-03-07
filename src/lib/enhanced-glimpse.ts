/**
 * Enhanced glimpse: risk assessment for a project path.
 * Returns risk score, categorized risks, and mitigation plan.
 */

import { readdir, stat } from "fs/promises";
import { join } from "path";

export interface RiskItem {
  id: string;
  severity: "low" | "medium" | "high";
  description: string;
  path?: string;
}

export interface RiskAssessmentResult {
  riskScore: number;
  risks: {
    securityRisks: RiskItem[];
    stagnationRisks: RiskItem[];
    dependencyRisks: RiskItem[];
    resourceRisks: RiskItem[];
  };
  mitigationPlan: string[];
}

/**
 * Assess risk for a project directory. Scans path and returns structured risks.
 */
export async function riskAssessment(projectPath: string): Promise<RiskAssessmentResult> {
  const securityRisks: RiskItem[] = [];
  const stagnationRisks: RiskItem[] = [];
  const dependencyRisks: RiskItem[] = [];
  const resourceRisks: RiskItem[] = [];

  const normalizedPath = join(projectPath);

  try {
    const st = await stat(normalizedPath);
    if (!st.isDirectory()) {
      throw new Error(`Path is not a directory: ${normalizedPath}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Cannot access path: ${message}`);
  }

  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(normalizedPath, { withFileTypes: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Cannot read directory: ${message}`);
  }
  const hasPackageJson = entries.some((e) => e.name === "package.json");
  const hasEnv = entries.some((e) => e.name === ".env" || e.name === ".env.local");
  if (hasEnv) {
    securityRisks.push({
      id: "env-exposed",
      severity: "medium",
      description: ".env or .env.local present in project root",
      path: normalizedPath,
    });
  }
  if (hasPackageJson) {
    dependencyRisks.push({
      id: "deps-unknown",
      severity: "low",
      description: "Dependency audit recommended",
      path: join(normalizedPath, "package.json"),
    });
  }

  const allRisks = [
    ...securityRisks,
    ...stagnationRisks,
    ...dependencyRisks,
    ...resourceRisks,
  ];
  const riskScore = Math.min(
    100,
    allRisks.length * 15 + securityRisks.filter((r) => r.severity === "high").length * 10
  );
  const mitigationPlan = allRisks.length === 0
    ? ["No specific mitigations identified."]
    : ["Review and address listed risks.", "Run dependency audit if applicable."];

  return {
    riskScore,
    risks: {
      securityRisks,
      stagnationRisks,
      dependencyRisks,
      resourceRisks,
    },
    mitigationPlan,
  };
}
