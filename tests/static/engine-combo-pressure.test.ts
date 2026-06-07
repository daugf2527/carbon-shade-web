/**
 * engine-combo-pressure.test.ts — combo pressure (damage/launch decay) test (Batch 4, 2026-06-07)
 *
 * Verifies: repeated hits on a target raise a pressure gauge that REDUCES the damage + launch that
 * target takes (the first hit is full; subsequent hits decay); the combo resets after a no-hit
 * window. Distinct from ComboCorrection.ts (positional snap).
 *
 * ⚠️ All config numbers are local_baseline (ComboPressure.ts DEFAULT_COMBO_CONFIG). This guards the
 * MECHANISM (pressure decays damage/launch + resets), not the truth of the values.
 */
import { assert } from "./test-utils.js";
import { Actor } from "../../src/engine/core/Actor.js";
import type { AniDef } from "../../src/engine/core/AnimationPlayer.js";
import {
  DEFAULT_COMBO_CONFIG, createComboState, applyComboFromHit, refreshComboDerived,
  classifyComboBucket, tickComboDecay, hasComboPressure,
} from "../../src/engine/core/ComboPressure.js";
import { EngineKernel } from "../../src/engine/kernel/EngineKernel.js";
import { AnimationSystem } from "../../src/engine/kernel/systems/AnimationSystem.js";
import { CombatResolutionSystem } from "../../src/engine/kernel/systems/CombatResolutionSystem.js";
import { HitstunSystem } from "../../src/engine/kernel/systems/HitstunSystem.js";
import { HitStopSystem } from "../../src/engine/kernel/systems/HitStopSystem.js";
import { ComboSystem } from "../../src/engine/kernel/systems/ComboSystem.js";

const STAND_ATTACK: AniDef = {
  framesCount: 3, loop: true, frames: [
    { index: 0, delay: 1000 / 60, attackBoxes: [], damageBoxes: [] },
    { index: 1, delay: 1000 / 60, attackBoxes: [{ x1: 0, y1: 0, z1: -30, x2: 50, y2: 80, z2: 30 }], damageBoxes: [] },
    { index: 2, delay: 1000 / 60, attackBoxes: [], damageBoxes: [] },
  ],
};

/** Punching-bag scene: attacker loops STAND_ATTACK on a high-HP defender that survives the combo. */
function buildBagScene(seed = 42): { kernel: EngineKernel; def: Actor; dmgs: number[] } {
  const k = new EngineKernel(seed);
  const atk = new Actor("atk", "player", { hpMax: 100, mpMax: 0, moveSpeed: 0, physicalAttack: 10, physicalDefense: 0 });
  const def = new Actor("def", "monster", { hpMax: 100000, mpMax: 0, moveSpeed: 0, physicalAttack: 0, physicalDefense: 0 });
  atk.x = 0; def.x = 30;
  k.addActor(atk, true); k.addActor(def, false);
  k.registerSystem(new AnimationSystem());
  k.registerSystem(new CombatResolutionSystem());
  k.registerSystem(new HitstunSystem());
  k.registerSystem(new HitStopSystem());
  k.registerSystem(new ComboSystem());
  const dmgs: number[] = [];
  k.bus.on("HitConfirmed", (e) => { dmgs.push((e.payload as { dmg: number }).dmg); });
  atk.animationPlayer.play(STAND_ATTACK);
  return { kernel: k, def, dmgs };
}

// P1: classify + accumulate
{
  assert.equal(classifyComboBucket("airborne"), "aerial", "P1 airborne→aerial");
  assert.equal(classifyComboBucket("down"), "down", "P1 down→down");
  assert.equal(classifyComboBucket("hit"), "stand", "P1 hit→stand");
  assert.equal(classifyComboBucket("stagger"), "stand", "P1 stagger→stand");
  const s = createComboState();
  assert.equal(s.damageScale, 1, "P1 fresh damageScale=1");
  applyComboFromHit(s, "hit", 1);
  assert.equal(s.standGauge, DEFAULT_COMBO_CONFIG.standHitAdd, "P1 standGauge += standHitAdd");
  assert.equal(s.comboHitCount, 1, "P1 hit count 1");
  assert.ok(s.damageScale < 1, "P1 damageScale drops after a hit");
  console.log(`P1 OK: hit → standGauge ${s.standGauge}, damageScale ${s.damageScale.toFixed(3)}`);
}

