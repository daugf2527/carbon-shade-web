import { assert } from "./test-utils.js";
import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";

for (const type of ["bleed", "poison", "burn", "shock"] as const) {
  const k = new CombatKernel();
  const target = k.actors.find(a => a.id === "grunt")!;
  k.status.applyStatus(target, type, k.player.id, "ForceBleed", k.tickCount, k.bus, 1);
  const hpBefore = target.resources.hp;
  const reactionBefore = target.reactionState;
  k.status.tick(target, 30, k.bus, false, k.actors);
  k.bus.drainAll();
  const dot = k.bus.archive.find(e => e.type === "DamageApplied" && e.targetActorId === target.id && (e.payload as any).sourceKind === "status_dot")?.payload as any;
  assert.ok(dot, `${type} should emit DOT damage`);
  assert.equal(dot.reactionPolicy, "status_tick_feedback_only", `${type} tick must not request normal hit reaction`);
  assert.ok(target.resources.hp < hpBefore, `${type} tick should reduce HP`);
  assert.equal(target.reactionState, reactionBefore, `${type} tick should not change hit reaction`);
}

{
  const k = new CombatKernel();
  const burning = k.actors.find(a => a.id === "grunt")!;
  const near = k.actors.find(a => a.id === "dummy")!;
  const far = k.actors.find(a => a.id === "imp")!;
  burning.position.x = 500;
  near.position.x = burning.position.x + 140;
  near.position.z = burning.position.z;
  far.position.x = burning.position.x + 190;
  far.position.z = burning.position.z;
  const nearHp = near.resources.hp;
  const farHp = far.resources.hp;
  k.status.applyStatus(burning, "burn", k.player.id, "ForceBleed", k.tickCount, k.bus, 1);
  k.status.tick(burning, 30, k.bus, false, k.actors);
  k.bus.drainAll();
  assert.ok(near.resources.hp < nearHp, "Burn tick should splash to targets within 150px");
  assert.equal(far.resources.hp, farHp, "Burn tick should not splash to targets outside 150px");
}

{
  const k = new CombatKernel();
  const target = k.actors.find(a => a.id === "grunt")!;
  target.position.x = k.player.position.x + 70;
  k.status.applyStatus(target, "rupture", k.player.id, "ForceBleed", k.tickCount, k.bus, 1);
  k.status.applyStatus(target, "rupture", k.player.id, "ForceBleed", k.tickCount, k.bus, 1);
  k.status.applyStatus(target, "rupture", k.player.id, "ForceBleed", k.tickCount, k.bus, 1);
  k.requestAction(k.player, "NormalBasic1");
  k.runTicks(9);
  const applied = k.bus.archive.find(e => e.type === "DamageApplied" && e.targetActorId === target.id && (e.payload as any).sourceKind === "direct_hit")?.payload as any;
  assert.ok(applied.multipliers.some((m: { name:string; value:number }) => m.name === "rupture_incoming_damage" && m.value === 1.3), "Three Rupture stacks should add a 1.3x incoming direct damage multiplier");
  assert.ok(applied.finalDamage >= Math.floor(applied.baseDamage * 1.3), "Rupture multiplier should increase direct hit damage");
}
