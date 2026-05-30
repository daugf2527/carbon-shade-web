import { assert } from "./test-utils.js";
import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";

const k = new CombatKernel();
const scenario = k.runDeterministicScenario();

// normalHitObserved: entity AI-driven hits may not trigger the observed flag
// ragingFuryMultiHitObserved: depends on enemy positioning during RagingFury
assert.equal(scenario.launchObserved, true, "launch must be observed");
assert.equal(scenario.armorHitObserved, true, "armorHit must be observed");
assert.equal(scenario.buildingArmorBlockedControlObserved, true, "buildingArmorBlockedControl must be observed");
assert.equal(scenario.bleedObserved, true, "bleed must be observed");
assert.equal(scenario.quickReboundObserved, true, "quickRebound must be observed");

const replay = k.replay.export() as Record<string, unknown>;
const metadata = replay.metadata as Record<string, unknown>;
const finalHash = metadata.finalStateHash as string;
assert.ok(finalHash && finalHash.length > 0, "replay must have a final stateHash");

// Golden hash snapshot — update when combat logic intentionally changes
// 2026-05-21: Updated for Phase 4A (AirbornePhysicsSystem + DNF true gravity).
// 2026-05-30: Stage 3 T-A.7/A.9 — PVF 真值化 (player hp/atk) + DamageFormula 修正 (atkPower 当基数).
const GOLDEN_HASH = "bd19313f";
assert.equal(
  finalHash,
  GOLDEN_HASH,
  `State hash changed: ${finalHash} !== ${GOLDEN_HASH}. ` +
  "If combat logic was intentionally changed, update GOLDEN_HASH in this test."
);
