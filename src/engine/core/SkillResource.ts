/**
 * SkillResource.ts — Cooldown + MP cost tracking (Phase 4 T4.2)
 */

export interface SkillDef {
  readonly skillId: string;
  readonly cooldownMs: number;
  readonly mpCost: number;
  readonly castingMs: number;
}

export class SkillResource {
  private cooldowns = new Map<string, number>(); // skillId → ready-at-ms

  canUse(skill: SkillDef, nowMs: number, currentMp: number): boolean {
    const readyAt = this.cooldowns.get(skill.skillId) ?? 0;
    return nowMs >= readyAt && currentMp >= skill.mpCost;
  }

  use(skill: SkillDef, nowMs: number): void {
    this.cooldowns.set(skill.skillId, nowMs + skill.cooldownMs);
  }

  remainingMs(skill: SkillDef, nowMs: number): number {
    return Math.max(0, (this.cooldowns.get(skill.skillId) ?? 0) - nowMs);
  }
}

/** Parse SkillDef from shard skill JSON. */
export function parseSkillDef(skillId: string, raw: Record<string, unknown>): SkillDef {
  const ct = raw.coolTime as { dungeonMs?: number } | undefined;
  const mp = raw.consumeMp as { baseMp?: number } | undefined;
  const cast = raw.castingTime as { baseMs?: number } | undefined;
  return {
    skillId,
    cooldownMs: ct?.dungeonMs ?? 0,
    mpCost: mp?.baseMp ?? 0,
    castingMs: cast?.baseMs ?? 0,
  };
}
