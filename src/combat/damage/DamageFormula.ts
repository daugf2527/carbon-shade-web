import type { DamageRequest } from "../types.js";

// ============================================================
// Local baseline damage formula
// ============================================================
//
// This is a small-scale deterministic demo formula. The ratio_* names are
// trace buckets for future data import; they are not treated as an official
// or complete DNF damage formula in runtime.
//
// ratio_0: 力智系数 = STR/250 + 1
// ratio_1: 攻击力 = AtkP/AtkM/AtkI + BUFF加成
// ratio_2: 攻击力% = PAtkP/PAtkM/PAtkI
// ratio_3: 属强系数 = max(火/冰/光/暗) * 0.0045 + 1.05
// ratio_4: 暴击倍率 = 1.5
// ratio_5: BUFF系数 = character buff
// ratio_6: 技攻系数 = SkillAttack * (1 + 玉技攻)
// ratio_7: 攻击强化 = 1 + Attack/100 * AttackP
// ratio_8: 防御减伤 = 1 - def / (def + 200 * 难度)
// ratio_9: 杂项 = 属性白字等
//
// Prototype defaults: ratios 1,2,5,6,7,9 pass through at 1.0 because
// equipment, buff and jade systems are not implemented yet.

// Core DNF constants (verified from dcalc + DFO Wiki)
const STR_DIVISOR       = 250;    // 每250力量翻倍基础攻击
const ELE_COEFF         = 0.0045; // 每点属强增加0.45%伤害
const ELE_BASE          = 1.05;   // 基础5%属强增伤
const CRIT_MULTIPLIER   = 1.5;    // 暴击1.5倍
const DEF_DIVISOR       = 200;    // 防御公式除常数
const DIFFICULTY_FACTOR = 100;    // 难度系数
const FINAL_DIVISOR     = 1;      // Combat Lab uses small-scale damage (10-30), not MMO-scale (millions)   // MMO最终除数(current baseDamage not scaled, use 1)

// Future ratio defaults (pass-through until systems exist)
const R_ATK_POWER       = 1.0; // ratio_1: 物/魔/独立攻击力
const R_ATK_POWER_PCT   = 1.0; // ratio_2: 攻击力%
const R_BUFF            = 1.0; // ratio_5: BUFF系数
const R_SKILL_ATK       = 1.0; // ratio_6: 技攻
const R_ATK_REINFORCE   = 1.0; // ratio_7: 攻击强化
const R_MISC            = 1.0; // ratio_9: 杂项

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

    // ratio_0: 力智系数
    const strRatio = 1 + (req.attackerStats?.strength ?? 0) / STR_DIVISOR;
    multipliers.push({ name: "ratio_0_str", value: strRatio });

    // ratio_3: 属强系数
    const eleDmg = req.attackerStats?.elementalDamage ?? 0;
    const eleRatio = eleDmg * ELE_COEFF + ELE_BASE;
    multipliers.push({ name: "ratio_3_ele", value: eleRatio });

    // ratio_4: 暴击
    const critRatio = (flags.isCritical && req.canTriggerCritical) ? CRIT_MULTIPLIER : 1.0;
    if (critRatio !== 1.0) multipliers.push({ name: "ratio_4_crit", value: critRatio });

    // ratio_8: 防御减伤
    const def = req.targetStats?.defense ?? 0;
    const defRatio = 1 - def / (def + DEF_DIVISOR * DIFFICULTY_FACTOR);
    multipliers.push({ name: "ratio_8_def", value: defRatio });

    // Counter bonus
    let counterMult = 1.0;
    if (flags.isCounter && req.canTriggerCounter) {
      counterMult = 1.25;
      multipliers.push({ name: "counter", value: counterMult });
    }

    // Back attack (currently no bonus)
    if (flags.isBackAttack && req.canTriggerBackAttack) {
      multipliers.push({ name: "back_attack", value: 1.0 });
    }

    // Extra multipliers
    for (const modifier of extraMultipliers) {
      multipliers.push(modifier);
    }

    // Compute final multiplier (10-multiplier structure)
    let multiplier = strRatio
      * R_ATK_POWER       // ratio_1 (future)
      * R_ATK_POWER_PCT   // ratio_2 (future)
      * eleRatio           // ratio_3
      * critRatio          // ratio_4
      * R_BUFF             // ratio_5 (future)
      * R_SKILL_ATK        // ratio_6 (future)
      * R_ATK_REINFORCE    // ratio_7 (future)
      * defRatio           // ratio_8
      * R_MISC             // ratio_9 (future)
      * counterMult        // counter bonus
      / FINAL_DIVISOR;

    for (const modifier of extraMultipliers) {
      multiplier *= modifier.value;
    }

    return {
      finalDamage: damageAllowed ? Math.max(0, Math.floor(req.baseDamage * multiplier)) : 0,
      multipliers,
    };
  }
}
