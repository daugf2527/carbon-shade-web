/**
 * ResourcePool.ts — Tick-based MP pool + skill cooldown state + pure logic (08-Resource).
 *
 * Mirrors the engine's per-actor work-state pattern (StatusEffects.ts / ReactionResolver.ts):
 * STATE lives on the Actor (actor.mp + actor.cooldowns), the kernel `ResourceSystem`
 * (kernel/systems/ResourceSystem.ts) ticks regen each frame via the pure functions here.
 *
 * ── NOT the legacy core/SkillResource.ts ─────────────────────────────────────────
 * That Phase-4 class is wall-clock driven (nowMs ready-at timestamps) and never wired into
 * the deterministic kernel. This module is TICK-based (frame counts) so MP regen + cooldown
 * countdown participate in the kernel's replay-deterministic stateHash.
 *
 * ── TRUTH SOURCING (CLAUDE.md confidence tiers) ──────────────────────────────────
 * MP pool + regen + skill cost/cooldown are PVF-extracted truth (tier1):
 *   mpMax        ← chr.growth.mpMax.values[level]            (swordman base 140)
 *   mpRegenSpeed ← chr.growth.mpRegenSpeed.values[level]     (swordman base 50, unit mp/min)
 *   consumeMp    ← skills[id].consumeMp.baseMp               (e.g. icewave 27)
 *   cooldown     ← skills[id].coolTime.dungeonMs             (e.g. icewave 7000ms)
 * Only the per-tick regen CONVERSION (mp/min → mp/tick) is engine arithmetic, documented below.
 */

const TICKS_PER_SECOND = 60;       // engine fixed 60Hz
const SECONDS_PER_MINUTE = 60;
const MS_PER_TICK = 1000 / TICKS_PER_SECOND;

/**
 * Convert PVF mpRegenSpeed (mp per MINUTE, per the 22-system field matrix) to mp per tick.
 * 50 mp/min ÷ 60 s/min ÷ 60 tick/s = 0.01389 mp/tick. Kept fractional (mp is a float pool);
 * callers clamp to mpMax. Pure + deterministic.
 */
export function mpRegenPerTick(mpRegenSpeedPerMinute: number): number {
  return mpRegenSpeedPerMinute / SECONDS_PER_MINUTE / TICKS_PER_SECOND;
}

/** Regenerate MP one tick toward mpMax (never overfills). Returns the new mp value. */
export function regenMp(currentMp: number, mpMax: number, mpRegenSpeedPerMinute: number): number {
  return Math.min(mpMax, currentMp + mpRegenPerTick(mpRegenSpeedPerMinute));
}

/** Convert a PVF cooldown in ms to whole ticks (ceil — a skill is never ready early). */
export function cooldownMsToTicks(cooldownMs: number): number {
  return Math.ceil(cooldownMs / MS_PER_TICK);
}

/**
 * Per-actor cooldown ledger: skillId → ticks remaining. Decrements each tick; entries hit 0
 * are removed (a missing entry == ready). Tick-based so it folds into the kernel stateHash.
 */
export class CooldownLedger {
  private remaining = new Map<string, number>();

  /** True if the skill is off cooldown (no live entry). */
  isReady(skillId: string): boolean {
    return (this.remaining.get(skillId) ?? 0) <= 0;
  }

  /** Ticks left before the skill is ready (0 = ready now). */
  remainingTicks(skillId: string): number {
    return Math.max(0, this.remaining.get(skillId) ?? 0);
  }

  /** Put a skill on cooldown for `cooldownMs` (converted to whole ticks). */
  start(skillId: string, cooldownMs: number): void {
    const ticks = cooldownMsToTicks(cooldownMs);
    if (ticks > 0) this.remaining.set(skillId, ticks);
  }

  /** Advance all cooldowns by one tick; drop any that reach 0. */
  tick(): void {
    for (const [id, left] of this.remaining) {
      const next = left - 1;
      if (next <= 0) this.remaining.delete(id);
      else this.remaining.set(id, next);
    }
  }

  /** Deterministic fingerprint (skillId:ticks pairs, sorted) for the kernel stateHash. */
  fingerprint(): string {
    if (this.remaining.size === 0) return "";
    return [...this.remaining.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([id, t]) => `${id}:${t}`).join(",");
  }

  clear(): void {
    this.remaining.clear();
  }
}

/**
 * Attempt to spend MP + start a skill's cooldown. Returns true if the skill fired (enough MP
 * AND off cooldown), mutating mp/ledger; false if it could not (no state change). The caller
 * supplies the already-resolved truth numbers (cost/cooldown), keeping skill-data lookup out
 * of this generic resource logic.
 */
export function trySpendForSkill(
  pool: { mp: number },
  ledger: CooldownLedger,
  skillId: string,
  mpCost: number,
  cooldownMs: number,
): boolean {
  if (!ledger.isReady(skillId)) return false;
  if (pool.mp < mpCost) return false;
  pool.mp -= mpCost;
  ledger.start(skillId, cooldownMs);
  return true;
}
