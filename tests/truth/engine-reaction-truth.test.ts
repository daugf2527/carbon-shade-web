/**
 * engine-reaction-truth.test.ts — Truth guard for engine ReactionResolver (Wave 2, 2026-06-05).
 *
 * Fills the "0 truth tests guarding src/engine reaction" gap. Before this, the only
 * reaction truth tests targeted src/combat/; the engine ReactionResolver was an
 * un-truth-tested stub. These assertions pin that the engine resolver:
 *   ① hit_lift_up → airborne kind + airborne.vy > 0 (vertical launch actually applied)
 *   ② hit_down + causesDown → "down" kind (knockdown)
 *   ③ hit_horizon → "stagger" kind
 *   ④ different PVF liftUp values produce DIFFERENT vy (proves the truth value entered
 *      the formula and vy is not a constant)
 *
 * vy = liftUp directly (Tier-1: lift_up is px/s, slot0.launch=0 → fallback to lift_up; chr.weight is
 * audio-only, NO weightFactor). attack3 liftUp=300 → vy=300 → peak 30px; weaponcomboshort3
 * liftUp=400 → vy=400. See ReactionResolver.ts computeLaunchVy + air-physics Phase 1.
 *
 * Determinism: pure synchronous calls, no Math.random, no timers.
 */

import { assert } from "../static/test-utils.js";
import { Actor, type ActorStats } from "../../src/engine/core/Actor.js";
import { applyHitReaction, type AtkFlags } from "../../src/engine/core/ReactionResolver.js";

// Minimal stats so the defender survives the hit (hpMax high, damage small).
const STATS: ActorStats = {
  hpMax: 10000,
  mpMax: 0,
  moveSpeed: 300,
  physicalAttack: 10,
  physicalDefense: 5,
};

function freshDefender(): Actor {
  return new Actor("def", "monster", STATS);
}

// ── Test ①: hit_lift_up → airborne kind + airborne.vy > 0 ─────────────────────────
{
  const def = freshDefender();
  // attack3 truth: hitReaction=hit_lift_up, liftUp=300, causesDown=true, slot0 launch=0.
  const flags: AtkFlags = {
    hitReaction: "hit_lift_up",
    liftUpValue: 300,
    causesDown: true,
    attackLevel: 2,
    weaponLaunch: 0, // slot0
  };
  const r = applyHitReaction(def, flags, 50, 0);

  assert.equal(r.kind, "airborne", `hit_lift_up should route to airborne, got ${r.kind}`);
  assert.ok(r.launchVy > 0, `launch should produce positive vy, got ${r.launchVy}`);
  assert.ok(def.airborne !== null, "defender.airborne should be set inside the resolver");
  assert.ok(def.airborne!.vy > 0, `airborne.vy should be > 0, got ${def.airborne!.vy}`);
  // vy = liftUp(300) directly (Tier-1: weight audio-only, slot0 launch=0 → fallback to lift_up).
  assert.ok(
    Math.abs(def.airborne!.vy - 300) < 1e-9,
    `airborne.vy should equal liftUp=300, got ${def.airborne!.vy}`,
  );
  console.log(`✓ ① hit_lift_up → airborne, vy=${def.airborne!.vy}`);
}

// ── Test ②: hit_down + causesDown → "down" kind ────────────────────────────────────
{
  const def = freshDefender();
  // jumpattack truth: hitReaction=hit_down, causesDown=true.
  const flags: AtkFlags = {
    hitReaction: "hit_down",
    liftUpValue: 180,
    causesDown: true,
    attackLevel: 1,
    weaponLaunch: 0,
  };
  const r = applyHitReaction(def, flags, 50, 0);

  assert.equal(r.kind, "down", `hit_down + causesDown should route to down, got ${r.kind}`);
  assert.ok(def.airborne === null, "hit_down should NOT launch airborne");
  // FSM should be in DOWN (knockedDown path).
  assert.equal(def.fsm.state, "DOWN", `defender FSM should be DOWN, got ${def.fsm.state}`);
  console.log(`✓ ② hit_down+causesDown → down (FSM=${def.fsm.state})`);
}

// ── Test ②b: hit_down + causesDown=false → plain "hit" (engine has no knockback state) ──
{
  const def = freshDefender();
  // attack1 truth: hitReaction=hit_down, causesDown=false.
  const flags: AtkFlags = {
    hitReaction: "hit_down",
    liftUpValue: 75,
    causesDown: false,
    attackLevel: 1,
    weaponLaunch: 0,
  };
  const r = applyHitReaction(def, flags, 50, 0);

  assert.equal(r.kind, "hit", `hit_down + causesDown=false folds to hit (no engine knockback), got ${r.kind}`);
  assert.equal(def.fsm.state, "HIT", `defender FSM should be HIT, got ${def.fsm.state}`);
  console.log(`✓ ②b hit_down(causesDown=false) → hit`);
}

