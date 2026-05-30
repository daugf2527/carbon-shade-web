/**
 * T4.1 InputCommand + T4.2 SkillResource + T4.4 StatusEffect
 * T4.5 ComboCorrection + T4.6 AirbornePhysics static tests
 */
import { assert } from "./test-utils.js";
import { CommandDetector, cleanSOCD } from "../../src/engine/input/InputCommand.js";
import { SkillResource, parseSkillDef } from "../../src/engine/core/SkillResource.js";
import { StatusEffectSystem } from "../../src/engine/core/StatusEffectSystem.js";
import { applyComboCorrection } from "../../src/engine/core/ComboCorrection.js";
import { launchAirborne, tickAirborne } from "../../src/engine/core/AirbornePhysicsSystem.js";

// T4.1 — SOCD + CommandDetector
assert.equal(cleanSOCD(true, true, false, false), "none", "SOCD left+right → none");
assert.equal(cleanSOCD(false, false, true, true), "up", "SOCD up+down → up");

{
  const det = new CommandDetector();
  det.registerSkill("icewave", ["(right)", ",", "(down)", ",", "(right)", ",", "(skill)"]);
  assert.equal(det.feed("(right)", 0), null);
  assert.equal(det.feed("(down)", 100), null);
  assert.equal(det.feed("(right)", 200), null);
  const match = det.feed("(skill)", 300);
  assert.ok(match !== null, "icewave should match");
  assert.equal(match!.skillId, "icewave");
  console.log("T4.1 InputCommand: SOCD + icewave command OK");
}

// T4.2 — SkillResource
{
  const raw = { coolTime: { dungeonMs: 7000 }, consumeMp: { baseMp: 27 }, castingTime: { baseMs: 300 } };
  const def = parseSkillDef("icewave", raw as Record<string, unknown>);
  assert.equal(def.cooldownMs, 7000);
  assert.equal(def.mpCost, 27);

  const res = new SkillResource();
  assert.ok(res.canUse(def, 0, 100), "can use initially");
  res.use(def, 0);
  assert.ok(!res.canUse(def, 100, 100), "on cooldown");
  assert.ok(res.canUse(def, 7000, 100), "cooldown expired");
  assert.ok(!res.canUse(def, 7000, 10), "not enough MP");
  console.log("T4.2 SkillResource: cooldown + MP OK");
}

// T4.4 — StatusEffectSystem
{
  const sys = new StatusEffectSystem();
  sys.apply({ kind: "poison", durationMs: 3000, value: 100, appliedAtMs: 0 });
  sys.apply({ kind: "slow", durationMs: 2000, value: 0.5, appliedAtMs: 0 });
  sys.apply({ kind: "freeze", durationMs: 1000, value: 0, appliedAtMs: 0 });

  const r = sys.tick(500, 1000);
  assert.ok(r.poisonDmg > 0, "poison ticking");
  assert.equal(r.speedMult, 0.5, "slow active");
  assert.ok(r.frozen, "freeze active");

  const r2 = sys.tick(1500, 1000);
  assert.ok(!r2.frozen, "freeze expired");
  console.log(`T4.4 StatusEffect: poison=${r.poisonDmg} slow=${r.speedMult} freeze=${r.frozen} OK`);
}

// T4.5 — ComboCorrection
{
  const corrected = applyComboCorrection({ x: 0, z: 0 }, { x: 200, z: 0 }, 1);
  assert.ok(corrected.x < 200, "far target snapped closer");
  const close = applyComboCorrection({ x: 0, z: 0 }, { x: 30, z: 0 }, 1);
  assert.equal(close.x, 30, "close target no snap");
  console.log(`T4.5 ComboCorrection: snap x=${corrected.x.toFixed(1)}, no-snap OK`);
}

// T4.6 — AirbornePhysics
{
  const state = launchAirborne(600);
  let landed = false;
  let ticks = 0;
  while (!landed && ticks < 200) {
    landed = tickAirborne(state, 16.67);
    ticks++;
  }
  assert.ok(landed, "should land");
  assert.equal(state.y, 0, "y=0 on landing");
  assert.ok(ticks > 10, "airborne for multiple ticks");
  console.log(`T4.6 AirbornePhysics: landed after ${ticks} ticks OK`);
}
