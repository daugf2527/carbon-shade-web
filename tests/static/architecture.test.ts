import { assert } from "./test-utils.js";
import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";
import { FixedStepSimulation } from "../../src/combat/kernel/FixedStepSimulation.js";
const k = new CombatKernel();
assert.ok(k.bus && k.hitResolver && k.damageResolver && k.reactionResolver && k.hitStop && k.recoil && k.status && k.buffs && k.cooldowns && k.death && k.replay);
const sim = new FixedStepSimulation(k); sim.update(17); assert.equal(k.tickCount, 1);
