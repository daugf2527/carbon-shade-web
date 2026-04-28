import { assert } from "./test-utils.js";
import { getAction } from "../../src/combat/actions/FrameDataAction.js";
import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";

const ragingFury = getAction("RagingFury");
const bloodPillars = ragingFury.active.filter(hit => hit.hitType === "blood_pillar");
assert.equal(bloodPillars.length, 10, "DFO reference Raging Fury should use 10 blood pillar hits");
assert.deepEqual(
  bloodPillars.map(hit => hit.id),
  ["rf_pillar_01", "rf_pillar_02", "rf_pillar_03", "rf_pillar_04", "rf_pillar_05", "rf_pillar_06", "rf_pillar_07", "rf_pillar_08", "rf_pillar_09", "rf_pillar_10"],
  "Raging Fury blood pillar hit groups must stay replay-readable"
);
assert.ok(bloodPillars.every(hit => hit.reactionProfile?.launchVelocityY !== undefined && hit.reactionProfile.launchVelocityY <= 4.2), "Raging Fury repeated pillars should keep targets in the column instead of over-launching them");

const quick = new CombatKernel();
quick.player.reactionState = "downed";
quick.press("KeyC");
quick.tick();
quick.release("KeyC");
quick.tick();
assert.equal(quick.player.reactionState, "getting_up");
assert.equal(quick.player.armorProfile.temporaryFlags.getUpArmorUntilTick, quick.tickCount + 18, "Quick Rebound release should grant 0.30s get-up super armor at 60fps");

const frenzyCd = new CombatKernel();
frenzyCd.buffs.apply(frenzyCd.player, "frenzy", frenzyCd.tickCount, frenzyCd.bus);
assert.equal(frenzyCd.requestAction(frenzyCd.player, "RagingFury"), true);
assert.equal(frenzyCd.player.cooldowns.remaining.get("RagingFury"), 72, "Frenzy should reduce supported Berserker skill cooldowns by 20%");

const dash = new CombatKernel();
dash.locomotion.armRun(dash.player, "right");
dash.press("KeyX");
dash.tick();
assert.equal(dash.player.currentAction?.actionName, "DashAttack", "X from run should route to DashAttack");

const jump = new CombatKernel();
jump.press("KeyC");
jump.tick();
assert.equal(jump.player.currentAction?.actionName, "Jump", "C from neutral should enter Jump");
jump.release("KeyC");
jump.press("KeyX");
jump.tick();
assert.equal(jump.player.currentAction?.actionName, "JumpAttack", "X during Jump should route to JumpAttack");

const bloodlust = new CombatKernel();
const boss = bloodlust.actors.find(a => a.id === "boss")!;
boss.position.x = bloodlust.player.position.x + 70;
const bossHp = boss.resources.hp;
assert.equal(bloodlust.requestAction(bloodlust.player, "Bloodlust" as never), true);
bloodlust.runTicks(12);
assert.ok(boss.resources.hp < bossHp, "Bloodlust should still damage grab-immune targets through its blood discharge fallback");
assert.ok(bloodlust.bus.archive.some(e => e.type === "GrabFailed" && e.targetActorId === boss.id), "Bloodlust must record grab failure on grab-immune targets");

const noVim = new CombatKernel();
const noVimGrunt = noVim.actors.find(a => a.id === "grunt")!;
noVimGrunt.position.x = noVim.player.position.x + 80;
noVim.requestAction(noVim.player, "RagingFury");
noVim.runTicks(18);
assert.equal(noVimGrunt.statusEffects.some(s => s.type === "bleed"), false, "RagingFury should not apply Bleed without Vim and Vigor");

const withVim = new CombatKernel();
const withVimGrunt = withVim.actors.find(a => a.id === "grunt")!;
withVimGrunt.position.x = withVim.player.position.x + 80;
withVim.buffs.apply(withVim.player, "vim_and_vigor", withVim.tickCount, withVim.bus);
withVim.requestAction(withVim.player, "RagingFury");
withVim.runTicks(18);
assert.equal(withVimGrunt.statusEffects.some(s => s.type === "bleed"), true, "Vim and Vigor should allow RagingFury to apply Bleed");

const frenzyHeal = new CombatKernel();
const bleedingTarget = frenzyHeal.actors.find(a => a.id === "grunt")!;
bleedingTarget.position.x = frenzyHeal.player.position.x + 70;
bleedingTarget.resources.hp = 8;
frenzyHeal.player.resources.hp = 90;
frenzyHeal.buffs.apply(frenzyHeal.player, "frenzy", frenzyHeal.tickCount, frenzyHeal.bus);
frenzyHeal.status.applyBleed(bleedingTarget, frenzyHeal.player.id, "ForceBleed", frenzyHeal.tickCount, frenzyHeal.bus, 1);
frenzyHeal.requestAction(frenzyHeal.player, "NormalBasic1");
frenzyHeal.runTicks(9);
assert.ok(frenzyHeal.player.resources.hp > 90, "Frenzy should restore HP when killing a bleeding enemy");
