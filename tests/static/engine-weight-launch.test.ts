/**
 * engine-weight-launch.test.ts — defender weight drives launch/knockback (audit fix 2026-06-07)
 *
 * Guards the fix where weightFactor was hardcoded to the ATTACKER's weight (68000) regardless
 * of who was hit. Now it reads the DEFENDER's PVF weight (chr.weight 68000 / mob.weight 45000).
 * Without this guard the bug (constant weightFactor) is invisible — existing reaction tests use
 * synthetic actors with no weight, so they never exercised per-target distinction.
 *
 * ⚠️ The weightFactor THRESHOLD (150000) + formula shape are still research推测 (D9=B). This test
 * only guards that the per-entity weight VALUE (real PVF) actually flows through and changes launch.
 */
import { assert } from "./test-utils.js";
import { Actor } from "../../src/engine/core/Actor.js";
import { applyHitReaction, type AtkFlags } from "../../src/engine/core/ReactionResolver.js";

function makeActor(id: string, weight: number | undefined): Actor {
  return new Actor(id, "monster", {
    hpMax: 9999, mpMax: 0, moveSpeed: 0,
    physicalAttack: 0, physicalDefense: 0,
    weight,
  });
}

const LIFT_FLAGS: AtkFlags = {
  hitReaction: "hit_lift_up",
  liftUpValue: 300,
  weaponLaunch: 0, // slot0 → fallback to liftUp × weightFactor
};

// W1: lighter defender launches higher (goblin 45000 vs swordman 68000)
{
  const light = makeActor("goblin", 45000);
  const heavy = makeActor("swordman", 68000);
  const rLight = applyHitReaction(light, LIFT_FLAGS, 0, 0);
  const rHeavy = applyHitReaction(heavy, LIFT_FLAGS, 0, 0);
  assert.ok(rLight.launchVy > rHeavy.launchVy, `W1 lighter flies higher: ${rLight.launchVy.toFixed(1)} > ${rHeavy.launchVy.toFixed(1)}`);
  // goblin: 300 × (1 - 45000/150000) = 300 × 0.70 = 210
  assert.ok(Math.abs(rLight.launchVy - 210) < 0.5, `W1 goblin vy=210: ${rLight.launchVy.toFixed(1)}`);
  // swordman: 300 × (1 - 68000/150000) = 300 × 0.5467 = 164
  assert.ok(Math.abs(rHeavy.launchVy - 164) < 0.5, `W1 swordman vy=164: ${rHeavy.launchVy.toFixed(1)}`);
  console.log(`W1 OK: goblin(45000) vy=${rLight.launchVy.toFixed(1)} > swordman(68000) vy=${rHeavy.launchVy.toFixed(1)} — per-target weight flows`);
}

// W2: no-weight actor falls back to 68000 (not crash, not 0)
{
  const noWeight = makeActor("dummy", undefined);
  const r = applyHitReaction(noWeight, LIFT_FLAGS, 0, 0);
  assert.ok(Math.abs(r.launchVy - 164) < 0.5, `W2 fallback weight → vy=164: ${r.launchVy.toFixed(1)}`);
  console.log(`W2 OK: no-weight actor falls back to 68000 (vy=${r.launchVy.toFixed(1)})`);
}

// W3: regression guard — the OLD bug was a constant weightFactor for everyone.
// Assert two different weights yield two different launch velocities.
{
  const a = makeActor("a", 30000);
  const b = makeActor("b", 90000);
  const ra = applyHitReaction(a, LIFT_FLAGS, 0, 0);
  const rb = applyHitReaction(b, LIFT_FLAGS, 0, 0);
  assert.ok(ra.launchVy !== rb.launchVy, `W3 distinct weights → distinct vy: ${ra.launchVy} vs ${rb.launchVy}`);
  console.log(`W3 OK: weight 30000→vy ${ra.launchVy.toFixed(1)}, 90000→vy ${rb.launchVy.toFixed(1)} (constant-factor bug would make these equal)`);
}

console.log("\n✅ weight-launch (audit fix) all tests passed");
