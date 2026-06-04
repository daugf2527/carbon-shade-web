/**
 * engine-kernel-pipeline.test.ts — EngineKernel determinism verification (P1 milestone).
 *
 * Proves two things:
 *   1. EngineKernel.tick() runs the core combat chain (Damage→Reaction→FSM) to goblin death.
 *   2. Same seed + same inputs → identical stateHash sequence (replay determinism).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assert } from "./test-utils.js";
import { Actor, statsFromPlayerShard, statsFromMonsterShard } from "../../src/engine/core/Actor.js";
import { ActorState } from "../../src/engine/core/ActorStateMachine.js";
import { calcPhysicalDamage } from "../../src/engine/core/DamageFormula.js";
import { applyHitReaction, tickReaction, type ReactionState } from "../../src/engine/core/ReactionResolver.js";
import { EngineKernel } from "../../src/engine/kernel/EngineKernel.js";
import type { EngineSystem } from "../../src/engine/kernel/EngineSystem.js";
import type { EngineContext } from "../../src/engine/kernel/EngineContext.js";

const ROOT = process.cwd();
const swShard = JSON.parse(readFileSync(join(ROOT, "verification/baseline-shards/players/swordman.json"), "utf-8"));
const gobShard = JSON.parse(readFileSync(join(ROOT, "verification/baseline-shards/monsters/goblin.json"), "utf-8"));

// ── Test helper: build kernel with swordman + goblin ──

function freshKernel(seed = 42): { kernel: EngineKernel; sw: Actor; gob: Actor } {
  const kernel = new EngineKernel(seed);
  const sw = new Actor("sw", "player", statsFromPlayerShard(swShard.chr));
  const gob = new Actor("gob", "monster", statsFromMonsterShard(gobShard.mob));
  kernel.addActor(sw, true);
  kernel.addActor(gob, false);
  return { kernel, sw, gob };
}

// ── G1: Determinism — same inputs → same stateHash sequence ──

{
  // First run
  const { kernel: k1, sw: s1, gob: g1 } = freshKernel(42);

  const attackOnce: EngineSystem = {
    name: "TestAttack",
    phase: "DETECTION",
    tick(ctx: EngineContext): void {
      const swordman = ctx.player;
      const goblin = ctx.actors.find((a) => a.id === "gob")!;
      if (goblin.isDead) return;

      const dmg = calcPhysicalDamage({
        attackerPhysAtk: swordman.stats.physicalAttack,
        atkBonus: 1.0,
        defenderPhysDef: goblin.stats.physicalDefense,
      });
      applyHitReaction(goblin, {}, dmg, ctx.tickCount);
    },
  };

  const tickReactions: EngineSystem = {
    name: "TestTickReaction",
    phase: "RESOLVE",
    tick(ctx: EngineContext): void {
      for (const actor of ctx.actors) {
        // Find active reaction on actor (we track via fsm state)
        if (actor.fsm.state === ActorState.HIT || actor.fsm.state === ActorState.DOWN || actor.fsm.state === ActorState.AIRBORNE) {
          // Use a dummy reaction — in real pipeline this is stored per-actor
          const dummyReaction: ReactionState = { active: true, remainingTicks: 1, kind: "hit" };
          tickReaction(actor, dummyReaction, ctx.tickCount);
        }
      }
    },
  };

  k1.registerSystem(attackOnce);
  k1.registerSystem(tickReactions);

  const hashes1: string[] = [];
  while (!g1.isDead && k1.tickCount < 500) {
    k1.tick();
    hashes1.push(k1.lastStateHash);
  }
  assert.ok(g1.isDead, `g1 should die, hp=${g1.hp}`);
  assert.ok(hashes1.length > 0, "should have tick hashes");

  // Second run — exact same setup, must produce same hashes
  const { kernel: k2, gob: g2 } = freshKernel(42);
  k2.registerSystem(attackOnce);
  k2.registerSystem(tickReactions);

  const hashes2: string[] = [];
  while (!g2.isDead && k2.tickCount < 500) {
    k2.tick();
    hashes2.push(k2.lastStateHash);
  }
  assert.ok(g2.isDead, `g2 should die, hp=${g2.hp}`);

  // Determinism: hash-per-tick must match exactly
  assert.equal(hashes1.length, hashes2.length, `hash count: ${hashes1.length} vs ${hashes2.length}`);
  for (let i = 0; i < hashes1.length; i++) {
    assert.equal(hashes1[i], hashes2[i], `tick ${i} hash mismatch`);
  }
  console.log(`G1 determinism OK: ${hashes1.length} hashes identical across two runs`);
}

// ── G2: Different seed → different hashes (PRNG isolation) ──

{
  const { kernel: k1, gob: g1 } = freshKernel(99);

  const noopSystem: EngineSystem = {
    name: "Noop",
    phase: "LOGIC",
    tick(): void { /* nothing — just tick the kernel */ },
  };
  k1.registerSystem(noopSystem);

  const { kernel: k2 } = freshKernel(77);
  k2.registerSystem(noopSystem);

  k1.tick();
  k2.tick();
  assert.notEqual(k1.lastStateHash, k2.lastStateHash, "different seeds should produce different hashes");
  console.log(`G2 seed isolation OK: ${k1.lastStateHash} ≠ ${k2.lastStateHash}`);
}

// ── G3: Kernel resets cleanly ──

{
  const { kernel: k } = freshKernel(42);
  k.reset([{ actor: new Actor("sw", "player", statsFromPlayerShard(swShard.chr)), isPlayer: true }]);
  assert.equal(k.tickCount, 0, "tickCount reset to 0");
  assert.equal(k.actors.length, 1, "actors reset");
  assert.equal(k.player.id, "sw", "player set");
  console.log("G3 reset OK");
}

// ── G4: Phase ordering — systems run in declared phase order ──

{
  const log: string[] = [];
  const makeSys = (name: string, phase: "INPUT" | "LOGIC" | "DETECTION" | "RESOLVE" | "CLEANUP" | "RECORD" | "FLUSH"): EngineSystem => ({
    name,
    phase,
    tick(): void {
      log.push(name);
    },
  });

  const k = new EngineKernel(0);
  // Register in reverse phase order — kernel must sort by phase
  k.registerSystem(makeSys("flush", "FLUSH"));
  k.registerSystem(makeSys("resolve", "RESOLVE"));
  k.registerSystem(makeSys("input", "INPUT"));
  k.tick();

  assert.equal(log.join("→"), "input→resolve→flush", `phase order: ${log.join("→")}`);
  console.log(`G4 phase ordering OK: ${log.join("→")}`);
}

console.log("\n✅ P1 EngineKernel pipeline test passed");
