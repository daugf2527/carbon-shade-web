import { assert } from "./test-utils.js";
import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";

function placeTarget(kernel: CombatKernel, targetId = "grunt", xOffset = 64) {
  const target = kernel.actors.find(actor => actor.id === targetId)!;
  target.position.x = kernel.player.position.x + xOffset;
  target.position.z = kernel.player.position.z;
  target.position.y = 0;
  target.velocity = { x: 0, z: 0, y: 0 };
  return target;
}

function clearCombatLocks(kernel: CombatKernel): void {
  kernel.hitStop.clear();
  kernel.recoil.clear();
  for (const actor of kernel.actors) {
    actor.currentAction = undefined;
    actor.cooldowns.remaining.clear();
    actor.cooldowns.globalRemaining = 0;
  }
}

const stand = new CombatKernel();
const standTarget = placeTarget(stand);
stand.requestAction(stand.player, "attack1");
stand.runTicks(9);
assert.equal(standTarget.comboCorrection.standGauge, 420, "standing light hit should add the clean-room stand correction value");
clearCombatLocks(stand);
placeTarget(stand);
stand.requestAction(stand.player, "attack3");
stand.runTicks(14);
assert.equal(standTarget.comboCorrection.standGauge, 1020, "heavy standing hit should include the stand heavy bonus");
assert.ok(standTarget.comboCorrection.hitRecoveryGauge > 0, "normal hitstun should advance hit recovery correction");
assert.ok(standTarget.comboCorrection.stunReliefFrames > 0, "hit recovery gauge should shorten later normal hitstun");

const airLow = new CombatKernel();
const lowTarget = placeTarget(airLow);
lowTarget.reactionState = "launch";
lowTarget.position.y = 80;
lowTarget.velocity.y = 0;
airLow.requestAction(airLow.player, "UpwardSlash");
airLow.runTicks(12);
const lowLaunchVelocity = lowTarget.velocity.y;
assert.equal(lowTarget.comboCorrection.airGauge, 470, "air launcher hit should add air hit value plus launch bonus");

const airHigh = new CombatKernel();
const highTarget = placeTarget(airHigh);
highTarget.reactionState = "launch";
highTarget.position.y = 80;
highTarget.velocity.y = 0;
highTarget.comboCorrection.airGauge = 8000;
airHigh.requestAction(airHigh.player, "UpwardSlash");
airHigh.runTicks(12);
assert.ok(highTarget.velocity.y < lowLaunchVelocity, "launch resistance should reduce later launch velocity during long aerial combos");
assert.ok(highTarget.comboCorrection.gravityScale > 1, "aerial correction should raise gravity scale");

const downReject = new CombatKernel();
const downRejectTarget = placeTarget(downReject);
downRejectTarget.reactionState = "downed";
downRejectTarget.handfeel.downRemaining = 30;
downReject.requestAction(downReject.player, "attack1");
downReject.runTicks(9);
assert.equal(downRejectTarget.comboCorrection.downGauge, 0, "ordinary basic attacks should still not touch downed correction when rejected");
assert.ok(downReject.bus.archive.some(event => event.type === "HitRejected" && (event.payload as any).rejectedReason === "downed_not_allowed"), "downed_not_allowed rejection should be preserved");

const downHit = new CombatKernel();
const downHitTarget = placeTarget(downHit);
downHitTarget.reactionState = "downed";
downHitTarget.handfeel.downRemaining = 30;
downHit.requestAction(downHit.player, "RagingFury");
downHit.runTicks(18);
assert.ok(downHitTarget.comboCorrection.downGauge > 0, "canHitDowned RagingFury should advance down correction");
assert.ok(downHit.bus.archive.some(event => event.type === "DownedHit" && event.targetActorId === downHitTarget.id), "accepted downed hits should stay replay-visible as DownedHit");

const forcedWake = new CombatKernel();
const forcedWakeTarget = placeTarget(forcedWake);
forcedWakeTarget.reactionState = "downed";
forcedWakeTarget.handfeel.downRemaining = 30;
forcedWakeTarget.comboCorrection.downGauge = 9800;
forcedWake.requestAction(forcedWake.player, "RagingFury");
forcedWake.runTicks(10);
assert.equal(forcedWakeTarget.reactionState, "getting_up", "full down correction should force getting_up immediately");
assert.equal(forcedWakeTarget.armorProfile.temporaryFlags.getUpArmorUntilTick, forcedWake.tickCount + 8, "forced wake should grant the documented 8F protection");
assert.equal(forcedWakeTarget.armorProfile.temporaryFlags.invulnerableUntilTick, forcedWake.tickCount + 8, "forced wake should also grant true invulnerability for the documented 8F window");
assert.ok(forcedWake.bus.archive.some(event => event.type === "ComboForcedWake" && event.targetActorId === forcedWakeTarget.id), "forced wake must be replay-visible");