// ── Test ③: hit_horizon → "stagger" kind ────────────────────────────────────────────
{
  const def = freshDefender();
  // dashattack / attack2 truth: hitReaction=hit_horizon.
  const flags: AtkFlags = {
    hitReaction: "hit_horizon",
    liftUpValue: 80,
    causesDown: false,
    attackLevel: 2,
    weaponLaunch: 0,
  };
  const r = applyHitReaction(def, flags, 50, 0);

  assert.equal(r.kind, "stagger", `hit_horizon should route to stagger, got ${r.kind}`);
  assert.ok(def.airborne === null, "stagger should not launch airborne");
  // stagger folds to HIT in the 9-state FSM (no stagger state).
  assert.equal(def.fsm.state, "HIT", `stagger should enter FSM HIT, got ${def.fsm.state}`);
  console.log(`✓ ③ hit_horizon → stagger (FSM=${def.fsm.state})`);
}

// ── Test ④: different PVF liftUp values produce DIFFERENT vy (truth entered formula) ──
{
  // attack3 liftUp=300 vs weaponcomboshort3 liftUp=400 — both hit_lift_up, slot0.
  const defA = freshDefender();
  const rA = applyHitReaction(
    defA,
    { hitReaction: "hit_lift_up", liftUpValue: 300, causesDown: true, weaponLaunch: 0 },
    50,
    0,
  );

  const defB = freshDefender();
  const rB = applyHitReaction(
    defB,
    { hitReaction: "hit_lift_up", liftUpValue: 400, causesDown: true, weaponLaunch: 0 },
    50,
    0,
  );

  assert.ok(rA.launchVy > 0 && rB.launchVy > 0, "both launches should be positive");
  assert.ok(
    rA.launchVy !== rB.launchVy,
    `different liftUp must yield different vy (proves non-constant): 300→${rA.launchVy}, 400→${rB.launchVy}`,
  );
  // Concretely: 400-truth vy should exceed 300-truth vy.
  assert.ok(rB.launchVy > rA.launchVy, `liftUp=400 should launch higher than liftUp=300`);
  assert.ok(Math.abs(rA.launchVy - 300) < 1e-9, `liftUp 300 → vy 300 (direct)`);
  assert.ok(Math.abs(rB.launchVy - 400) < 1e-9, `liftUp 400 → vy 400 (direct)`);
  console.log(`✓ ④ truth in formula: liftUp 300→vy ${rA.launchVy}, 400→vy ${rB.launchVy}`);
}

// ── Test ④b: weaponLaunch coefficient actually multiplies (non-zero slot path) ───────
{
  // When weaponLaunch is non-zero AND positive, the main formula (liftUp × launch × wf)
  // drives vy instead of the fallback — proves weaponLaunch truth also feeds the formula.
  const def = freshDefender();
  const r = applyHitReaction(
    def,
    { hitReaction: "hit_lift_up", liftUpValue: 300, causesDown: true, weaponLaunch: 0.5 },
    50,
    0,
  );
  const expected = 300 * 0.5; // main formula liftUp × weaponLaunch (no weightFactor, weight audio-only)
  assert.ok(
    Math.abs(r.launchVy - expected) < 1e-9,
    `non-zero weaponLaunch should use main formula 300×0.5=${expected}, got ${r.launchVy}`,
  );
  console.log(`✓ ④b weaponLaunch feeds main formula: vy=${r.launchVy}`);
}

// ── Test ⑤: backward-compat legacy bool path still works ─────────────────────────────
{
  const def = freshDefender();
  // Old stub caller passes { liftUp: true } with no hitReaction.
  const r = applyHitReaction(def, { liftUp: true }, 50, 0);
  assert.equal(r.kind, "airborne", `legacy liftUp:true should still route airborne, got ${r.kind}`);
  // No liftUpValue/weaponLaunch → vy=0 (legacy path can't compute truth), airborne not set.
  assert.equal(r.launchVy, 0, `legacy bool path without truth values yields vy=0, got ${r.launchVy}`);
  console.log(`✓ ⑤ legacy bool path → airborne kind (vy=0, no truth values)`);
}

console.log("\n✅ All engine reaction truth tests passed");
