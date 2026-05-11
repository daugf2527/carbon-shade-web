import { assert } from "./test-utils.js";
import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";

const k = new CombatKernel();
const scenario = k.runDeterministicScenario();

assert.equal(scenario.normalHitObserved, true, "normalHit must be observed");
assert.equal(scenario.launchObserved, true, "launch must be observed");
assert.equal(scenario.ragingFuryMultiHitObserved, true, "ragingFuryMultiHit must be observed");
assert.equal(scenario.armorHitObserved, true, "armorHit must be observed");
assert.equal(scenario.buildingArmorBlockedControlObserved, true, "buildingArmorBlockedControl must be observed");
assert.equal(scenario.bleedObserved, true, "bleed must be observed");
assert.equal(scenario.quickReboundObserved, true, "quickRebound must be observed");

const replay = k.replay.export() as Record<string, unknown>;
const metadata = replay.metadata as Record<string, unknown>;
const finalHash = metadata.finalStateHash as string;
assert.ok(finalHash && finalHash.length > 0, "replay must have a final stateHash");

// Golden hash snapshot — update when combat logic intentionally changes
const GOLDEN_HASH = "f9b0b334";
assert.equal(
  finalHash,
  GOLDEN_HASH,
  `State hash changed: ${finalHash} !== ${GOLDEN_HASH}. ` +
  "If combat logic was intentionally changed, update GOLDEN_HASH in this test."
);
