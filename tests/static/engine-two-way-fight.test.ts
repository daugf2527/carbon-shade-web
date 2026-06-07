/**
 * engine-two-way-fight.test.ts — P3.0 bidirectional combat (player ↔ goblin).
 *
 * Proves the complete two-way fight: player attacks goblin + goblin attacks player,
 * both through the shared ActionSystem bridge. This is the closest thing to a real
 * combat scene in engine's native kernel before P3.1 wires CombatScene.
 *
 *   G1 Player kills goblin via intent (Input→Action→Combat chain)
 *   G2 Goblin damages player back (AI→Action→Combat chain)
 *   G3 Full two-way fight deterministic (player+victory or mutual kill replay)
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Actor, statsFromPlayerShard, statsFromMonsterShard } from "../../src/engine/core/Actor.js";
import type { AniDef } from "../../src/engine/core/AnimationPlayer.js";
import { EngineKernel } from "../../src/engine/kernel/EngineKernel.js";
import { ActionSystem } from "../../src/engine/kernel/systems/ActionSystem.js";
import { InputSystem } from "../../src/engine/kernel/systems/InputSystem.js";
import { EnemyAISystem } from "../../src/engine/kernel/systems/EnemyAISystem.js";
import { AnimationSystem } from "../../src/engine/kernel/systems/AnimationSystem.js";
import { CombatResolutionSystem } from "../../src/engine/kernel/systems/CombatResolutionSystem.js";
import { HitstunSystem } from "../../src/engine/kernel/systems/HitstunSystem.js";
import { HitStopSystem } from "../../src/engine/kernel/systems/HitStopSystem.js";

const ROOT = process.cwd();
const swShard = JSON.parse(readFileSync(join(ROOT, "verification/baseline-shards/players/swordman.json"), "utf-8"));
const gobShard = JSON.parse(readFileSync(join(ROOT, "verification/baseline-shards/monsters/goblin.json"), "utf-8"));

const PLAYER_ATTACK: AniDef = {
  framesCount: 4, loop: false,
  frames: [
    { index: 0, delay: 1000 / 60, attackBoxes: [], damageBoxes: [] },
    { index: 1, delay: 1000 / 60, attackBoxes: [{ x1: 0, y1: 0, z1: -30, x2: 50, y2: 80, z2: 30 }], damageBoxes: [] },
    { index: 2, delay: 1000 / 60, attackBoxes: [], damageBoxes: [] },
    { index: 3, delay: 1000 / 60, attackBoxes: [], damageBoxes: [] },
  ],
};

// Goblin attack: facing-left box (x range negative)
const GOBLIN_ATTACK: AniDef = {
  framesCount: 4, loop: false,
  frames: [
    { index: 0, delay: 1000 / 60, attackBoxes: [], damageBoxes: [] },
    { index: 1, delay: 1000 / 60, attackBoxes: [{ x1: -50, y1: 0, z1: -30, x2: 0, y2: 80, z2: 30 }], damageBoxes: [] },
    { index: 2, delay: 1000 / 60, attackBoxes: [], damageBoxes: [] },
    { index: 3, delay: 1000 / 60, attackBoxes: [], damageBoxes: [] },
  ],
};

function buildArena(seed = 42): { kernel: EngineKernel; sw: Actor; gob: Actor } {
  const kernel = new EngineKernel(seed);
  const sw = new Actor("sw", "player", statsFromPlayerShard(swShard.chr));
  const gob = new Actor("gob", "monster", statsFromMonsterShard(gobShard.mob));
  sw.x = 0;
  gob.x = 50; // within attack range
  kernel.addActor(sw, true);
  kernel.addActor(gob, false);
  const actions = new ActionSystem();
  actions.define("attack", PLAYER_ATTACK); // player attack
  actions.define("goblinAttack", GOBLIN_ATTACK); // goblin attack
  const ai = new EnemyAISystem(actions);
  ai.setAttackAction("gob", "goblinAttack");
  kernel.registerSystem(new InputSystem(actions, "attack"));
  kernel.registerSystem(actions);
  kernel.registerSystem(ai);
  kernel.registerSystem(new AnimationSystem());
  kernel.registerSystem(new CombatResolutionSystem());
  kernel.registerSystem(new HitstunSystem());
  kernel.registerSystem(new HitStopSystem());
  return { kernel, sw, gob };
}

// ── G1: Player kills goblin via intent (two-way setup — goblin CAN fight back) ──
{
  const { kernel, sw, gob } = buildArena(42);
  const pStartHp = sw.hp;
  for (let i = 0; i < 600 && !gob.isDead; i++) {
    sw.intent = { attack: i % 8 === 0, dir: 0 };
    kernel.tick();
  }
  assert.ok(gob.isDead, "player should kill goblin in two-way fight");
  // Player may have taken some damage from goblin counter-attacks
  console.log(`G1 OK: player killed goblin (hp ${pStartHp}→${sw.hp})`);
}

// ── G2: Goblin damages the player (player doesn't attack, just stands there) ──
{
  const { kernel, sw } = buildArena(7);
  const pStartHp = sw.hp;
  // Player doesn't attack — goblin should attack back and damage the standing player.
  for (let i = 0; i < 90; i++) {
    sw.intent = { attack: false, dir: 0 };
    kernel.tick();
  }
  assert.ok(sw.hp < pStartHp, `goblin should damage player (hp ${pStartHp}→${sw.hp})`);
  console.log(`G2 OK: goblin damaged idle player by ${pStartHp - sw.hp} hp in 90 ticks`);
}

// ── G3: Full two-way fight deterministic ──
{
  const run = (seed: number): string[] => {
    const { kernel, sw, gob } = buildArena(seed);
    const hashes: string[] = [];
    for (let i = 0; i < 300; i++) {
      sw.intent = { attack: i % 8 === 0, dir: 0 };
      kernel.tick();
      hashes.push(kernel.lastStateHash);
      if (gob.isDead) break;
    }
    return hashes;
  };
  const h1 = run(42);
  const h2 = run(42);
  assert.equal(h1.length, h2.length, `hash count ${h1.length} vs ${h2.length}`);
  for (let i = 0; i < h1.length; i++) {
    assert.equal(h1[i], h2[i], `hash mismatch at frame ${i}`);
  }
  console.log(`G3 OK: ${h1.length}-frame two-way fight deterministic`);
}

console.log("\n✅ P3.0 engine two-way fight test passed");
