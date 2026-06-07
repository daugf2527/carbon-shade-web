/**
 * engine-movement.test.ts — MovementSystem deterministic test (Stage 4A)
 *
 * Verifies: intent.dir drives actor.x via stats.moveSpeed, only in mobile states.
 */
import { assert } from "./test-utils.js";
import { Actor } from "../../src/engine/core/Actor.js";
import type { AniDef } from "../../src/engine/core/AnimationPlayer.js";
import { EngineKernel } from "../../src/engine/kernel/EngineKernel.js";
import { MovementSystem } from "../../src/engine/kernel/systems/MovementSystem.js";
import { InputSystem } from "../../src/engine/kernel/systems/InputSystem.js";
import { ActionSystem } from "../../src/engine/kernel/systems/ActionSystem.js";
import { AnimationSystem } from "../../src/engine/kernel/systems/AnimationSystem.js";
import { DNF_PHYSICS_CONSTANTS } from "../../src/data/official/dnfPhysicsConstants.js";

const { xNormalMoveVelocity, yNormalMoveVelocity, speedValueDefault } = DNF_PHYSICS_CONSTANTS;
const MOVE_SPEED = 850; // PVF swordman chr.moveSpeed
const X_VEL = xNormalMoveVelocity * MOVE_SPEED / speedValueDefault; // 121.55 px/s
const Z_VEL = yNormalMoveVelocity * MOVE_SPEED / speedValueDefault; // 96.9 px/s

const ATTACK_ANIM: AniDef = {
  framesCount: 4,
  loop: false,
  frames: Array.from({ length: 4 }, (_, i) => ({
    index: i, delay: 1000 / 60, attackBoxes: [], damageBoxes: [],
  })),
};

function makeKernel(): { kernel: EngineKernel; actions: ActionSystem } {
  const k = new EngineKernel(42);
  const actions = new ActionSystem();
  actions.define("attack1", ATTACK_ANIM);
  k.registerSystem(new InputSystem(actions, "attack1"));
  k.registerSystem(new MovementSystem());
  k.registerSystem(actions);
  k.registerSystem(new AnimationSystem());

  const player = new Actor("player", "player", {
    hpMax: 180, mpMax: 140, moveSpeed: MOVE_SPEED,
    physicalAttack: 45, physicalDefense: 7.5,
  });
  k.addActor(player, true);
  return { kernel: k, actions };
}

// M1: basic movement — intent.dir=1 → x increases by moveSpeed * dt per tick
{
  const { kernel: k } = makeKernel();
  const p = k.player;
  p.x = 100;
  p.intent = { attack: false, dir: 1 };
  k.tick();
  const expected = 100 + X_VEL * (1 / 60);
  assert.ok(
    Math.abs(p.x - expected) < 0.01,
    `M1 move right: expected x≈${expected.toFixed(2)}, got ${p.x.toFixed(2)}`,
  );
  console.log(`M1 OK: move right x=${p.x.toFixed(2)} (expected ${expected.toFixed(2)})`);
}

// M2: move left — intent.dir=-1 → x decreases
{
  const { kernel: k } = makeKernel();
  const p = k.player;
  p.x = 200;
  p.intent = { attack: false, dir: -1 };
  k.tick();
  const expected = 200 - X_VEL * (1 / 60);
  assert.ok(
    Math.abs(p.x - expected) < 0.01,
    `M2 move left: expected x≈${expected.toFixed(2)}, got ${p.x.toFixed(2)}`,
  );
  console.log(`M2 OK: move left x=${p.x.toFixed(2)}`);
}

// M3: no intent → no movement
{
  const { kernel: k } = makeKernel();
  const p = k.player;
  p.x = 100;
  p.intent = { attack: false, dir: 0 };
  k.tick();
  assert.equal(p.x, 100, "M3 no intent → x unchanged");
  console.log("M3 OK: no intent, x unchanged");
}

// M4: attack suppresses movement (FSM in ATTACK state)
{
  const { kernel: k } = makeKernel();
  const p = k.player;
  p.x = 100;
  // Tick 1: press attack → InputSystem requests attack1, MovementSystem moves (FSM still IDLE),
  // ActionSystem plays animation → FSM transitions to ATTACK at end of tick
  p.intent = { attack: true, dir: 1 };
  k.tick();
  const xAfterFirstTick = p.x; // 105 — moved before attack started
  // Tick 2: FSM now ATTACK → MovementSystem should skip
  p.intent = { attack: false, dir: 1 };
  k.tick();
  assert.equal(p.x, xAfterFirstTick, `M4 attack suppresses: x should stay ${xAfterFirstTick}, got ${p.x}`);
  console.log(`M4 OK: attack suppresses movement (x frozen at ${p.x.toFixed(2)} during ATTACK)`);
}

// M5: 10-tick walk → x = start + 10 * moveSpeed/60
{
  const { kernel: k } = makeKernel();
  const p = k.player;
  p.x = 0;
  p.intent = { attack: false, dir: 1 };
  for (let i = 0; i < 10; i++) k.tick();
  const expected = 10 * X_VEL / 60;
  assert.ok(
    Math.abs(p.x - expected) < 0.1,
    `M5 10-tick walk: expected x≈${expected.toFixed(1)}, got ${p.x.toFixed(1)}`,
  );
  console.log(`M5 OK: 10-tick walk x=${p.x.toFixed(1)} (expected ${expected.toFixed(1)})`);
}

