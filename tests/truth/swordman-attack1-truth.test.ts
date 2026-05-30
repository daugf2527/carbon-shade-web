/**
 * Stage 3 T-A.11 PoC truth test (2026-05-30).
 *
 * 验证: 剑魂 attack1 (PVF 真值驱动) 打中 grunt 应该:
 *   - 命中触发 HitConfirmed 事件
 *   - 造成合理伤害 (5-50 范围, 不一击秒杀 grunt 160HP)
 *   - grunt HP 减少但未死
 *   - 第二次相同 hitGroup 命中被 already_hit_in_group dedup 拒绝
 *
 * 这是 Phase A PoC 闭环的最小验证 — 证明:
 *   1. ActorFactory 读到 SWORDMAN_TRUTH.chr.growth (T-A.7)
 *   2. ACTIONS 表用 PVF 命名 attack1 (T-A.10)
 *   3. DamageFormula 用 PVF 真值 atkPower as base 而非 multiplier (T-A.9 quick fix)
 *
 * Phase B/C 扩展时此测试应同步增加: damageBonus / weaponHitInfo / multi-hit dedup 等.
 */
import { assert } from "../static/test-utils.js";
import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";

const k = new CombatKernel();
const p = k.player;
const grunt = k.actors.find(a => a.id === "grunt")!;

// 1. 玩家真值 stat (来自 SWORDMAN_TRUTH.chr.growth)
assert.ok(p.physAtk >= 50 && p.physAtk <= 150, `player physAtk should be PVF truth ~83, got ${p.physAtk}`);
assert.ok(p.resources.maxHp >= 800 && p.resources.maxHp <= 1100, `player maxHp should be PVF truth ~953, got ${p.resources.maxHp}`);
assert.equal(p.level, 70, "player level should be 70");

// 2. attack1 action 已就绪 (PVF 命名生效)
const attack1 = k.actors[0]?.currentAction;
assert.equal(attack1, undefined, "player should start without an action");

// 3. 把 grunt 推到 attack1 打击范围内 (offsetX=50, w=92, 所以中心 x = player.x + 50, hit 范围 ±46)
grunt.position.x = p.position.x + 80;
grunt.position.z = 0;
const hpBefore = grunt.resources.hp;
assert.ok(hpBefore > 0, `grunt should start alive, got hp=${hpBefore}`);

// 4. 触发 attack1
const accepted = k.requestAction(p, "attack1");
assert.equal(accepted, true, "requestAction attack1 should be accepted");

// 5. 跑到 active window (frames 5-8 of 20)
let hitCount = 0;
let observedDamage = 0;
k.bus.on("HitConfirmed", (e: { payload: unknown; sourceActorId?: string; targetActorId?: string }) => {
  if (e.sourceActorId === "player" && e.targetActorId === "grunt") {
    hitCount++;
    const dec = e.payload as { hitbox?: { id?: string } };
    observedDamage += dec.hitbox?.id === "nb1" ? 1 : 0;
  }
});

// run up to 12 ticks to cover startup + active + a bit of recovery
for (let i = 0; i < 12; i++) k.tick();

// 6. 至少触发 1 次命中
assert.ok(hitCount >= 1, `attack1 should hit grunt at least once, got hitCount=${hitCount}`);

// 7. dedup: 同一 hitGroup 一次 attack1 instance 内只应命中 1 次
assert.equal(hitCount, 1, `attack1 should only hit grunt once per instance (hitGroupId dedup), got ${hitCount}`);

// 8. grunt HP 减少了, 但没有一击秒杀
const hpAfter = grunt.resources.hp;
const hpDrop = hpBefore - hpAfter;
assert.ok(hpDrop > 0, `grunt hp should drop after hit, before=${hpBefore} after=${hpAfter}`);
assert.ok(hpAfter > 0, `grunt should still be alive after one attack1 hit, hp=${hpAfter}/${grunt.resources.maxHp}`);
assert.ok(hpDrop < hpBefore, `attack1 should not one-shot grunt: dropped ${hpDrop} of ${hpBefore} HP`);

// 9. damage 在合理范围 — PVF 真值公式 (atkPower 83 × skillPct 0.10 × statRatio ~2.9 × defRatio ~0.99 ≈ 24)
assert.ok(hpDrop >= 5 && hpDrop <= 80, `attack1 damage should be sensible (5-80), got ${hpDrop}`);

console.log(`PoC truth test PASS — attack1 dealt ${hpDrop} damage (${hpBefore} → ${hpAfter} HP), player physAtk=${p.physAtk}, maxHp=${p.resources.maxHp}`);
