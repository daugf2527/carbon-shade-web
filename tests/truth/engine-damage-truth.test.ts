/**
 * engine-damage-truth.test.ts — Truth guard for the TARGET engine (`src/engine/`).
 *
 * 缺口背景: 在此之前 0 个 truth 测试守 `src/engine/core/DamageFormula.ts`。现存 truth 测试
 * 全打在 FROZEN 的 `src/combat/` 上 (swordman-attack1-truth / reaction-velocity 等)。engine 是
 * 真值反推新主线 (见 memory engine-is-new-target-architecture)，伤害公式必须同样吃 PVF 真值
 * 并被守住。本文件补这个缺口。
 *
 * 守的契约 (engine `calcPhysicalDamage`):
 *   damage = round( physAtk * atkBonus * (damageScalePct/100) * (1 - def/(def+K)) ), 下限 1
 *   - atkBonus       ← 1 + swordman-attacks.json damageBonus.value/100 (null → 1.0)
 *       语义: damageBonus 是相对基准的百分比增减。+90% → ×1.9, +110% → ×2.1, -40% → ×0.6。
 *       关键证据: shard 内存在负值 (weaponcombolight1 = -40)。若按 value/100 解释 (-40 → -0.4)
 *       会得负伤害 / clamp 到 1——负值的存在排除了 value/100，锁定 1+value/100。
 *       requiresManualVerification: 无 PVF 字段定义第一证据，combat 从未消费 damageBonus，
 *       % 语义系从负值反推，待客户端实测核验最终系数叠加方式。
 *   - damageScalePct ← chr.weaponHitInfo[slot].damageScalePct (per-weapon-class)
 *
 * 断言风格 = self-consistent: 从真值 JSON 提取 damageBonus，配一组任意 physAtk/def，把同样
 * 真值参数喂被测函数，再用同一公式独立手算期望对拍。不写死 attacker stat 魔数 (那会随
 * actor stats 真值化而脆)。负值 case (②c) 是语义正确性的硬守护。
 */

import { assert } from "../static/test-utils.js";
import { calcPhysicalDamage } from "../../src/engine/core/DamageFormula.js";
import SWORDMAN_ATTACKS from "../../src/data/manifest/truth/swordman-attacks.json" with { type: "json" };

type AttacksMap = Record<string, { damageBonus: { value: number; unit: string } | null }>;
const ATTACKS = SWORDMAN_ATTACKS as unknown as AttacksMap;

/** action 的 damageBonus 真值 → 乘数: 1 + value/100 (null → 1.0). 镜像 CombatResolutionSystem 语义. */
function atkBonusOf(action: string): number {
  const db = ATTACKS[action]?.damageBonus;
  return db == null ? 1.0 : 1 + db.value / 100;
}

/** 同一公式的独立参考实现 (self-consistent oracle). MUST 与 DamageFormula 公式一致. */
const MITIGATION_K = 200;
function expectedDamage(physAtk: number, atkBonus: number, def: number, damageScalePct = 100): number {
  const weaponScale = damageScalePct / 100;
  const raw = physAtk * atkBonus * weaponScale; // crit/element = 1.0 (local_baseline)
  const mitigation = def / (def + MITIGATION_K);
  return Math.max(1, Math.round(raw * (1 - mitigation)));
}

// 固定 attacker/defender stat (任意常量，非真值魔数 —— 只为驱动公式).
const PHYS_ATK = 100;
const DEF = 50; // mitigation = 50/250 = 0.2 → ×0.8
const BASELINE = calcPhysicalDamage({ attackerPhysAtk: PHYS_ATK, atkBonus: 1.0, defenderPhysDef: DEF }); // 80

// ① damageBonus = null → atkBonus 1.0 (无加成)
{
  assert.equal(ATTACKS.attack2?.damageBonus, null, "fixture: attack2.damageBonus should be null");
  const bonus = atkBonusOf("attack2");
  assert.equal(bonus, 1.0, `null damageBonus → 1.0, got ${bonus}`);
  const got = calcPhysicalDamage({ attackerPhysAtk: PHYS_ATK, atkBonus: bonus, defenderPhysDef: DEF });
  assert.equal(got, expectedDamage(PHYS_ATK, bonus, DEF), "null-bonus self-consistent");
  assert.equal(got, 80, `null bonus on physAtk=100/def=50 → 80, got ${got}`);
}

