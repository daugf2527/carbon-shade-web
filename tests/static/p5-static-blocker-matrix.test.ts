import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assert } from "./test-utils.js";

const ROOT = process.cwd();
const DOC = join(ROOT, "docs", "engineering", "p5-static-blocker-matrix-2026-06-10.md");
const source = readFileSync(DOC, "utf-8");

const requiredRows = [
  "tests/static/action-cancel-probe.test.ts",
  "tests/static/architecture.test.ts",
  "tests/static/combat-chain-regression.test.ts",
  "tests/static/manifest-provenance.test.ts",
  "tests/static/schema-hash-freshness.test.ts",
];

for (const needle of requiredRows) {
  assert.ok(source.includes(needle), `static blocker matrix should mention ${needle}`);
}

for (const bucket of ["kernel-shell", "combat-subsystems", "replay-input", "data-surface"]) {
  assert.ok(source.includes(`\`${bucket}\``), `static blocker matrix should document ${bucket}`);
}

assert.ok(
  source.includes("docs/planning/2026-06-04-engine-native-rewrite-roadmap.md"),
  "static blocker matrix should cite the authoritative P5 roadmap",
);
assert.ok(
  source.includes("docs/engineering/combat-retirement-audit-2026-06-10.md"),
  "static blocker matrix should cite the retirement audit evidence",
);
assert.ok(
  source.includes("| `data-surface` | 0 |"),
  "static blocker matrix should show that the data-surface bucket has been cleared",
);
assert.ok(
  source.includes("| `replay-input` | 2 |"),
  "static blocker matrix should show that the replay-input bucket has been reduced to the remaining replay-only blockers",
);
assert.ok(
  !source.includes("tests/static/run-detector.test.ts"),
  "static blocker matrix should stop listing run-detector once it migrates to runtime input surfaces",
);
assert.ok(
  !source.includes("tests/static/socd-cleaner.test.ts"),
  "static blocker matrix should stop listing socd-cleaner once it migrates to runtime input surfaces",
);

console.log("p5-static-blocker-matrix: required rows and buckets present");
