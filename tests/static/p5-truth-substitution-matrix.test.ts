import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assert } from "./test-utils.js";

const ROOT = process.cwd();
const DOC = join(ROOT, "docs", "engineering", "p5-truth-substitution-matrix-2026-06-10.md");
const source = readFileSync(DOC, "utf-8");

const requiredRows = [
  "reaction-routing.test.ts",
  "reaction-velocity.test.ts",
  "swordman-attack1-truth.test.ts",
  "swordman-reaction-formulas.test.ts",
  "hit-resolution-weapon-timeline.test.ts",
  "engine-reaction-truth.test.ts",
  "engine-damage-truth.test.ts",
  "weaponTimelineFlattener",
];

for (const needle of requiredRows) {
  assert.ok(source.includes(needle), `truth substitution matrix should mention ${needle}`);
}

assert.ok(source.includes("已有 engine 替身"), "matrix should contain engine-substitute status column");
assert.ok(source.includes("下一步迁移"), "matrix should contain next-step migration column");
assert.ok(
  source.includes("docs/planning/2026-06-04-engine-native-rewrite-roadmap.md"),
  "matrix should cite the authoritative P5 roadmap",
);

console.log("p5-truth-substitution-matrix: required rows and columns present");