clearCombatLocks(forcedWake);
placeTarget(forcedWake);
forcedWake.requestAction(forcedWake.player, "attack1");
forcedWake.runTicks(9);
assert.ok(forcedWake.bus.archive.some(event => event.type === "HitRejected" && event.targetActorId === forcedWakeTarget.id && (event.payload as any).rejectedReason === "target_invulnerable"), "forced wake true invulnerability should reject immediate follow-up hits");

const standKnockdown = new CombatKernel();
const standKnockdownTarget = placeTarget(standKnockdown);
standKnockdownTarget.comboCorrection.standGauge = 10000;
standKnockdown.requestAction(standKnockdown.player, "attack1");
standKnockdown.runTicks(9);
assert.equal(standKnockdownTarget.reactionState, "downed", "full stand correction should force the next ordinary standing hit to knock down");
assert.ok(standKnockdown.bus.archive.some(event => event.type === "ComboStandKnockdown" && event.targetActorId === standKnockdownTarget.id), "stand correction knockdown should be replay-visible");

const reset = new CombatKernel();
const resetTarget = placeTarget(reset);
reset.requestAction(reset.player, "attack1");
reset.runTicks(9);
assert.ok(resetTarget.comboCorrection.standGauge > 0, "setup should create standing correction before reset");
clearCombatLocks(reset);
reset.runTicks(181);
assert.equal(resetTarget.comboCorrection.standGauge, 0, "combo correction should reset after 180F without another hit");
assert.equal(resetTarget.comboCorrection.airGauge, 0, "air correction should reset after the idle timeout");
assert.equal(resetTarget.comboCorrection.downGauge, 0, "down correction should reset after the idle timeout");
assert.equal(resetTarget.comboCorrection.hitRecoveryGauge, 0, "hit recovery correction should reset after the idle timeout");
assert.ok(reset.bus.archive.some(event => event.type === "ComboCorrectionReset" && event.targetActorId === resetTarget.id), "combo correction reset should be replay-visible");

const bossScale = new CombatKernel();
const bossScaleTarget = placeTarget(bossScale, "boss", 70);
bossScaleTarget.comboCorrection.standGauge = 10000;
bossScale.requestAction(bossScale.player, "attack1");
bossScale.runTicks(9);
const bossDamage = bossScale.bus.archive.find(event => event.type === "DamageApplied" && event.targetActorId === bossScaleTarget.id)?.payload as any;
assert.ok(bossDamage.finalDamage < bossDamage.baseDamage, "boss/protected targets should receive combo damage scaling at high correction");
assert.ok(bossDamage.multipliers.some((m: { name: string }) => m.name === "combo_damage_scale"), "combo damage scale should be replay-visible on protected targets");

const gruntNoScale = new CombatKernel();
const gruntNoScaleTarget = placeTarget(gruntNoScale);
gruntNoScaleTarget.comboCorrection.standGauge = 10000;
gruntNoScale.requestAction(gruntNoScale.player, "attack1");
gruntNoScale.runTicks(9);
const gruntDamage = gruntNoScale.bus.archive.find(event => event.type === "DamageApplied" && event.targetActorId === gruntNoScaleTarget.id)?.payload as any;
assert.equal(gruntDamage.finalDamage, gruntDamage.baseDamage, "ordinary grunt targets should not get combo damage scaling");
assert.equal(gruntDamage.multipliers.some((m: { name: string }) => m.name === "combo_damage_scale"), false, "ordinary grunt targets should not record combo damage scaling");

function comboReplayHash(): string {
  const kernel = new CombatKernel();
  const target = placeTarget(kernel);
  target.resources.hp = 1000;
  target.resources.maxHp = 1000;
  target.reactionState = "launch";
  kernel.requestAction(kernel.player, "RagingFury");
  kernel.runTicks(80);
  assert.equal(kernel.bus.archive.filter(event => event.type === "HitConfirmed" && event.targetActorId === target.id && JSON.stringify(event.payload).includes("rf_pillar")).length, 10, "RagingFury should keep its 10 blood-pillar hit sequence under combo correction");
  assert.ok(kernel.replay.frames.some(frame => frame.events.some(event => event.type === "ComboCorrectionUpdated")), "combo correction updates should enter replay frames");
  return kernel.replay.frames.at(-1)?.stateHash ?? "";
}
assert.equal(comboReplayHash(), comboReplayHash(), "combo correction state should keep deterministic replay final stateHash");
