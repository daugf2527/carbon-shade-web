import { assert } from "./test-utils.js";
import { getAction } from "../../src/combat/actions/FrameDataAction.js";
import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";
import { officialBerserkerSkillFacts } from "../../src/data/official/berserkerSkillFacts.js";

assert.equal(getAction("RagingFury").cooldownProfile?.independentCooldownFrames, 780, "Raging Fury official cooldown is 13s at 60Hz");
assert.equal(getAction("RagingFury").costProfile?.mpCost, 142, "Raging Fury level 1 official MP cost should be represented");
assert.equal(getAction("RagingFury").active.filter(hit => hit.hitType === "blood_pillar").length, 10, "Raging Fury official blood eruption hit count is 10");
assert.equal(officialBerserkerSkillFacts.RagingFury.shockwaveDamagePercent, 3345, "Raging Fury official level 1 shockwave damage value should be archived");
assert.equal(officialBerserkerSkillFacts.RagingFury.bloodPillarDamagePercent, 1275, "Raging Fury official level 1 blood pillar damage value should be archived");

assert.equal(getAction("Bloodlust").cooldownProfile?.independentCooldownFrames, 360, "Bloodlust official cooldown is 6s at 60Hz");
assert.equal(getAction("Bloodlust").costProfile?.mpCost, 37, "Bloodlust level 1 official MP cost should be represented");
assert.equal(officialBerserkerSkillFacts.Bloodlust.ungrabbableTargetEruptionDamagePercent, 7944, "Bloodlust official ungrabbable-target damage value should be archived");

assert.equal(getAction("MountainousWheel").cooldownProfile?.independentCooldownFrames, 240, "Mountainous Wheel official cooldown is 4s at 60Hz");
assert.equal(getAction("MountainousWheel").costProfile?.mpCost, 17, "Mountainous Wheel level 1 official MP cost should be represented");
assert.equal(getAction("MountainousWheel").active.filter(hit => hit.hitGroupId === "mw_slash").length, 3, "Mountainous Wheel official downward attack multi-hit count is 3");
assert.equal(officialBerserkerSkillFacts.MountainousWheel.shockwaveDamagePercent, 2498, "Mountainous Wheel official level 1 shockwave damage value should be archived");

assert.equal(getAction("QuickRebound").cooldownProfile?.independentCooldownFrames, 300, "Quick Standing official cooldown is 5s at 60Hz");
assert.equal(getAction("QuickRebound").costProfile?.mpCost, 1, "Quick Standing official MP cost should be represented");
assert.equal(getAction("QuickRebound").maxHoldFrames, 180, "Quick Standing level 1 max invulnerability is 3s at 60Hz");

assert.equal(getAction("Backstep").costProfile?.mpCost, 1, "Backstep official MP cost should be represented");
assert.equal(getAction("Backstep").cooldownProfile, undefined, "Backstep official base skill has no cooldown");

assert.equal(getAction("FrenzyToggle").costProfile?.mpCost, 10, "Frenzy level 1 official MP cost should be represented");
assert.equal(getAction("FrenzyToggle").cooldownProfile?.independentCooldownFrames, 600, "Frenzy official cooldown is 10s at 60Hz");

const frenzyCd = new CombatKernel();
frenzyCd.buffs.apply(frenzyCd.player, "frenzy", frenzyCd.tickCount, frenzyCd.bus);
assert.equal(frenzyCd.requestAction(frenzyCd.player, "RagingFury"), true);
assert.equal(frenzyCd.player.cooldowns.remaining.get("RagingFury"), 702, "Frenzy official cooldown reduction sample is 10%, so 780F becomes 702F");

const derange = new CombatKernel();
assert.equal(derange.requestAction(derange.player, "Derange"), true);
const derangeBuff = derange.player.buffs.find(buff => buff.type === "derange");
assert.equal(derangeBuff?.modifiers.find(modifier => modifier.key === "derange_skill_attack")?.value, 1.34, "Derange level 1 official skill attack increase is represented as 1.34x");
assert.equal(derangeBuff?.modifiers.find(modifier => modifier.key === "derange_attack_speed_percent")?.value, 21, "Derange level 1 official attack speed value should be represented");
assert.equal(derangeBuff?.modifiers.find(modifier => modifier.key === "derange_hit_recovery_percent")?.value, 105, "Derange level 1 official hit recovery value should be represented");

const diehardRejected = new CombatKernel();
const diehardHpBeforeReject = diehardRejected.player.resources.hp;
assert.equal(diehardRejected.requestAction(diehardRejected.player, "Diehard"), false, "Diehard official behavior is low-HP gated at 50% HP");
assert.equal(diehardRejected.player.resources.hp, diehardHpBeforeReject, "Rejected Diehard should not pay HP recovery or apply the buff");
assert.equal(diehardRejected.player.buffs.some(buff => buff.type === "diehard"), false, "Rejected Diehard should not apply its buff");

const diehard = new CombatKernel();
const diehardMaxHp = diehard.player.resources.maxHp;
const diehardPreCast = Math.floor(diehardMaxHp * 0.5);
diehard.player.resources.hp = diehardPreCast;
assert.equal(diehard.requestAction(diehard.player, "Diehard"), true);
assert.equal(diehard.player.resources.hp, Math.min(diehardMaxHp, diehardPreCast + Math.max(1, Math.floor(diehardMaxHp * 0.2))), "Diehard level 1 should recover 20% max HP when used under the 50% threshold");
const diehardBuff = diehard.player.buffs.find(buff => buff.type === "diehard");
assert.equal(diehardBuff?.expiresAtTick, diehard.tickCount + 1860, "Diehard level 1 official duration 31s is represented at 60Hz");
assert.equal(diehardBuff?.modifiers.find(modifier => modifier.key === "diehard_physical_defense")?.value, 8382, "Diehard level 1 official physical defense value should be represented");

const bloodyCross = new CombatKernel();
bloodyCross.runTicks(1);
let bloodyCrossBuff = bloodyCross.player.buffs.find(buff => buff.type === "bloody_cross");
assert.equal(bloodyCrossBuff?.modifiers.find(modifier => modifier.key === "bloody_cross_skill_attack")?.value, 1.287, "Bloody Cross level 1 official base skill attack is represented as 1.287x");
assert.equal(bloodyCrossBuff?.stacks, 0, "Bloody Cross should have no low-HP stage above 70% HP");
bloodyCross.player.resources.hp = Math.floor(bloodyCross.player.resources.maxHp * 0.60);
bloodyCross.runTicks(1);
bloodyCrossBuff = bloodyCross.player.buffs.find(buff => buff.type === "bloody_cross");
assert.equal(bloodyCrossBuff?.stacks, 2, "Bloody Cross official thresholds should include the 60% second stage");
assert.equal(bloodyCrossBuff?.modifiers.find(modifier => modifier.key === "bloody_cross_evasion_percent")?.value, 2.7, "Bloody Cross level 1 60% stage official evasion value should be represented");
