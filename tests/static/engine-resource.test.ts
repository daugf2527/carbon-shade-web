/**
 * engine-resource.test.ts — 08-Resource MP regen + cooldown verification.
 *
 * Proves the tick-based resource system is deterministic and kernel-integrated:
 *   R1 MP regen    — mp/min → mp/tick conversion, regen toward mpMax (never overfills)
 *   R2 cooldown    — ms→ticks (ceil), countdown to ready, isReady/remainingTicks
 *   R3 spend gate  — trySpendForSkill deducts only when affordable AND ready; else no-op
 *   R4 integration — ResourceSystem regens MP + ticks cooldowns; requestSkill fires/fizzles
 *   R5 determinism — same seed + sequence → identical mp trail + finalStateHash
 */
import assert from "node:assert/strict";
import { Actor, type ActorStats } from "../../src/engine/core/Actor.js";
import {
  CooldownLedger, mpRegenPerTick, regenMp, cooldownMsToTicks, trySpendForSkill,
} from "../../src/engine/core/ResourcePool.js";
import { EngineKernel } from "../../src/engine/kernel/EngineKernel.js";
import { ResourceSystem } from "../../src/engine/kernel/systems/ResourceSystem.js";

// Swordman-truth-shaped player stats: mpMax 140, mpRegenSpeed 50 mp/min (PVF growth base).
const PLAYER_STATS: ActorStats = {
  hpMax: 180, mpMax: 140, moveSpeed: 0, physicalAttack: 45, physicalDefense: 20, mpRegenSpeed: 50,
};

// ── R1: MP regen conversion + clamp ──
{
  // 50 mp/min ÷ 60 ÷ 60 = 0.013889 mp/tick.
  const perTick = mpRegenPerTick(50);
  assert.ok(Math.abs(perTick - 50 / 3600) < 1e-9, `mp/tick = 50/3600, got ${perTick}`);
  // Regen from 0 over 3600 ticks (1 min) ≈ 50 mp.
  let mp = 0;
  for (let i = 0; i < 3600; i++) mp = regenMp(mp, 140, 50);
  assert.ok(Math.abs(mp - 50) < 1e-6, `~50 mp after 1 min of regen, got ${mp}`);
  // Never overfills.
  assert.equal(regenMp(140, 140, 50), 140, "regen clamps at mpMax");
  console.log(`R1 OK: ${perTick.toFixed(6)} mp/tick, 1min→${mp.toFixed(2)}mp, clamp at max`);
}

// ── R2: cooldown ms→ticks + countdown ──
{
  assert.equal(cooldownMsToTicks(7000), 420, "7000ms / 16.67ms = 420 ticks");
  assert.equal(cooldownMsToTicks(10), 1, "ceil: 10ms → 1 tick (never ready early)");
  const cd = new CooldownLedger();
  assert.equal(cd.isReady("icewave"), true, "ready when no entry");
  cd.start("icewave", 7000);
  assert.equal(cd.isReady("icewave"), false, "on cooldown after start");
  assert.equal(cd.remainingTicks("icewave"), 420, "420 ticks remaining");
  for (let i = 0; i < 420; i++) cd.tick();
  assert.equal(cd.isReady("icewave"), true, "ready after 420 ticks");
  assert.equal(cd.fingerprint(), "", "empty fingerprint when no live cooldowns");
  console.log("R2 OK: 7000ms→420 ticks, countdown to ready, ceil semantics");
}

// ── R3: spend gate — affordable AND ready ──
{
  const ledger = new CooldownLedger();
  const pool = { mp: 30 };
  // icewave: cost 27, cd 7000ms.
  assert.equal(trySpendForSkill(pool, ledger, "icewave", 27, 7000), true, "fires: 30mp≥27, ready");
  assert.equal(pool.mp, 3, "27 mp deducted");
  assert.equal(trySpendForSkill(pool, ledger, "icewave", 27, 7000), false, "blocked: on cooldown");
  assert.equal(pool.mp, 3, "no MP spent when on cooldown");
  // Fresh skill but insufficient MP.
  assert.equal(trySpendForSkill(pool, ledger, "other", 27, 7000), false, "blocked: 3mp<27");
  assert.equal(pool.mp, 3, "no MP spent when unaffordable");
  console.log("R3 OK: spend only when affordable AND off-cooldown (else no state change)");
}

// ── R4: kernel integration — regen + requestSkill fire/fizzle ──
{
  const kernel = new EngineKernel(1);
  kernel.registerSystem(new ResourceSystem());
  const player = new Actor("player", "player", PLAYER_STATS);
  player.mp = 30; // start low so regen is observable + one cast affordable
  kernel.addActor(player, true);

  // Fire icewave (cost 27, cd 7000ms) — affordable.
  kernel.requestSkill("player", "icewave", 27, 7000);
  kernel.tick();
  assert.ok(player.mp < 30, `MP deducted by cast (then regen), got ${player.mp}`);
  assert.equal(player.cooldowns.isReady("icewave"), false, "icewave on cooldown after cast");
  const fired = kernel.bus.archive.filter((e) => e.type === "SkillFired");
  assert.equal(fired.length, 1, "SkillFired emitted once");

  // Immediate re-cast fizzles (on cooldown).
  kernel.requestSkill("player", "icewave", 27, 7000);
  kernel.tick();
  const fizzled = kernel.bus.archive.filter((e) => e.type === "SkillFizzled");
  assert.equal(fizzled.length, 1, "SkillFizzled emitted on cooldown re-cast");

  // Regen over 300 ticks raises MP back up (5s ≈ +4.2 mp).
  const before = player.mp;
  for (let i = 0; i < 300; i++) kernel.tick();
  assert.ok(player.mp > before, `MP regenerated over time, ${before}→${player.mp}`);
  console.log(`R4 OK: cast fired+fizzled, MP regen ${before.toFixed(2)}→${player.mp.toFixed(2)}`);
}

// ── R5: determinism — same seed + sequence → identical mp trail + finalStateHash ──
{
  const run = (seed: number): { trail: number[]; hash: string } => {
    const kernel = new EngineKernel(seed);
    kernel.registerSystem(new ResourceSystem());
    const p = new Actor("player", "player", PLAYER_STATS);
    p.mp = 50;
    kernel.addActor(p, true);
    kernel.requestSkill("player", "icewave", 27, 7000);
    const trail: number[] = [];
    for (let i = 0; i < 200; i++) {
      kernel.tick();
      trail.push(p.mp);
    }
    return { trail, hash: kernel.replay.export().finalStateHash };
  };
  const r1 = run(3);
  const r2 = run(3);
  assert.deepEqual(r1.trail, r2.trail, "same seed → identical mp trail");
  assert.equal(r1.hash, r2.hash, "same seed → identical finalStateHash");
  console.log(`R5 OK: MP regen + cooldown deterministic (final mp ${r1.trail[199].toFixed(2)})`);
}

console.log("\n✅ 08-Resource MP/cooldown test passed");
