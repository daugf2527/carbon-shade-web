/**
 * MonsterAIConfig.ts — Per-monster AI tuning, PVF-truth-driven where available (03-Monster/AI).
 *
 * EnemyAISystem ran on a hardcoded DEFAULT_CFG (sightRange 200 / attackDelay 60 ticks) with an
 * explicit "to be read from mob shard in P4" TODO. This module is that wiring: it parses a
 * monster's .mob shard into an AI config, so sight + attack cadence come from extracted truth
 * instead of invented constants.
 *
 * ── TRUTH SOURCING (CLAUDE.md confidence tiers) ──────────────────────────────────
 *   sightRange       ← mob.sight.value            PVF tier1 (goblin 300px, no manual-verify flag)
 *   attackDelayTicks ← mob.attackDelay.value(ms)  PVF tier3 (goblin 3000ms → 180 ticks @60Hz)
 *   attackRange      ← LOCAL_BASELINE             no clean scalar in PVF — real reach lives in the
 *                       attack .ani attackBoxes (geometry, not a number). mob.widthBox=[40,10] is
 *                       body width, not strike reach. Kept a tuned proximity gate, honestly flagged.
 *
 * Tick conversion: attackDelay ms → ticks via round at the engine's fixed 60Hz.
 */

const MS_PER_TICK = 1000 / 60;

export interface MonsterAIConfig {
  /** Distance (px) at which the monster notices the player and starts chasing. PVF mob.sight. */
  readonly sightRange: number;
  /** Distance (px) at which the monster stops to attack. LOCAL_BASELINE (no clean PVF scalar). */
  readonly attackRange: number;
  /** Ticks between attack attempts. PVF mob.attackDelay (ms) → ticks. */
  readonly attackDelayTicks: number;
}

/** Engine fallback when a monster carries no shard config (matches the historical hardcode). */
export const DEFAULT_MONSTER_AI_CONFIG: MonsterAIConfig = {
  sightRange: 200,
  attackRange: 80,
  attackDelayTicks: 60,
};

/** attackRange local_baseline (px). No PVF scalar — real reach is in the attack .ani geometry. */
const ATTACK_RANGE_LOCAL_BASELINE = 80;

/** Read a scalar from a mob shard field (`{value}` wrapped or raw number). */
function mobScalar(field: { value?: number } | number | null | undefined): number | undefined {
  if (field == null) return undefined;
  if (typeof field === "number") return field;
  if (typeof field.value === "number") return field.value;
  return undefined;
}

/**
 * Build a MonsterAIConfig from a .mob shard. PVF sight + attackDelay drive the config; missing
 * fields fall back to the engine defaults (never throws — partial shards degrade gracefully).
 */
export function aiConfigFromMobShard(mob: Record<string, unknown>): MonsterAIConfig {
  const sight = mobScalar(mob.sight as never);
  const attackDelayMs = mobScalar(mob.attackDelay as never);
  return {
    sightRange: sight ?? DEFAULT_MONSTER_AI_CONFIG.sightRange,
    attackRange: ATTACK_RANGE_LOCAL_BASELINE,
    attackDelayTicks: attackDelayMs != null
      ? Math.round(attackDelayMs / MS_PER_TICK)
      : DEFAULT_MONSTER_AI_CONFIG.attackDelayTicks,
  };
}

/**
 * Goblin AI config from mirrored PVF truth (sight 300px tier1, attackDelay 3000ms tier3 → 180
 * ticks). Parallels statsFromGoblinTruth() in Actor.ts — wires the CombatScene grunt without
 * browser-side shard loading. The mirrored numbers match verification/baseline-shards/monsters/
 * goblin.json mob.sight / mob.attackDelay (sourceRef pvf:monster/goblin/goblinthrower.mob).
 */
export function aiConfigFromGoblinTruth(): MonsterAIConfig {
  return aiConfigFromMobShard({
    sight: { value: 300 },        // PVF tier1
    attackDelay: { value: 3000 }, // PVF tier3 → 180 ticks
  });
}
