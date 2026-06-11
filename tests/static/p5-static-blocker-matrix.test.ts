import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assert } from "./test-utils.js";

const ROOT = process.cwd();
const DOC = join(ROOT, "docs", "engineering", "p5-static-blocker-matrix-2026-06-10.md");
const source = readFileSync(DOC, "utf-8");

const requiredRows = [
  "tests/static/combat-chain-regression.test.ts",
  "tests/static/replay-hash.test.ts",
  "tests/static/official-api-alignment.test.ts",
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
  source.includes("- 当前 static blocker 文件数: 31"),
  "static blocker matrix should report 31 remaining combat-bound static files after the first kernel-shell batch",
);
assert.ok(
  source.includes("| `kernel-shell` | 29 |"),
  "first static migration batch should reduce kernel-shell blockers by three files",
);
assert.ok(
  source.includes("| `data-surface` | 0 |"),
  "static blocker matrix should show that the data-surface bucket has been cleared",
);
assert.ok(
  source.includes("| `replay-input` | 0 |"),
  "static blocker matrix should show that the replay-input bucket has been cleared",
);
assert.ok(
  !source.includes("tests/static/action-cancel-probe.test.ts"),
  "static blocker matrix should stop listing action-cancel-probe once it migrates to engine action-system coverage",
);
assert.ok(
  !source.includes("tests/static/architecture.test.ts"),
  "static blocker matrix should stop listing architecture once it becomes a runtime-shell migration guard",
);
assert.ok(
  !source.includes("tests/static/auto-combat.test.ts"),
  "static blocker matrix should stop listing auto-combat once it migrates to engine scene-style coverage",
);
assert.ok(
  !source.includes("tests/static/manifest-provenance.test.ts"),
  "static blocker matrix should stop listing manifest-provenance once replay metadata moves to runtime",
);
assert.ok(
  !source.includes("tests/static/schema-hash-freshness.test.ts"),
  "static blocker matrix should stop listing schema-hash-freshness once replay metadata moves to runtime",
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
