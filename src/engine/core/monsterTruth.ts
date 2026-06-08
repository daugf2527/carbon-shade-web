/**
 * monsterTruth.ts — Per-monster PVF truth for multi-monster combat (Stage 4B-B4, 2026-06-08).
 *
 * Re-extracted from data/Script.pvf via tools/dnf-extract.exe (`--file monster/<name>/<name>.mob`)
 * on 2026-06-08. The iconv codeConvert warnings on stderr are non-fatal (they fail on some Korean
 * speech/comment strings only); the section names + numeric values come through clean on stdout.
 *
 * ── TRUTH SOURCING (CLAUDE.md confidence tiers) ──────────────────────────────────
 *   abilityCategory  ← mob "ability category" (hp/atk/def % modifiers)   PVF tier1 (numeric)
 *   sightRange       ← mob "sight"                                       PVF tier1
 *   attackDelayMs    ← mob "attack delay" (ms)                           PVF tier3 (→ ticks)
 *   moveSpeed/weight ← mob "move speed" / "weight"                       PVF (weight audio-only)
 *   hitRecovery      ← mob "hit recovery" (ms)                           PVF
 *
 * Absolute hp/atk/def come from monsterStatsAtLevel: CHARACTER growth curve (generic base) ×
 * abilityCategory% at the dungeon basis level — same proven path the goblinthrower grunt uses.
 * goblinthrower is the existing CombatScene grunt (was inlined there); goblin + skeleton are new.
 */
import type { ActorStats } from "./Actor.js";
import { monsterStatsAtLevel } from "./MonsterScaling.js";
import { type MonsterAIConfig, aiConfigFromMobShard } from "./MonsterAIConfig.js";

export interface MonsterTruth {
  readonly id: string;
  /** mob "ability category": hp/atk/def % modifiers over the character base curve. PVF tier1. */
  readonly abilityCategory: Record<string, { op: "*" | "+"; value: number }>;
  readonly moveSpeed: number;   // PVF mob "move speed"
  readonly weight: number;      // PVF mob "weight" (audio-only; not used in launch physics, Batch 6)
  readonly hitRecovery: number; // PVF mob "hit recovery" (ms)
  readonly sightRange: number;  // PVF mob "sight" (px)
  readonly attackDelayMs: number; // PVF mob "attack delay" (ms)
}

/** Generic character growth arrays (PVF chr.growth) the monster scaling multiplies against. */
export interface CharGrowth {
  readonly hpMax: number[];
  readonly physicalAttack: number[];
  readonly physicalDefense: number[];
}

/**
 * 4 PVF-truth monster types (re-extracted 2026-06-08 from monster/<folder>/<name>.mob).
 *
 * NOTE (armor provenance, investigated 2026-06-08): NONE of these .mob files carry a "super armor" /
 * "damage type" / "stiffness" / "bound count" section — scanned goblin/skeleton/spider, all absent.
 * Super-armor in DNF is NOT a per-monster .mob field (it lives in attack-state / DNF.exe), so the
 * engine ArmorProfile system stays correctly local_baseline — there is no .mob truth to wire from.
 */
export const MONSTER_TRUTH: Record<string, MonsterTruth> = {
  // monster/goblin/goblinthrower.mob — the existing grunt (ranged thrower, slowest attacker).
  goblinthrower: {
    id: "goblinthrower",
    abilityCategory: {
      "hp max": { op: "*", value: 65 },
      equipment_physical_attack: { op: "*", value: 75 },
      equipment_physical_defense: { op: "*", value: 80 },
    },
    moveSpeed: 350, weight: 45000, hitRecovery: 500, sightRange: 300, attackDelayMs: 3000,
  },
  // monster/goblin/goblin.mob — base goblin: faster attacker (1500ms), tougher (hp×70, atk/def×90).
  goblin: {
    id: "goblin",
    abilityCategory: {
      "hp max": { op: "*", value: 70 },
      equipment_physical_attack: { op: "*", value: 90 },
      equipment_physical_defense: { op: "*", value: 90 },
    },
    moveSpeed: 300, weight: 45000, hitRecovery: 500, sightRange: 300, attackDelayMs: 1500,
  },
  // monster/skeleton/skeleton.mob — fast mover (700), long sight (350), heavy (50000), stubborn
  // hit-recovery (800), no stat scaling (×100). A genuinely distinct enemy from the goblins.
  skeleton: {
    id: "skeleton",
    abilityCategory: {
      "hp max": { op: "*", value: 100 },
      equipment_physical_attack: { op: "*", value: 100 },
      equipment_physical_defense: { op: "*", value: 100 },
    },
    moveSpeed: 700, weight: 50000, hitRecovery: 800, sightRange: 350, attackDelayMs: 2000,
  },
  // monster/spider/spider.mob — tankiest grunt (hp×110), mid mover (400), long hit-recovery (800 like
  // skeleton) + fast attacker (1500 like goblin). A slow-recovering bruiser: easy to juggle once
  // launched (long hitRecovery → combo windows), but soaks more hits. Distinct from all three above.
  spider: {
    id: "spider",
    abilityCategory: {
      "hp max": { op: "*", value: 110 },
      equipment_physical_attack: { op: "*", value: 100 },
      equipment_physical_defense: { op: "*", value: 100 },
    },
    moveSpeed: 400, weight: 50000, hitRecovery: 800, sightRange: 300, attackDelayMs: 1500,
  },
};

/** Build a monster's ActorStats at a dungeon basis level (CHARACTER growth × abilityCategory%). */
export function statsForMonster(id: string, basisLevel: number, charGrowth: CharGrowth): ActorStats {
  const m = MONSTER_TRUTH[id];
  if (!m) throw new Error(`[monsterTruth] unknown monster id "${id}" (have: ${Object.keys(MONSTER_TRUTH).join(", ")})`);
  return {
    ...monsterStatsAtLevel(basisLevel, m.abilityCategory, charGrowth, m.moveSpeed, m.weight),
    mpMax: 0, // monsters have no MP
    hitRecovery: m.hitRecovery,
  };
}

/** Build a monster's AI config from its PVF sight + attack delay (03-Monster/AI). */
export function aiConfigForMonster(id: string): MonsterAIConfig {
  const m = MONSTER_TRUTH[id];
  if (!m) throw new Error(`[monsterTruth] unknown monster id "${id}"`);
  return aiConfigFromMobShard({ sight: { value: m.sightRange }, attackDelay: { value: m.attackDelayMs } });
}
