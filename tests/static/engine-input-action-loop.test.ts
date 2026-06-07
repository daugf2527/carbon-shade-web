/**
 * engine-input-action-loop.test.ts — P3.0 Input→Action→Animation→Combat full chain.
 *
 * Proves the full intent→execution chain (what P1's tests bypassed with direct play()):
 *   InputSystem (reads actor.intent.attack)
 *     → ActionSystem (request → animationPlayer.play(attack anim))
 *       → AnimationSystem (advance frames → attackBoxes + ATTACK→IDLE on finish)
 *         → CombatResolutionSystem (hit → damage → reaction)
 *           → HitstunSystem (recover)
 *
 *   F1 player attacking via intent (not direct play) damages the goblin
 *   F2 the goblin eventually dies from repeated intent-driven attacks
 *   F3 the whole intent→execution chain is deterministic
 *   F4 facing follows intent.dir
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Actor, statsFromPlayerShard, statsFromMonsterShard } from "../../src/engine/core/Actor.js";
import type { AniDef } from "../../src/engine/core/AnimationPlayer.js";
import { EngineKernel } from "../../src/engine/kernel/EngineKernel.js";
import { ActionSystem } from "../../src/engine/kernel/systems/ActionSystem.js";
import { InputSystem } from "../../src/engine/kernel/systems/InputSystem.js";
import { AnimationSystem } from "../../src/engine/kernel/systems/AnimationSystem.js";
import { CombatResolutionSystem } from "../../src/engine/kernel/systems/CombatResolutionSystem.js";
import { HitstunSystem } from "../../src/engine/kernel/systems/HitstunSystem.js";
import { HitStopSystem } from "../../src/engine/kernel/systems/HitStopSystem.js";

const ROOT = process.cwd();
const swShard = JSON.parse(readFileSync(join(ROOT, "verification/baseline-shards/players/swordman.json"), "utf-8"));
const gobShard = JSON.parse(readFileSync(join(ROOT, "verification/baseline-shards/monsters/goblin.json"), "utf-8"));

const ATTACK: AniDef = {
  framesCount: 4,
  loop: false,
  frames: [
    { index: 0, delay: 1000 / 60, attackBoxes: [], damageBoxes: [] },
    {
      index: 1,
      delay: 1000 / 60,
      attackBoxes: [{ x1: 0, y1: 0, z1: -30, x2: 50, y2: 80, z2: 30 }],
      damageBoxes: [],
    },
    { index: 2, delay: 1000 / 60, attackBoxes: [], damageBoxes: [] },
    { index: 3, delay: 1000 / 60, attackBoxes: [], damageBoxes: [] },
  ],
};

function buildScene(seed = 42): { kernel: EngineKernel; sw: Actor; gob: Actor; actions: ActionSystem } {
  const kernel = new EngineKernel(seed);
  const sw = new Actor("sw", "player", statsFromPlayerShard(swShard.chr));
  const gob = new Actor("gob", "monster", statsFromMonsterShard(gobShard.mob));
  sw.x = 0;
  gob.x = 30;
  kernel.addActor(sw, true);
  kernel.addActor(gob, false);
  const actions = new ActionSystem();
  actions.define("attack", ATTACK);
  kernel.registerSystem(new InputSystem(actions));
  kernel.registerSystem(actions);
  kernel.registerSystem(new AnimationSystem());
  kernel.registerSystem(new CombatResolutionSystem());
  kernel.registerSystem(new HitstunSystem());
  kernel.registerSystem(new HitStopSystem());
  return { kernel, sw, gob, actions };
}

/** Drive the player's attack intent: press attack on a fixed cadence (every 8 ticks). */
function driveAttack(sw: Actor, tick: number): void {
  sw.intent = { attack: tick % 8 === 0, dir: 0 };
}

// ── F1: intent-driven attack damages goblin ──
{
  const { kernel, sw, gob } = buildScene(42);
  const startHp = gob.hp;
  for (let i = 0; i < 40; i++) {
    driveAttack(sw, i);
    kernel.tick();
  }
  assert.ok(gob.hp < startHp, `goblin should take damage from intent-driven attacks, hp ${gob.hp} < ${startHp}`);
  console.log(`F1 OK: intent→action→combat damaged goblin (hp ${startHp}→${gob.hp})`);
}

// ── F2: repeated intent-driven attacks kill goblin ──
{
  const { kernel, sw, gob } = buildScene(42);
  let i = 0;
  for (; i < 2000 && !gob.isDead; i++) {
    driveAttack(sw, i);
    kernel.tick();
  }
  assert.ok(gob.isDead, `goblin should die from intent-driven attacks, hp=${gob.hp}`);
  console.log(`F2 OK: goblin killed via intent chain in ${i} ticks`);
}

// ── F3: intent→execution chain deterministic ──
{
  const run = (seed: number): string[] => {
    const { kernel, sw, gob } = buildScene(seed);
    const hashes: string[] = [];
    for (let i = 0; i < 300 && !gob.isDead; i++) {
      driveAttack(sw, i);
      kernel.tick();
      hashes.push(kernel.lastStateHash);
    }
    return hashes;
  };
  const h1 = run(42);
  const h2 = run(42);
  assert.equal(h1.length, h2.length, `hash count ${h1.length} vs ${h2.length}`);
  for (let i = 0; i < h1.length; i++) {
    assert.equal(h1[i], h2[i], `hash mismatch at frame ${i}`);
  }
  console.log(`F3 OK: ${h1.length}-frame intent→execution chain deterministic`);
}

// ── F4: facing follows intent.dir ──
{
  const { kernel, sw } = buildScene(7);
  sw.intent = { attack: false, dir: -1 };
  kernel.tick();
  assert.equal(sw.facing, -1, "facing flips left on intent.dir=-1");
  sw.intent = { attack: false, dir: 1 };
  kernel.tick();
  assert.equal(sw.facing, 1, "facing flips right on intent.dir=1");
  console.log("F4 OK: facing follows intent.dir");
}

console.log("\n✅ P3.0 engine input-action-loop test passed");
