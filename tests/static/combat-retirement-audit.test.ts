import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { assert } from "./test-utils.js";

const ROOT = process.cwd();
const SCRIPT = join(ROOT, "scripts", "combat-retirement-audit.mjs");

const run = spawnSync(process.execPath, [SCRIPT, "--output", "json"], {
  cwd: ROOT,
  encoding: "utf-8",
});

assert.equal(
  run.status,
  0,
  `combat retirement audit should exit 0.\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}`,
);

const payload = JSON.parse(run.stdout);

assert.equal(payload.passed, true, "audit payload should mark itself passed when scan succeeds");
assert.ok(payload.summary, "audit payload should include summary");
assert.ok(payload.summary.combatFileCount > 0, "audit should count src/combat files");
assert.ok(payload.summary.runtimeImportCount > 0, "audit should report runtime combat imports");
assert.ok(payload.summary.truthImportCount > 0, "audit should report truth tests still bound to combat");
assert.ok(payload.summary.staticImportCount > 0, "audit should report static tests still bound to combat");
assert.ok(payload.summary.docsMentionCount > 0, "audit should report docs still mentioning src/combat");
assert.ok(Array.isArray(payload.runtimeImports), "runtime import details should be listed");
assert.ok(payload.summary.runtimeCouplingKinds, "audit payload should include runtime coupling kind summary");
assert.ok(payload.summary.runtimeCouplingKinds["type-only"] > 0, "audit should classify type-only combat coupling");
assert.ok(payload.summary.runtimeCouplingKinds["runtime-value"] > 0, "audit should classify runtime-value combat coupling");
assert.ok(payload.summary.runtimeCouplingKinds["source-ref"] > 0, "audit should classify source-ref combat coupling");
assert.ok(Array.isArray(payload.truthImports), "truth import details should be listed");
assert.ok(Array.isArray(payload.staticImports), "static import details should be listed");
assert.ok(Array.isArray(payload.docsMentions), "doc mention details should be listed");
assert.ok(
  payload.truthImports.some((entry: { file: string }) => entry.file.includes("tests/truth/swordman-attack1-truth.test.ts")),
  "audit should capture swordman-attack1-truth as a combat-bound truth blocker",
);
assert.ok(
  payload.runtimeImports.some((entry: { file: string }) => entry.file.includes("src/data/manifest/sources.ts")),
  "audit should capture runtime/source-manifest combat coupling",
);
assert.ok(
  payload.runtimeImports.some((entry: { kind: string; file: string }) => entry.kind === "runtime-value" && entry.file.includes("src/game/CombatScene.ts")),
  "audit should classify CombatScene edge as runtime-value coupling",
);
assert.equal(
  payload.summary.runtimeCouplingKinds["type-only"],
  6,
  "audit should shrink type-only combat coupling after shared runtime data types are extracted",
);
assert.ok(
  !payload.runtimeImports.some((entry: { file: string }) => entry.file.includes("src/data/manifest/ai.ts")),
  "audit should stop reporting src/data/manifest/ai.ts once EnemyAIState moves to runtime types",
);
assert.ok(
  !payload.runtimeImports.some((entry: { file: string }) => entry.file.includes("src/data/manifest/aiTypes.ts")),
  "audit should stop reporting src/data/manifest/aiTypes.ts once manifest metadata types stop importing combat types",
);
assert.ok(
  !payload.runtimeImports.some((entry: { file: string }) => entry.file.includes("src/data/official/dnf/physics.ts")),
  "audit should stop reporting src/data/official/dnf/physics.ts once provenance types move to runtime types",
);
assert.ok(
  payload.runtimeImports.some((entry: { kind: string; file: string }) => entry.kind === "type-only" && entry.file.includes("src/data/manifest/hash.ts")),
  "audit should still capture the remaining manifest action-type coupling after the shared data-type extraction",
);
assert.ok(
  payload.runtimeImports.some((entry: { kind: string; file: string }) => entry.kind === "source-ref" && entry.file.includes("src/data/manifest/status/default.json")),
  "audit should classify manifest sourceRef edges separately",
);
assert.ok(
  payload.runtimeImports.every((entry: { file: string }) => !entry.file.startsWith("src/combat/")),
  "runtime coupling should only report external edges into combat, not combat-internal files",
);
assert.ok(
  payload.runtimeImports.every((entry: { file: string }) => entry.file !== "scripts/combat-retirement-audit.mjs"),
  "runtime coupling should not include the audit script itself",
);
assert.ok(
  payload.docsMentions.some((entry: { file: string }) => entry.file.includes("docs/planning/2026-06-04-engine-native-rewrite-roadmap.md")),
  "audit should capture the P5 roadmap doc as a retirement reference",
);
assert.ok(
  !payload.staticImports.some((entry: { file: string }) => entry.file.includes("tests/static/run-detector.test.ts")),
  "audit should stop reporting run-detector once it migrates to runtime input surfaces",
);
assert.ok(
  !payload.staticImports.some((entry: { file: string }) => entry.file.includes("tests/static/socd-cleaner.test.ts")),
  "audit should stop reporting socd-cleaner once it migrates to runtime input surfaces",
);

console.log(
  `combat-retirement-audit: combatFiles=${payload.summary.combatFileCount} runtime=${payload.summary.runtimeImportCount} truth=${payload.summary.truthImportCount} static=${payload.summary.staticImportCount} docs=${payload.summary.docsMentionCount}`,
);
