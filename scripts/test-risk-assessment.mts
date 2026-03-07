#!/usr/bin/env node
/**
 * Test script for riskAssessment from enhanced-glimpse.
 * Run from repo root: npx tsx scripts/test-risk-assessment.mts  OR  npm run test:risk
 */

import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const libDir = join(__dirname, "..", "src", "lib");
const modulePathTs = join(libDir, "enhanced-glimpse.ts");
const modulePathJs = join(libDir, "enhanced-glimpse.js");
const modulePath = existsSync(modulePathTs) ? modulePathTs : modulePathJs;
const moduleUrl = pathToFileURL(modulePath).href;

const pathToScan =
  process.platform === "win32"
    ? "c:/Users/USER/CascadeProjects"
    : (process.env.HOME ?? "") + "/CascadeProjects";

try {
  const { riskAssessment } = await import(moduleUrl);
  const result = await riskAssessment(pathToScan);

  console.log("=== RISK ASSESSMENT TEST ===");
  console.log("Risk score:", result.riskScore);
  console.log("Security risks:", result.risks.securityRisks.length);
  console.log("Stagnation risks:", result.risks.stagnationRisks.length);
  console.log("Dependency risks:", result.risks.dependencyRisks.length);
  console.log("Resource risks:", result.risks.resourceRisks.length);
  console.log("Mitigation plan:", result.mitigationPlan);
} catch (error) {
  const err = error as Error;
  console.error("Error:", err.message);
  console.error("Stack:", err.stack);
  process.exitCode = 1;
}
