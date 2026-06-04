/**
 * engine-crosscutting-systems.test.ts — P2b 横切支撑层验证.
 *
 * 验证 5 个 HOT 横切系统(13-DataStore / 17-Math / 18-Timer / 20-Time / 21-Predicate)
 * 接入 EngineKernel 后:
 *   C1 provides 路由 — 5 个 service 都挂到 EngineContext
 *   C2 各系统真实能力(非空壳)— Math 确定性 / DataStore 存取 / Timer 倒计时 /
 *      Time 时钟 / Predicate 判定
 *   C3 多帧 stateHash 可复现(路线图 P2 里程碑)
 *   C4 横切状态(DataStore + Timer)折进 stateHash — 证明它们真的在跑
 *   C5 reset() 清横切状态(场景切换)
 *
 * 真值锚点:src/data/manifest/truth/system-api-map.ts(P2a 解封)。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Actor, statsFromPlayerShard, statsFromMonsterShard } from "../../src/engine/core/Actor.js";
import { EngineKernel } from "../../src/engine/kernel/EngineKernel.js";
import { MathSystem } from "../../src/engine/kernel/systems/MathSystem.js";
import { DataStoreSystem } from "../../src/engine/kernel/systems/DataStoreSystem.js";
import { TimerSystem } from "../../src/engine/kernel/systems/TimerSystem.js";
import { TimeSystem } from "../../src/engine/kernel/systems/TimeSystem.js";
import { PredicateSystem } from "../../src/engine/kernel/systems/PredicateSystem.js";

const ROOT = process.cwd();
const swShard = JSON.parse(readFileSync(join(ROOT, "verification/baseline-shards/players/swordman.json"), "utf-8"));
const gobShard = JSON.parse(readFileSync(join(ROOT, "verification/baseline-shards/monsters/goblin.json"), "utf-8"));

function buildKernel(seed = 42): { kernel: EngineKernel; sw: Actor; gob: Actor } {
  const kernel = new EngineKernel(seed);
  const sw = new Actor("sw", "player", statsFromPlayerShard(swShard.chr));
  const gob = new Actor("gob", "monster", statsFromMonsterShard(gobShard.mob));
  kernel.addActor(sw, true);
  kernel.addActor(gob, false);
  kernel.registerSystem(new MathSystem(kernel.prng));
  kernel.registerSystem(new DataStoreSystem());
  kernel.registerSystem(new TimerSystem());
  kernel.registerSystem(new TimeSystem());
  kernel.registerSystem(new PredicateSystem());
  return { kernel, sw, gob };
}

// ── C1: provides 路由 ──
{
  const { kernel } = buildKernel();
  assert.ok(kernel.math, "math service exposed on context");
  assert.ok(kernel.dataStore, "dataStore service exposed");
  assert.ok(kernel.timer, "timer service exposed");
  assert.ok(kernel.time, "time service exposed");
  assert.ok(kernel.predicate, "predicate service exposed");
  console.log("C1 OK: 5 cross-cutting services routed to EngineContext");
}

// ── C2: 各系统真实能力 ──
{
  const { kernel, sw, gob } = buildKernel(7);
  kernel.tick();

  // 17-Math: deterministic random across same-seed kernels
  const m1 = kernel.math!.randomInt(0, 100);
  const k2 = buildKernel(7).kernel;
  k2.tick();
  const m2 = k2.math!.randomInt(0, 100);
  assert.equal(m1, m2, "Math.randomInt deterministic across same-seed kernels");
  assert.equal(kernel.math!.abs(-5), 5, "Math.abs");
  assert.ok(Math.abs(kernel.math!.toRadian(180) - Math.PI) < 1e-9, "Math.toRadian");

  // 13-DataStore
  kernel.dataStore!.setInt("hp", 42);
  assert.equal(kernel.dataStore!.getInt("hp"), 42, "DataStore int set/get");
  assert.equal(kernel.dataStore!.getInt("missing", -1), -1, "DataStore fallback");
  kernel.dataStore!.pushVec("combo", 3);
  kernel.dataStore!.pushVec("combo", 7);
  assert.deepEqual([...kernel.dataStore!.getVec("combo")], [3, 7], "DataStore vector push");

  // 18-Timer: fires after exactly N ticks
  kernel.timer!.schedule("skill_cd", 3);
  assert.equal(kernel.timer!.isFired("skill_cd"), false, "Timer not fired yet");
  kernel.tick();
  kernel.tick();
  kernel.tick();
  assert.equal(kernel.timer!.isFired("skill_cd"), true, "Timer fired after 3 ticks");

  // 20-Time
  assert.ok(kernel.time!.currentTick > 0, "Time advances");
  assert.equal(kernel.time!.currentMs, kernel.time!.currentTick * (1000 / 60), "currentMs = tick*tickMs");

  // 21-Predicate
  assert.equal(kernel.predicate!.isMyControlObject(sw, "sw"), true, "control object true");
  assert.equal(kernel.predicate!.isMyControlObject(gob, "sw"), false, "non-control false");
  assert.equal(
    kernel.predicate!.isIntersectRect({ x1: 0, y1: 0, x2: 10, y2: 10 }, { x1: 5, y1: 5, x2: 15, y2: 15 }),
    true,
    "rect overlap",
  );
  assert.equal(
    kernel.predicate!.isIntersectRect({ x1: 0, y1: 0, x2: 1, y2: 1 }, { x1: 5, y1: 5, x2: 6, y2: 6 }),
    false,
    "rect no-overlap",
  );
  console.log("C2 OK: all 5 systems' core capabilities verified (non-stub)");
}

// ── C3: 多帧 stateHash 可复现 ──
{
  const runHashes = (seed: number): string[] => {
    const { kernel } = buildKernel(seed);
    kernel.timer!.schedule("t1", 5);
    const hashes: string[] = [];
    for (let i = 0; i < 10; i++) {
      kernel.dataStore!.setInt("score", i * 10);
      kernel.tick();
      hashes.push(kernel.lastStateHash);
    }
    return hashes;
  };
  const h1 = runHashes(42);
  const h2 = runHashes(42);
  assert.equal(h1.length, h2.length, "hash count");
  for (let i = 0; i < h1.length; i++) {
    assert.equal(h1[i], h2[i], `multi-frame hash mismatch at frame ${i}`);
  }
  assert.ok(new Set(h1).size > 1, "hashes vary across frames (state evolves)");
  console.log(`C3 OK: ${h1.length}-frame stateHash reproducible across two runs`);
}

// ── C4: 横切状态折进 stateHash ──
{
  const { kernel: ka } = buildKernel(42);
  const { kernel: kb } = buildKernel(42);
  ka.dataStore!.setInt("x", 1);
  kb.dataStore!.setInt("x", 999);
  ka.tick();
  kb.tick();
  assert.notEqual(ka.lastStateHash, kb.lastStateHash, "DataStore state must affect stateHash");

  const { kernel: kc } = buildKernel(42);
  const { kernel: kd } = buildKernel(42);
  kc.timer!.schedule("z", 3);
  kc.tick();
  kd.tick();
  assert.notEqual(kc.lastStateHash, kd.lastStateHash, "Timer state must affect stateHash");
  console.log("C4 OK: cross-cutting state (DataStore + Timer) folds into stateHash");
}

// ── C5: reset() 清横切状态 ──
{
  const { kernel } = buildKernel(42);
  kernel.dataStore!.setInt("persist", 5);
  kernel.timer!.schedule("tt", 10);
  kernel.tick();
  const sw2 = new Actor("sw", "player", statsFromPlayerShard(swShard.chr));
  kernel.reset([{ actor: sw2, isPlayer: true }]);
  assert.equal(kernel.dataStore!.getInt("persist", -1), -1, "DataStore cleared on reset");
  assert.equal(kernel.timer!.remaining("tt"), 0, "Timer cleared on reset");
  assert.equal(kernel.time!.currentTick, 0, "Time reset to 0");
  console.log("C5 OK: reset() clears cross-cutting state");
}

console.log("\n✅ P2b cross-cutting systems test passed");
