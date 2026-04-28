import type { DamageRequest } from "../types.js";

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
    const multipliers = [{ name: "base", value: 1 }];
    let multiplier = 1;

    if (flags.isCounter && req.canTriggerCounter) {
      multiplier *= 1.25;
      multipliers.push({ name: "counter", value: 1.25 });
    }

    if (flags.isBackAttack && req.canTriggerBackAttack) {
      multiplier *= 1.0;
      multipliers.push({ name: "back_attack", value: 1.0 });
    }

    if (flags.isCritical && req.canTriggerCritical) {
      multiplier *= 1.5;
      multipliers.push({ name: "critical", value: 1.5 });
    }

    for (const modifier of extraMultipliers) {
      multiplier *= modifier.value;
      multipliers.push(modifier);
    }

    return {
      finalDamage: damageAllowed ? Math.max(0, Math.floor(req.baseDamage * multiplier)) : 0,
      multipliers,
    };
  }
}
