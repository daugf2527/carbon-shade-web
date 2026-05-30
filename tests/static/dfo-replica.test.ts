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
assert.equal(frenzyCd.player.cooldowns.remaining.get("RagingFury"), 702, "Frenzy should reduce supported Berserker skill cooldowns by the official 10% sample value");

const frenzyActivation = new CombatKernel();
const activationHp = frenzyActivation.player.resources.hp;
frenzyActivation.requestAction(frenzyActivation.player, "FrenzyToggle");
assert.ok(frenzyActivation.player.resources.hp < activationHp, "Frenzy activation should pay an immediate HP cost");
assert.ok(frenzyActivation.player.buffs.find(b => b.type === "frenzy")?.modifiers.some(m => m.key === "berserker_skill_attack"), "Frenzy should expose a skill attack modifier for supported Berserker skills");

const frenzyDamage = new CombatKernel();
const frenzyDamageTarget = frenzyDamage.actors.find(a => a.id === "grunt")!;
frenzyDamageTarget.position.x = frenzyDamage.player.position.x + 70;
frenzyDamage.buffs.apply(frenzyDamage.player, "frenzy", frenzyDamage.tickCount, frenzyDamage.bus);
frenzyDamage.requestAction(frenzyDamage.player, "Bloodlust");
frenzyDamage.runTicks(24);
const frenzyDamageEvent = frenzyDamage.bus.archive.find(e => e.type === "DamageApplied" && e.targetActorId === frenzyDamageTarget.id)!.payload as any;
assert.ok(frenzyDamageEvent.finalDamage > 26, "Frenzy should increase supported Berserker skill damage");
assert.ok(frenzyDamageEvent.multipliers.some((m: { name: string }) => m.name === "frenzy_skill_attack"), "Frenzy skill damage should be replay-visible as a damage multiplier");

const normalRecovery = new CombatKernel();
const normalEnemy = normalRecovery.actors.find(a => a.id === "grunt")!;
normalEnemy.position.x = normalRecovery.player.position.x + 60;
normalRecovery.requestAction(normalEnemy, "EnemyBasic", "ai", "left");
normalRecovery.runTicks(12);
const normalReactionFrames = normalRecovery.player.handfeel.reactionRemaining;

const frenzyRecovery = new CombatKernel();
const frenzyEnemy = frenzyRecovery.actors.find(a => a.id === "grunt")!;
frenzyEnemy.position.x = frenzyRecovery.player.position.x + 60;
frenzyRecovery.buffs.apply(frenzyRecovery.player, "frenzy", frenzyRecovery.tickCount, frenzyRecovery.bus);
frenzyRecovery.requestAction(frenzyEnemy, "EnemyBasic", "ai", "left");
frenzyRecovery.runTicks(12);
assert.ok(frenzyRecovery.player.handfeel.reactionRemaining < normalReactionFrames, "Frenzy hit recovery should shorten incoming stagger");

const dash = new CombatKernel();
dash.locomotion.armRun(dash.player, "right");
dash.press("KeyX");
dash.tick();
assert.equal(dash.player.currentAction?.actionName, "dashattack", "X from run should route to DashAttack");

const jump = new CombatKernel();
jump.press("KeyC");
jump.tick();
assert.equal(jump.player.currentAction?.actionName, "jump", "C from neutral should enter Jump");
jump.release("KeyC");
jump.press("KeyX");
jump.tick();
assert.equal(jump.player.currentAction?.actionName, "jumpattack", "X during Jump should route to JumpAttack");

const bloodlust = new CombatKernel();
const boss = bloodlust.actors.find(a => a.id === "boss")!;
boss.position.x = bloodlust.player.position.x + 70;
const bossHp = boss.resources.hp;
assert.equal(bloodlust.requestAction(bloodlust.player, "Bloodlust" as never), true);
bloodlust.runTicks(12);
assert.ok(boss.resources.hp < bossHp, "Bloodlust should still damage grab-immune targets through its blood discharge fallback");
assert.ok(bloodlust.bus.archive.some(e => e.type === "GrabFailed" && e.targetActorId === boss.id), "Bloodlust must record grab failure on grab-immune targets");

