/**
 * engine-weight-launch.test.ts — weight does NOT drive launch (Tier-1 truth fix, Batch 6 2026-06-07)
 *
 * REVERSES the earlier weightFactor fix (commit ba3601d). PVF /sqr/dnf_enum_header.nut (Korean
 * comments, dnf-extract first-evidence) proves chr.weight is an AUDIO classification key — its sole
 * .nut reference is sq_GetObjectWeight() for sound selection; it is NOT read by the velocity loop.
 * So launch velocity = lift_up directly (px/s, Tier-1), INDEPENDENT of target weight. This test now
 * guards that two targets of different weight launch IDENTICALLY (the old weightFactor is overturned).
 *
 * Tier-1 evidence: docs/research/2026-05-21-dnf-air-physics-phase1.md (weight audio-only; lift_up →
 * sq_SetCurrentAttacknUpForce px/s; attack3 liftUp=300 → peak 30px).
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
  weaponLaunch: 0, // slot0 → fallback to lift_up directly (300)
};

// W1: weight does NOT change launch — light & heavy targets launch IDENTICALLY (vy = liftUp = 300)
{
  const light = makeActor("goblin", 45000);
  const heavy = makeActor("swordman", 68000);
  const rLight = applyHitReaction(light, LIFT_FLAGS, 0, 0);
  const rHeavy = applyHitReaction(heavy, LIFT_FLAGS, 0, 0);
  assert.equal(rLight.launchVy, rHeavy.launchVy, `W1 weight must NOT change vy: ${rLight.launchVy} vs ${rHeavy.launchVy}`);
  assert.ok(Math.abs(rLight.launchVy - 300) < 1e-9, `W1 vy = liftUp = 300 (direct, Tier-1), got ${rLight.launchVy}`);
  console.log(`W1 OK: goblin(45000) & swordman(68000) both vy=${rLight.launchVy} — weight is audio-only, not physics`);
}

// W2: no-weight actor launches the same (vy = liftUp) — no fallback weight needed anymore
{
  const noWeight = makeActor("dummy", undefined);
  const r = applyHitReaction(noWeight, LIFT_FLAGS, 0, 0);
  assert.ok(Math.abs(r.launchVy - 300) < 1e-9, `W2 no-weight vy = liftUp = 300, got ${r.launchVy}`);
  console.log(`W2 OK: no-weight actor vy=${r.launchVy} (weight irrelevant to launch)`);
}

// W3: launch height matches Tier-1 truth — peak = vy²/(2·gravity) = 300²/(2·1500) = 30px
{
  const t = makeActor("t", 45000);
  const r = applyHitReaction(t, LIFT_FLAGS, 0, 0);
  const GRAVITY = 1500; // DNF defaultGravityAccel (Tier-1)
  const peak = (r.launchVy * r.launchVy) / (2 * GRAVITY);
  assert.ok(Math.abs(peak - 30) < 0.5, `W3 attack3 peak ≈ 30px (Tier-1), got ${peak.toFixed(1)}`);
  console.log(`W3 OK: attack3 (liftUp=300) → vy=${r.launchVy} → peak=${peak.toFixed(1)}px (Tier-1; was 14px under weightFactor)`);
}

// W4: lift_up scales vy directly (different liftUp → proportional vy, weight-independent)
{
  const t1 = makeActor("t1", 45000);
  const t2 = makeActor("t2", 99000); // heavier — must NOT reduce vy
  const r1 = applyHitReaction(t1, { hitReaction: "hit_lift_up", liftUpValue: 200, weaponLaunch: 0 }, 0, 0);
  const r2 = applyHitReaction(t2, { hitReaction: "hit_lift_up", liftUpValue: 400, weaponLaunch: 0 }, 0, 0);
  assert.ok(Math.abs(r1.launchVy - 200) < 1e-9, `W4 liftUp 200 → vy 200, got ${r1.launchVy}`);
  assert.ok(Math.abs(r2.launchVy - 400) < 1e-9, `W4 liftUp 400 → vy 400 (heavier target, still 400), got ${r2.launchVy}`);
  console.log(`W4 OK: liftUp 200→vy 200, liftUp 400→vy 400 — vy=liftUp regardless of weight`);
}

console.log("\n✅ weight-launch (Tier-1 truth: weight NOT in launch physics) all tests passed");
