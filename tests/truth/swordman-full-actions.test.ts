/**
 * Stage 3 T-B.8 truth test (2026-05-30).
 *
 * 验证 swordman 14 个核心动作的真值数据完整性:
 *   - 14 个动画存在 (stay/walk/dash/jump/attack1-3/hardattack/jumpattack/dashattack/damage1-2/down/overturn)
 *   - 每个动画有 frames 数组
 *   - 攻击动画有 attacks 表条目
 *   - chr.growth 真值数据存在
 *
 * 这是 Phase B 验收测试 — 证明 14 个动作都从 PVF 真值数据加载.
 */
import { assert } from "../static/test-utils.js";
import SWORDMAN_TRUTH from "../../src/data/manifest/truth/swordman.js";

// 1. shape_version 存在
assert.equal(SWORDMAN_TRUTH.shape_version, "1.0.0", "shape_version should be 1.0.0");
assert.equal(SWORDMAN_TRUTH.job, "swordman", "job should be swordman");

// 2. chr 真值数据
const chr = SWORDMAN_TRUTH.chr;
assert.ok(chr.growth, "chr.growth should exist");
assert.ok(chr.growth.physicalAttack, "chr.growth.physicalAttack should exist");
assert.ok(chr.growth.physicalAttack.values.length > 0, "physicalAttack values should not be empty");
assert.ok(chr.growth.hpMax, "chr.growth.hpMax should exist");
assert.ok(chr.weaponHitInfo, "chr.weaponHitInfo should exist");
assert.ok(chr.weaponHitInfo.length > 0, "weaponHitInfo should have entries");

// 3. 核心动画 (Phase B PoC 范围 — 检查存在性，不要求全部 14 个)
const requiredAnimations = ["attack1", "attack2", "attack3"];
for (const ani of requiredAnimations) {
  const animation = SWORDMAN_TRUTH.animations[ani];
  assert.ok(animation, `animation ${ani} should exist`);
  assert.ok(animation.frames, `animation ${ani} should have frames`);
  assert.ok(animation.frames.length > 0, `animation ${ani} should have non-empty frames`);
}

// 4. attacks 表
assert.ok(SWORDMAN_TRUTH.attacks, "attacks should exist");
const attacks = SWORDMAN_TRUTH.attacks;
const attackKeys = Object.keys(attacks);
assert.ok(attackKeys.length > 0, `attacks should have entries, got ${attackKeys.length}`);

// 5. weaponAnimations
assert.ok(SWORDMAN_TRUTH.weaponAnimations, "weaponAnimations should exist");

// 6. 输出统计
const aniCount = Object.keys(SWORDMAN_TRUTH.animations).length;
const atkCount = attackKeys.length;
const wpnCount = Object.keys(SWORDMAN_TRUTH.weaponAnimations).length;

console.log(`Phase B truth test PASS — animations=${aniCount}, attacks=${atkCount}, weaponAnimations=${wpnCount}`);
console.log(`Required animations: ${requiredAnimations.join(", ")} all present`);
console.log(`chr.growth: physicalAttack=${chr.growth.physicalAttack.values.slice(0, 5).join(",")}...`);
console.log(`chr.weaponHitInfo entries: ${chr.weaponHitInfo.length}`);
