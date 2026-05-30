/**
 * StatusEffectSystem.ts — Freeze/Poison/Slow status effects (Phase 4 T4.4)
 */

export type StatusKind = "freeze" | "poison" | "slow";

export interface StatusEffect {
  readonly kind: StatusKind;
  readonly durationMs: number;
  readonly value: number; // damage/tick for poison; speed multiplier for slow; unused for freeze
  appliedAtMs: number;
}

export class StatusEffectSystem {
  private effects = new Map<StatusKind, StatusEffect>();

  apply(effect: StatusEffect): void {
    // Refresh if same kind already active
    this.effects.set(effect.kind, { ...effect });
  }

  /** Returns poison damage dealt this tick (0 if none). */
  tick(nowMs: number, tickMs: number): { poisonDmg: number; speedMult: number; frozen: boolean } {
    let poisonDmg = 0;
    let speedMult = 1;
    let frozen = false;

    for (const [kind, eff] of this.effects) {
      const elapsed = nowMs - eff.appliedAtMs;
      if (elapsed >= eff.durationMs) {
        this.effects.delete(kind);
        continue;
      }
      if (kind === "poison") poisonDmg += Math.round(eff.value * (tickMs / 1000));
      if (kind === "slow") speedMult = Math.min(speedMult, eff.value);
      if (kind === "freeze") frozen = true;
    }

    return { poisonDmg, speedMult, frozen };
  }

  has(kind: StatusKind): boolean {
    return this.effects.has(kind);
  }

  clear(): void {
    this.effects.clear();
  }
}
