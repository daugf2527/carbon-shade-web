import type { AttackType, DamageRequest } from "../types.js";

// ============================================================
// DNF 70-85 classic PvE damage formula
// ============================================================
//
// Evidence: docs/research/reference/community/damage-formula-audit-from-dcalc.md
// Target version: 70-85 (pre-Origin / 大转移 baseline)
//
// Four-path routing based on attackType:
//   physical_percent  → physAtk × skill% with STR scaling
//   magic_percent     → magAtk × skill% with INT scaling
//   physical_fixed    → independentAtk × coefficient with STR scaling
//   magic_fixed       → independentAtk × coefficient with INT scaling
//
// 10-multiplier structure (ratios 0-9):
//   ratio_0: STR/INT coefficient = primaryStat / 250 + 1
//   ratio_1: attack power = AtkP/AtkM/AtkI (from attackerStats)
//   ratio_2: attack power % (future — equipment slots)
//   ratio_3: elemental factor = 1 + (elemStrength - targetElemResist) / 220
//   ratio_4: critical = 1.5
//   ratio_5: buff coefficient (future)
//   ratio_6: skill attack (future)
//   ratio_7: attack reinforce (future)
//   ratio_8: defense reduction = 1 - targetDef / (targetDef + attackerLevel × 200)
//   ratio_9: misc (future — attribute white damage, etc.)
//
// Combat Lab scaling: FINAL_DIVISOR=1 keeps damage in 10-30 range.
// Future ratio defaults (1,2,5,6,7,9) pass through at 1.0.

// Core DNF constants (verified from dcalc + DFO Wiki + evidence-source-execution-plan)
const STR_DIVISOR       = 250;    // 每250力量翻倍基础攻击
const ELE_COEFF         = 0.0045; // 每点属强增加0.45%伤害
const ELE_BASE          = 1.05;   // 基础5%属强增伤
const ELE_DIVISOR       = 220;    // 属性差除数
const CRIT_MULTIPLIER   = 1.5;    // 暴击1.5倍
const COUNTER_MULTIPLIER = 1.25;  // 破招1.25倍
const DEF_DIVISOR       = 200;    // 防御公式除常数
const FINAL_DIVISOR     = 1;      // Combat Lab uses small-scale damage (10-30), not MMO-scale (millions)

// Future ratio defaults (pass-through until equipment/buff/jade systems exist)
const R_ATK_POWER       = 1.0; // ratio_1: 物/魔/独立攻击力
const R_ATK_POWER_PCT   = 1.0; // ratio_2: 攻击力%
const R_BUFF            = 1.0; // ratio_5: BUFF系数
const R_SKILL_ATK       = 1.0; // ratio_6: 技攻
const R_ATK_REINFORCE   = 1.0; // ratio_7: 攻击强化
const R_MISC            = 1.0; // ratio_9: 杂项

/** Resolve which attack stat to use based on attackType. */
function getAttackPower(req: DamageRequest): number {
  const s = req.attackerStats ?? {};
  switch (req.attackType) {
    case "physical_percent": return s.physAtk ?? 0;
    case "magic_percent":    return s.magAtk ?? 0;
    case "physical_fixed":   return s.independentAtk ?? 0;
    case "magic_fixed":      return s.independentAtk ?? 0;
    default:                 return 0;
  }
}

/** Resolve the primary stat (STR or INT) based on attackType. */
function getPrimaryStat(req: DamageRequest): number {
  const s = req.attackerStats ?? {};
  switch (req.attackType) {
    case "physical_percent": return s.strength ?? 0;
    case "magic_percent":    return s.intelligence ?? 0;
    case "physical_fixed":   return s.strength ?? 0;
    case "magic_fixed":      return s.intelligence ?? 0;
    default:                 return s.strength ?? 0;
  }
}

export interface DamageFormulaFlags {
  isCounter: boolean;
  isBackAttack: boolean;
  isCritical: boolean;
}

export interface DamageFormulaResult {
  finalDamage: number;
  multipliers: Array<{ name: string; value: number }>;
}

