/**
 * engine-hitstun-truth.test.ts — hitstun = defender's hit-recovery (PVF truth wiring).
 *
 * ReactionResolver used a hardcoded DEFAULT_HITSTUN_MS=600 ("local_baseline, attacks have no
 * hitstun field"). Truth: hitstun is the DEFENDER's hit-recovery property —
 *   swordman chr.growth.hitRecovery base 600ms · goblin mob.hitRecovery 500ms.
 * (swordman-attacks.json carries no hitstun; the matrix flags mob.hitRecovery as 受击硬直时间.)
 *
 *   H1 stat sourcing  — statsFromPlayerShard→600ms, statsFromGoblinTruth→500ms
 *   H2 reaction uses defender stat — hitstun ticks = round(defender.hitRecovery / tickMs)
 *   H3 distinct per defender — a 500ms defender recovers faster than a 600ms one
 *   H4 fallback — defender with no hitRecovery stat → DEFAULT 600ms; flags override wins
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Actor, statsFromPlayerShard, statsFromGoblinTruth, type ActorStats } from "../../src/engine/core/Actor.js";
import { applyHitReaction, tickReaction } from "../../src/engine/core/ReactionResolver.js";

const ROOT = process.cwd();
const swShard = JSON.parse(readFileSync(join(ROOT, "verification/baseline-shards/players/swordman.json"), "utf-8"));
const TICK_MS = 1000 / 60;

// ── H1: stat sourcing ──
{
  const sw = statsFromPlayerShard(swShard.chr);
  assert.equal(sw.hitRecovery, 600, "swordman chr.growth.hitRecovery base = 600ms");
  const gob = statsFromGoblinTruth();
  assert.equal(gob.hitRecovery, 500, "goblin mob.hitRecovery = 500ms");
  console.log(`H1 OK: swordman hitRecovery 600ms, goblin 500ms (PVF-sourced)`);
}

// ── H2: reaction uses the defender's hitRecovery for hitstun duration ──
{
  const goblin = new Actor("g", "monster", statsFromGoblinTruth()); // 500ms
  const r = applyHitReaction(goblin, { hitReaction: "hit_down" }, 5, 0);
  const expectedTicks = Math.round(500 / TICK_MS); // 30 ticks
  assert.equal(r.remainingTicks, expectedTicks, `goblin hitstun = round(500/16.67) = ${expectedTicks} ticks`);
  console.log(`H2 OK: goblin hitstun ${r.remainingTicks} ticks (from 500ms hitRecovery)`);
}

// ── H3: distinct recovery — 500ms defender clears hitstun before a 600ms one ──
{
  const fast = new Actor("fast", "monster", { ...statsFromGoblinTruth() }); // 500ms → 30 ticks
  const slow = new Actor("slow", "player", statsFromPlayerShard(swShard.chr)); // 600ms → 36 ticks
  fast.reaction = applyHitReaction(fast, { hitReaction: "hit_down" }, 5, 0);
  slow.reaction = applyHitReaction(slow, { hitReaction: "hit_down" }, 5, 0);
  // Tick both for 31 ticks: the 30-tick (fast) one should have expired, the 36-tick (slow) not.
  for (let t = 1; t <= 31; t++) {
    if (fast.reaction?.active) tickReaction(fast, fast.reaction, t);
    if (slow.reaction?.active) tickReaction(slow, slow.reaction, t);
  }
  assert.equal(fast.reaction?.active, false, "500ms defender recovered by tick 31");
  assert.equal(slow.reaction?.active, true, "600ms defender still in hitstun at tick 31");
  console.log("H3 OK: 500ms defender recovers faster than 600ms (truth-distinct)");
}

// ── H4: fallback + flags override ──
{
  const noStat = new Actor("n", "monster", { hpMax: 50, mpMax: 0, moveSpeed: 0, physicalAttack: 0, physicalDefense: 0 } as ActorStats);
  const rDefault = applyHitReaction(noStat, { hitReaction: "hit_down" }, 5, 0);
  assert.equal(rDefault.remainingTicks, Math.round(600 / TICK_MS), "no hitRecovery stat → DEFAULT 600ms");
  // flags.hitstunMs overrides even when the defender has a stat.
  const goblin = new Actor("g", "monster", statsFromGoblinTruth());
  const rOverride = applyHitReaction(goblin, { hitReaction: "hit_down", hitstunMs: 1000 }, 5, 0);
  assert.equal(rOverride.remainingTicks, Math.round(1000 / TICK_MS), "flags.hitstunMs overrides defender stat");
  console.log("H4 OK: fallback 600ms when statless; flags.hitstunMs overrides");
}

console.log("\n✅ hitstun truth-wiring test passed");