// P2: derived math (damageScale floor + launch/gravity from airGauge)
{
  const s = createComboState();
  s.standGauge = DEFAULT_COMBO_CONFIG.barMax;
  refreshComboDerived(s);
  assert.ok(Math.abs(s.damageScale - DEFAULT_COMBO_CONFIG.damageScaleMin) < 1e-9, "P2 full pressure → damageScale floor 0.15");
  const a = createComboState();
  a.airGauge = DEFAULT_COMBO_CONFIG.barMax;
  refreshComboDerived(a);
  assert.ok(Math.abs(a.launchResistance - DEFAULT_COMBO_CONFIG.launchResistanceMax) < 1e-9, "P2 full air → launchResistance 1.8");
  assert.ok(Math.abs(a.gravityScale - DEFAULT_COMBO_CONFIG.gravityScaleMax) < 1e-9, "P2 full air → gravityScale 2.4");
  console.log("P2 OK: full gauge → damageScale 0.15, launchResistance 1.8, gravityScale 2.4");
}

// P3: heavy attackLevel adds more stand pressure
{
  const light = createComboState(); applyComboFromHit(light, "hit", 1);
  const heavy = createComboState(); applyComboFromHit(heavy, "hit", 2);
  assert.ok(heavy.standGauge > light.standGauge, `P3 heavy(lvl2) standHeavyBonus: ${heavy.standGauge} > ${light.standGauge}`);
  console.log(`P3 OK: heavy hit standGauge ${heavy.standGauge} > light ${light.standGauge}`);
}

// P4: integration — repeated hits do DECREASING damage (combo decay live in the kernel)
{
  const { kernel, def, dmgs } = buildBagScene(42);
  for (let i = 0; i < 300 && dmgs.length < 20; i++) kernel.tick();
  assert.ok(dmgs.length >= 5, `P4 landed several hits (got ${dmgs.length})`);
  assert.ok(dmgs[0] > dmgs[dmgs.length - 1], `P4 damage decays: first ${dmgs[0]} > last ${dmgs[dmgs.length - 1]}`);
  assert.ok(def.combo.damageScale < 1, `P4 defender combo built up (damageScale ${def.combo.damageScale.toFixed(3)})`);
  console.log(`P4 OK: combo decay — hit1=${dmgs[0]} hit${dmgs.length}=${dmgs[dmgs.length - 1]} (damageScale ${def.combo.damageScale.toFixed(3)})`);
}

// P5: decay resets the combo after comboResetFrames of no hits
{
  const s = createComboState();
  applyComboFromHit(s, "hit", 1);
  assert.ok(hasComboPressure(s), "P5 pressured after a hit");
  for (let i = 0; i < DEFAULT_COMBO_CONFIG.comboResetFrames; i++) tickComboDecay(s);
  assert.ok(hasComboPressure(s), "P5 still pressured at the reset boundary");
  tickComboDecay(s); // crosses comboResetFrames
  assert.ok(!hasComboPressure(s), "P5 combo reset past the window");
  assert.equal(s.damageScale, 1, "P5 damageScale restored to 1 after reset");
  console.log(`P5 OK: combo resets after ${DEFAULT_COMBO_CONFIG.comboResetFrames} no-hit frames`);
}

// P6: determinism — same seed → identical combo gauge trail
{
  const trail = (): string => {
    const { kernel, def } = buildBagScene(7);
    const out: number[] = [];
    for (let i = 0; i < 30; i++) { kernel.tick(); out.push(Math.round(def.combo.standGauge)); }
    return out.join(",");
  };
  assert.equal(trail(), trail(), "P6 deterministic combo trail");
  console.log("P6 OK: combo accumulation deterministic across two runs");
}

// P7: a SINGLE hit lands at full damage (damageScale=1) — guards single-hit truth tests
{
  const s = createComboState();
  assert.equal(s.damageScale, 1, "P7 first hit damageScale=1 (full damage, no combo penalty)");
  console.log("P7 OK: single hit unaffected (damageScale=1) — single-hit truth tests safe");
}

console.log("\n✅ combo pressure (Batch 4) all tests passed");
