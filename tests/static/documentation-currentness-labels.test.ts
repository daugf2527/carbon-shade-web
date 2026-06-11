import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assert } from "./test-utils.js";

const ROOT = process.cwd();

const checks = [
  ["docs/engineering/architecture-overview.md", "Status:"],
  ["docs/engineering/architecture-improvement-plan.md", "Status:"],
  ["docs/design/stage3-combat-system-survey.md", "Status:"],
  ["docs/engineering/data-contract-baseline.md", "Status:"],
  ["docs/planning/2026-05-21-extraction-pipeline-design.md", "Status:"],
  ["docs/planning/2026-05-26-stage1.5-revised-plan.md", "Status:"],
  ["docs/plans/2026-05-21-dnf-data-layer-design.md", "Status:"],
  ["docs/plans/2026-05-21-dnf-native-kernel-design.md", "Status:"],
  ["docs/plans/2026-05-22-stage1-data-pipeline-design.md", "Status:"],
  ["docs/testing/session-summary-2026-05-31.md", "Status:"],
];

for (const [file, needle] of checks) {
  const source = readFileSync(join(ROOT, file), "utf-8");
  assert.ok(source.includes(needle), `${file} should declare ${needle}`);
  assert.ok(
    source.includes("Authoritative successor:"),
    `${file} should point readers to an authoritative successor`,
  );
}

console.log("documentation-currentness-labels: stale docs declare successor labels");