export class DamageFormulaResolver {
  resolve(req: DamageRequest, flags: DamageFormulaFlags, damageAllowed = true, extraMultipliers: Array<{ name: string; value: number }> = []): DamageFormulaResult {
    const multipliers: Array<{ name: string; value: number }> = [];

    // ratio_0: STR/INT coefficient (physical → STR, magic → INT)
    const primaryStat = getPrimaryStat(req);
    const statRatio = 1 + primaryStat / STR_DIVISOR;
    multipliers.push({ name: "ratio_0_primary_stat", value: statRatio });

    // ratio_1: attack power (physAtk / magAtk / independentAtk based on attackType)
    const atkPower = getAttackPower(req);
    multipliers.push({ name: "ratio_1_atk_power", value: atkPower || 1.0 });

    // ratio_3: elemental factor = 1 + (elemStrength - targetElemResist) / 220
    const elemStr = req.attackerStats?.elementalDamage ?? 0;
    const elemRes = req.targetStats?.elemResist ?? 0;
    const elemDiff = elemStr - elemRes;
    const eleRatio = 1 + elemDiff / ELE_DIVISOR;
    multipliers.push({ name: "ratio_3_ele", value: eleRatio });

    // ratio_4: critical = 1.5x
    const critRatio = (flags.isCritical && req.canTriggerCritical) ? CRIT_MULTIPLIER : 1.0;
    if (critRatio !== 1.0) multipliers.push({ name: "ratio_4_crit", value: critRatio });

    // ratio_8: defense reduction = 1 - targetDef / (targetDef + attackerLevel * 200)
    const def = req.targetStats?.defense ?? 0;
    const atkLvl = req.attackerLevel ?? 70;
    const defRatio = 1 - def / (def + atkLvl * DEF_DIVISOR);
    multipliers.push({ name: "ratio_8_def", value: defRatio });

    // Counter bonus (破招) = 1.25x
    let counterMult = 1.0;
    if (flags.isCounter && req.canTriggerCounter) {
      counterMult = COUNTER_MULTIPLIER;
      multipliers.push({ name: "counter", value: counterMult });
    }

    // Back attack (背击) — no damage bonus in 70-85 classic era
    if (flags.isBackAttack && req.canTriggerBackAttack) {
      multipliers.push({ name: "back_attack", value: 1.0 });
    }

    // Extra multipliers from status effects etc.
    for (const modifier of extraMultipliers) {
      multipliers.push(modifier);
    }

    // Compute final multiplier (10-multiplier structure)
    // Stage 3 T-A.9 (2026-05-30) quick fix: atkPower 是基数, 不是乘数.
    // baseDamage 解释为 skill% (per-hit 占 atkPower 的百分比), 除以 100 还原.
    // 之前 multiplier 把 atkPower 当乘数, 1800 atkPower × baseDmg(10) = 18000 一击秒杀.
    // 现在 atkPower 81 × skill%(0.10) × statRatio(2.92) ≈ 24 per hit.
    //
    // 例外: status DOT (sourceKind=status_dot) 不走 skill% × atkPower 模型, 是 DOT 平伤.
    // PVE 状态 DOT 来自 status profile.dotDamagePerStack 的硬值 (bleed=6, poison=5 等),
    // 直接当 finalDamage flat (× defRatio).
    const isStatusDot = req.sourceKind === "status_dot";
    const skillPercent = req.baseDamage / 100;
    let multiplier = statRatio
      * R_ATK_POWER_PCT     // ratio_2 (future, equipment)
      * eleRatio             // ratio_3
      * critRatio            // ratio_4
      * R_BUFF               // ratio_5 (future)
      * R_SKILL_ATK          // ratio_6 (future)
      * R_ATK_REINFORCE      // ratio_7 (future)
      * defRatio             // ratio_8
      * R_MISC               // ratio_9 (future)
      * counterMult
      / FINAL_DIVISOR;

    for (const modifier of extraMultipliers) {
      multiplier *= modifier.value;
    }

    // base = atkPower × skill% (DNF 70-85 真值公式). Status DOT 退回 baseDamage flat.
    const base = isStatusDot ? req.baseDamage : (atkPower || 1.0) * skillPercent;
    // Status DOT 也跳过 statRatio (它已经在配置里"per stack"), 只 keep defRatio.
    const effMultiplier = isStatusDot ? defRatio : multiplier;

    return {
      finalDamage: damageAllowed ? Math.max(0, Math.floor(base * effMultiplier)) : 0,
      multipliers,
    };
  }
}