const bloodlustGrab = new CombatKernel();
const grabbedGrunt = bloodlustGrab.actors.find(a => a.id === "grunt")!;
grabbedGrunt.position.x = bloodlustGrab.player.position.x + 70;
const grabbedHp = grabbedGrunt.resources.hp;
assert.equal(bloodlustGrab.requestAction(bloodlustGrab.player, "Bloodlust" as never), true);
bloodlustGrab.runTicks(8);
assert.ok(bloodlustGrab.bus.archive.some(e => e.type === "GrabSucceeded" && e.targetActorId === grabbedGrunt.id), "Bloodlust should record a successful grab on normal targets");
assert.equal(grabbedGrunt.reactionState, "grabbed", "Bloodlust successful grab should hold the victim in grabbed reaction");
const heldX = grabbedGrunt.position.x;
bloodlustGrab.runTicks(4);
assert.equal(grabbedGrunt.reactionState, "grabbed", "Bloodlust victim should remain grabbed during the hold window");
assert.equal(grabbedGrunt.position.x, heldX, "Bloodlust hold should lock the victim to the attacker-facing attach point");
assert.equal(grabbedGrunt.resources.hp, grabbedHp, "Bloodlust successful grab should defer damage until the eruption");
bloodlustGrab.runTicks(10);
assert.ok(grabbedGrunt.resources.hp < grabbedHp, "Bloodlust eruption should damage the grabbed victim after the hold");
assert.ok(grabbedGrunt.reactionState !== "grabbed", "Bloodlust victim should exit grabbed reaction after the eruption");
assert.ok(bloodlustGrab.bus.archive.some(e => (e.type as string) === "GrabAttached" && e.targetActorId === grabbedGrunt.id), "Bloodlust hold attachment should be replay-visible");
assert.ok(bloodlustGrab.bus.archive.some(e => (e.type as string) === "BloodlustEruptionReleased" && e.targetActorId === grabbedGrunt.id), "Bloodlust eruption release should be replay-visible");

function bloodlustReplayHash(): string {
  const kernel = new CombatKernel();
  const target = kernel.actors.find(a => a.id === "grunt")!;
  target.position.x = kernel.player.position.x + 70;
  kernel.requestAction(kernel.player, "Bloodlust" as never);
  kernel.runTicks(28);
  assert.ok(kernel.replay.frames.some(frame => frame.events.some(event => event.type === "GrabSucceeded")), "Bloodlust replay should include the grab branch events");
  assert.ok(kernel.replay.frames.some(frame => frame.events.some(event => (event.type as string) === "BloodlustEruptionReleased")), "Bloodlust replay should include the eruption branch events");
  return kernel.replay.frames.at(-1)?.stateHash ?? "";
}
assert.equal(bloodlustReplayHash(), bloodlustReplayHash(), "Bloodlust grab branch should keep deterministic replay final stateHash");

const bloodlustWhiff = new CombatKernel();
for (const actor of bloodlustWhiff.actors) {
  if (actor.id !== bloodlustWhiff.player.id) actor.position.x = bloodlustWhiff.player.position.x + 600;
}
assert.equal(bloodlustWhiff.requestAction(bloodlustWhiff.player, "Bloodlust" as never), true);
bloodlustWhiff.runTicks(18);
assert.ok(bloodlustWhiff.bus.archive.some(e => e.type === "BloodlustWhiffEruption" && e.sourceActorId === bloodlustWhiff.player.id), "Bloodlust should emit a short blood eruption VFX even when the grab whiffs");
assert.equal(bloodlustWhiff.bus.archive.some(e => e.type === "DamageApplied" && e.sourceActorId === bloodlustWhiff.player.id), false, "Bloodlust whiff eruption should not invent damage without a target");

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

const withVimMountainous = new CombatKernel();
const withVimMountainousGrunt = withVimMountainous.actors.find(a => a.id === "grunt")!;
withVimMountainousGrunt.position.x = withVimMountainous.player.position.x + 80;
withVimMountainous.buffs.apply(withVimMountainous.player, "vim_and_vigor", withVimMountainous.tickCount, withVimMountainous.bus);
withVimMountainous.requestAction(withVimMountainous.player, "MountainousWheel");
withVimMountainous.runTicks(22);
assert.equal(withVimMountainousGrunt.statusEffects.some(s => s.type === "bleed"), true, "Vim and Vigor should add Bleed to eligible Berserker post-class skills such as MountainousWheel");
const vimBleed = withVimMountainousGrunt.statusEffects.find(s => s.type === "bleed");
assert.equal(vimBleed?.expiresAtTick, withVimMountainous.tickCount - 6 + 420, "Vim and Vigor level 1 official Bleed duration should be 7s at 60Hz");

const frenzyHeal = new CombatKernel();
const bleedingTarget = frenzyHeal.actors.find(a => a.id === "grunt")!;
bleedingTarget.position.x = frenzyHeal.player.position.x + 70;
bleedingTarget.resources.hp = 8;
frenzyHeal.player.resources.hp = 90;
frenzyHeal.buffs.apply(frenzyHeal.player, "frenzy", frenzyHeal.tickCount, frenzyHeal.bus);
frenzyHeal.status.applyBleed(bleedingTarget, frenzyHeal.player.id, "ForceBleed", frenzyHeal.tickCount, frenzyHeal.bus, 1);
frenzyHeal.requestAction(frenzyHeal.player, "attack1");
frenzyHeal.runTicks(9);
assert.ok(frenzyHeal.player.resources.hp > 90, "Frenzy should restore HP when killing a bleeding enemy");