// ② damageBonus = +90% → atkBonus 1.9 → 增伤，严格高于 100% 基线 (证明 bonus 真进了公式)
{
  const db = ATTACKS.weaponcomboshort3?.damageBonus;
  assert.ok(db != null && db.value === 90, `fixture: weaponcomboshort3.damageBonus.value=90, got ${JSON.stringify(db)}`);
  const bonus = atkBonusOf("weaponcomboshort3");
  assert.equal(bonus, 1.9, `+90% → 1.9, got ${bonus}`);
  const got = calcPhysicalDamage({ attackerPhysAtk: PHYS_ATK, atkBonus: bonus, defenderPhysDef: DEF });
  assert.equal(got, expectedDamage(PHYS_ATK, bonus, DEF), "90% self-consistent");
  assert.ok(got > BASELINE, `+90% (${got}) must exceed 100% baseline (${BASELINE})`);
  assert.equal(got, 152, `+90% on physAtk=100/def=50 → 152, got ${got}`);
}

// ②b damageBonus = +110% → atkBonus 2.1 (放大也正确流过)
{
  const db = ATTACKS.weaponcomboheavy2?.damageBonus;
  assert.ok(db != null && db.value === 110, `fixture: weaponcomboheavy2.damageBonus.value=110, got ${JSON.stringify(db)}`);
  const bonus = atkBonusOf("weaponcomboheavy2");
  assert.equal(bonus, 2.1, `+110% → 2.1, got ${bonus}`);
  const got = calcPhysicalDamage({ attackerPhysAtk: PHYS_ATK, atkBonus: bonus, defenderPhysDef: DEF });
  assert.ok(got > BASELINE, `+110% (${got}) > baseline (${BASELINE})`);
  assert.equal(got, 168, `+110% on physAtk=100/def=50 → 168, got ${got}`);
}

// ②c 负 damageBonus = -40% → atkBonus 0.6 → 减伤但 NOT 负 / NOT clamp 到 1。
//    这是 1+value/100 vs value/100 的判别性证据: value/100 会让 -40→-0.4→负 raw→floor 1。
{
  const db = ATTACKS.weaponcombolight1?.damageBonus;
  assert.ok(db != null && db.value === -40, `fixture: weaponcombolight1.damageBonus.value=-40, got ${JSON.stringify(db)}`);
  const bonus = atkBonusOf("weaponcombolight1");
  assert.equal(bonus, 0.6, `-40% → 0.6 (NOT -0.4), got ${bonus}`);
  const got = calcPhysicalDamage({ attackerPhysAtk: PHYS_ATK, atkBonus: bonus, defenderPhysDef: DEF });
  assert.ok(got > 1, `-40% bonus must NOT collapse to floor 1 (the value/100 bug would), got ${got}`);
  assert.ok(got < BASELINE, `-40% (${got}) < baseline (${BASELINE})`);
  assert.equal(got, 48, `-40% on physAtk=100/def=50 → 48, got ${got}`);
}

// ③ damageScalePct 生效 (独立于 bonus) + 与 bonus 复合
{
  const explicit100 = calcPhysicalDamage({ attackerPhysAtk: PHYS_ATK, atkBonus: 1.0, defenderPhysDef: DEF, damageScalePct: 100 });
  assert.equal(BASELINE, explicit100, `omitting damageScalePct === 100 (${BASELINE} vs ${explicit100})`);

  const got = calcPhysicalDamage({ attackerPhysAtk: PHYS_ATK, atkBonus: 1.0, defenderPhysDef: DEF, damageScalePct: 90 });
  assert.equal(got, expectedDamage(PHYS_ATK, 1.0, DEF, 90), "scale 90 self-consistent");
  assert.ok(got < BASELINE, `scale 90 (${got}) reduces vs 100 baseline (${BASELINE})`);
  assert.equal(got, 72, `scale 90 on physAtk=100/def=50 → 72, got ${got}`);

  // 复合: +90% bonus (1.9) × 90% scale (0.9) = 1.71 → 100×1.71×0.8 = 136.8 → round 137
  const both = calcPhysicalDamage({ attackerPhysAtk: PHYS_ATK, atkBonus: 1.9, defenderPhysDef: DEF, damageScalePct: 90 });
  assert.equal(both, 137, `bonus +90% × scale 90% on physAtk=100/def=50 → 137, got ${both}`);
}

// ④ 边界: 极小 raw 也不会 < 1 (max(1,...) 守护)
{
  const got = calcPhysicalDamage({ attackerPhysAtk: 1, atkBonus: 0.1, defenderPhysDef: 9999, damageScalePct: 10 });
  assert.equal(got, 1, `tiny raw clamps to 1, got ${got}`);
}

console.log("engine-damage-truth PASS — atkBonus = 1 + damageBonus%/100 (+90%→x1.9, +110%→x2.1, -40%→x0.6 not collapse); damageScalePct flows + composes");