// M6: movement deterministic — same setup → same x
{
  function runWalk(): number {
    const { kernel: k } = makeKernel();
    const p = k.player;
    p.x = 0;
    p.intent = { attack: false, dir: 1 };
    for (let i = 0; i < 30; i++) k.tick();
    return p.x;
  }
  const x1 = runWalk();
  const x2 = runWalk();
  assert.equal(x1, x2, `M6 determinism: run1 x=${x1} !== run2 x=${x2}`);
  console.log(`M6 OK: 30-tick walk deterministic (x=${x1.toFixed(2)})`);
}

// M7: dead actor doesn't move
{
  const { kernel: k } = makeKernel();
  const p = k.player;
  p.x = 100;
  p.hp = 0;
  p.intent = { attack: false, dir: 1 };
  k.tick();
  assert.equal(p.x, 100, "M7 dead actor should not move");
  console.log("M7 OK: dead actor x unchanged");
}

// M8: Z-axis depth movement — zDir=1 → z increases at PVF yNormalMoveVelocity rate
{
  const { kernel: k } = makeKernel();
  const p = k.player;
  p.z = 0;
  p.intent = { attack: false, dir: 0, zDir: 1 };
  k.tick();
  const expected = Z_VEL / 60;
  assert.ok(
    Math.abs(p.z - expected) < 0.01,
    `M8 z-move: expected z≈${expected.toFixed(2)}, got ${p.z.toFixed(2)}`,
  );
  console.log(`M8 OK: z-axis move z=${p.z.toFixed(2)} (expected ${expected.toFixed(2)})`);
}

// M9: simultaneous X + Z movement (diagonal walk)
{
  const { kernel: k } = makeKernel();
  const p = k.player;
  p.x = 0; p.z = 0;
  p.intent = { attack: false, dir: 1, zDir: -1 };
  for (let i = 0; i < 10; i++) k.tick();
  const expectedX = 10 * X_VEL / 60;
  const expectedZ = -(10 * Z_VEL / 60);
  assert.ok(Math.abs(p.x - expectedX) < 0.1, `M9 diagonal x: ${p.x.toFixed(1)} vs ${expectedX.toFixed(1)}`);
  assert.ok(Math.abs(p.z - expectedZ) < 0.1, `M9 diagonal z: ${p.z.toFixed(1)} vs ${expectedZ.toFixed(1)}`);
  console.log(`M9 OK: diagonal walk x=${p.x.toFixed(1)} z=${p.z.toFixed(1)}`);
}

// M10: dash — double-tap right within window → run speed (1.6x)
{
  const { kernel: k } = makeKernel();
  const p = k.player;
  p.x = 0;
  // First tap right
  p.intent = { attack: false, dir: 1 };
  k.tick(); // tick 1: rising edge, records tap
  p.intent = { attack: false, dir: 0 };
  k.tick(); // tick 2: release
  // Second tap right within window
  p.intent = { attack: false, dir: 1 };
  k.tick(); // tick 3: rising edge again, same dir → dash!
  // Now in dash mode, run 5 more ticks
  const xBeforeDash = p.x;
  for (let i = 0; i < 5; i++) k.tick();
  const dashDistance = p.x - xBeforeDash;
  const walkDistance = 5 * X_VEL / 60;
  assert.ok(dashDistance > walkDistance * 1.4, `M10 dash faster: ${dashDistance.toFixed(1)} > ${(walkDistance * 1.4).toFixed(1)}`);
  assert.equal(p.locomotion, "run", "M10 locomotion = run");
  console.log(`M10 OK: dash speed ${dashDistance.toFixed(1)}px/5ticks vs walk ${walkDistance.toFixed(1)} (1.6x)`);
}

// M11: single tap → walk, not dash
{
  const { kernel: k } = makeKernel();
  const p = k.player;
  p.x = 0;
  p.intent = { attack: false, dir: 1 };
  for (let i = 0; i < 5; i++) k.tick();
  assert.equal(p.locomotion, "walk", "M11 locomotion = walk (single tap)");
  const expectedX = 5 * X_VEL / 60;
  assert.ok(Math.abs(p.x - expectedX) < 0.5, "M11 walk speed");
  console.log(`M11 OK: single tap = walk (x=${p.x.toFixed(1)})`);
}

// M12: release direction → dash stops
{
  const { kernel: k } = makeKernel();
  const p = k.player;
  p.x = 0;
  // Trigger dash
  p.intent = { attack: false, dir: 1 }; k.tick();
  p.intent = { attack: false, dir: 0 }; k.tick();
  p.intent = { attack: false, dir: 1 }; k.tick(); // dash activated
  assert.equal(p.locomotion, "run", "M12 running");
  // Release
  p.intent = { attack: false, dir: 0 }; k.tick();
  assert.equal(p.locomotion, "idle", "M12 stopped → idle");
  console.log("M12 OK: release direction stops dash");
}

console.log("\n✅ MovementSystem (Stage 4A) all tests passed");
