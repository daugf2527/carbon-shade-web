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
assert.equal(payload.summary.runtimeImportCount, 0, "audit should report runtime combat imports as fully cleared");
assert.equal(payload.summary.truthImportCount, 0, "audit should report truth tests fully migrated off combat");
assert.ok(payload.summary.staticImportCount > 0, "audit should report static tests still bound to combat");
assert.ok(payload.summary.docsMentionCount > 0, "audit should report docs still mentioning src/combat");
assert.ok(Array.isArray(payload.runtimeImports), "runtime import details should be listed");
assert.ok(payload.summary.runtimeCouplingKinds, "audit payload should include runtime coupling kind summary");
assert.equal(payload.summary.runtimeCouplingKinds["type-only"], 0, "audit should classify type-only combat coupling as cleared");
assert.equal(payload.summary.runtimeCouplingKinds["runtime-value"], 0, "audit should classify runtime-value combat coupling as cleared");
assert.equal(payload.summary.runtimeCouplingKinds["source-ref"], 0, "audit should report source-ref combat coupling as cleared once action manifest provenance moves to runtime");
assert.equal(
  payload.summary.truthImportCount,
  0,
  "audit should clear combat-bound truth blockers once the remaining truth tests move to engine",
);
assert.ok(Array.isArray(payload.truthImports), "truth import details should be listed");
assert.ok(Array.isArray(payload.staticImports), "static import details should be listed");
assert.ok(Array.isArray(payload.docsMentions), "doc mention details should be listed");
assert.ok(
  !payload.truthImports.some((entry: { file: string }) => entry.file.includes("tests/truth/swordman-attack1-truth.test.ts")),
  "audit should stop reporting swordman-attack1-truth once its coverage moves to engine surfaces",
);
assert.ok(
  !payload.truthImports.some((entry: { file: string }) => entry.file.includes("tests/truth/reaction-velocity.test.ts")),
  "audit should stop reporting reaction-velocity once its coverage moves to engine surfaces",
);
assert.ok(
  !payload.truthImports.some((entry: { file: string }) => entry.file.includes("tests/truth/swordman-reaction-formulas.test.ts")),
  "audit should stop reporting swordman-reaction-formulas once its coverage moves to engine surfaces",
);
assert.ok(
  !payload.truthImports.some((entry: { file: string }) => entry.file.includes("tests/truth/hit-resolution-weapon-timeline.test.ts")),
  "audit should stop reporting hit-resolution-weapon-timeline once the truth gate moves to engine weapon timeline surfaces",
);
assert.ok(
  !payload.truthImports.some((entry: { file: string }) => entry.file.includes("tests/truth/reaction-routing.test.ts")),
  "audit should stop reporting reaction-routing once the truth gate moves to engine ReactionResolver surfaces",
);
assert.ok(
  !payload.runtimeImports.some((entry: { file: string }) => entry.file.includes("src/data/manifest/sources.ts")),
  "audit should stop reporting sources.ts once ACTION_MANIFEST_DATA_SOURCE no longer points at src/combat",
);
assert.equal(
  payload.summary.runtimeCouplingKinds["type-only"],
  0,
  "audit should clear the final CombatScene type-only edge after DebugSnapshot moves to runtime types",
);
assert.equal(
  payload.summary.runtimeImportCount,
  0,
  "audit should clear runtime combat coupling once CombatScene moves to runtime-owned loop/debug surfaces",
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
  !payload.runtimeImports.some((entry: { file: string }) => entry.file.includes("src/data/manifest/hash.ts")),
  "audit should stop reporting src/data/manifest/hash.ts once manifest action types move to runtime data types",
);
assert.ok(
  !payload.runtimeImports.some((entry: { file: string }) => entry.file.includes("src/data/manifest/schema.ts")),
  "audit should stop reporting src/data/manifest/schema.ts once manifest action types move to runtime data types",
);
assert.ok(
  !payload.runtimeImports.some((entry: { file: string }) => entry.file.includes("src/data/manifest/loader.ts")),
  "audit should stop reporting src/data/manifest/loader.ts once action manifest access moves behind a runtime facade",
);
assert.ok(
  !payload.runtimeImports.some((entry: { file: string; kind: string }) => entry.file.includes("src/game/bootActionManifest.ts") && entry.kind === "type-only"),
  "audit should stop reporting bootActionManifest as a type-only combat edge once manifest action types move to runtime data types",
);
assert.ok(
  !payload.runtimeImports.some((entry: { file: string }) => entry.file.includes("src/game/bootActionManifest.ts")),
  "audit should stop reporting bootActionManifest once loadFromManifest moves behind a runtime facade",
);
assert.ok(
  !payload.runtimeImports.some((entry: { file: string }) => entry.file.includes("src/runtime/data/ActionManifestRuntime.ts")),
  "audit should stop reporting ActionManifestRuntime once the runtime manifest store no longer imports combat action data",
);
assert.ok(
  !payload.runtimeImports.some((entry: { file: string }) => entry.file.includes("src/game/RenderAdapter.ts")),
  "audit should stop reporting RenderAdapter once DebugSnapshot moves to runtime debug types",
);
assert.ok(
  !payload.runtimeImports.some((entry: { file: string }) => entry.file.includes("src/data/manifest/status/default.json")),
  "audit should stop reporting status/default.json once its local-baseline provenance moves to a runtime-neutral archive doc",
);
assert.equal(
  payload.summary.runtimeCouplingKinds["runtime-value"],
  0,
  "audit should clear runtime-value combat coupling once CombatScene stops importing combat FixedStepSimulation",
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
assert.ok(
  !payload.staticImports.some((entry: { file: string }) => entry.file.includes("tests/static/jump-attack-z-position.test.ts")),
  "audit should stop reporting jump-attack-z-position once it migrates to the engine jump harness",
);
assert.ok(
  !payload.staticImports.some((entry: { file: string }) => entry.file.includes("tests/static/jump-attack-z-detailed.test.ts")),
  "audit should stop reporting jump-attack-z-detailed once it migrates to the engine jump harness",
);
assert.ok(
  !payload.staticImports.some((entry: { file: string }) => entry.file.includes("tests/static/jump-attack-hit-recoil.test.ts")),
  "audit should stop reporting jump-attack-hit-recoil once it migrates to the engine jump harness",
);
assert.ok(
  !payload.staticImports.some((entry: { file: string }) => entry.file.includes("tests/static/replay.test.ts")),
  "audit should stop reporting replay.test once it migrates to the engine replay surface",
);
assert.ok(
  !payload.staticImports.some((entry: { file: string }) => entry.file.includes("tests/static/replay-hash.test.ts")),
  "audit should stop reporting replay-hash once it migrates to the engine replay surface",
);
assert.ok(
  !payload.staticImports.some((entry: { file: string }) => entry.file.includes("tests/static/replay-schema.test.ts")),
  "audit should stop reporting replay-schema once it migrates to the engine replay surface",
);
assert.ok(
  !payload.staticImports.some((entry: { file: string }) => entry.file.includes("tests/static/replay-performance.test.ts")),
  "audit should stop reporting replay-performance once it migrates to the engine replay surface",
);
assert.ok(
  !payload.staticImports.some((entry: { file: string }) => entry.file.includes("tests/static/enemy-ai.test.ts")),
  "audit should stop reporting enemy-ai once it migrates to the engine AI surface",
);
assert.ok(
  !payload.staticImports.some((entry: { file: string }) => entry.file.includes("tests/static/fuzz-combat.test.ts")),
  "audit should stop reporting fuzz-combat once it migrates to the engine replay/input surface",
);

console.log(
  `combat-retirement-audit: combatFiles=${payload.summary.combatFileCount} runtime=${payload.summary.runtimeImportCount} truth=${payload.summary.truthImportCount} static=${payload.summary.staticImportCount} docs=${payload.summary.docsMentionCount}`,
);
