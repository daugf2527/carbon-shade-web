/**
 * Actor.ts — Runtime entity initialized from shard data (Phase 3 T3.3)
 */

import { ActorState, ActorStateMachine } from "./ActorStateMachine.js";

export type ActorKind = "player" | "monster";

export interface ActorStats {
  readonly hpMax: number;
  readonly mpMax: number;
  readonly moveSpeed: number;
  readonly physicalAttack: number;
  readonly physicalDefense: number;
}

/** Extract level-1 base value from a growth array field. */
function growthBase(field: { values: number[] } | null | undefined): number {
  if (!field?.values?.length) return 0;
  // values[0] = base, values[1..] = per-level increments
  return field.values[0];
}

/** Extract scalar value from a shard field (may be wrapped or raw). */
function scalarVal(field: { value?: number; values?: number[] } | number | null | undefined): number {
  if (field == null) return 0;
  if (typeof field === "number") return field;
  if (typeof field.value === "number") return field.value;
  if (Array.isArray(field.values) && field.values.length) return field.values[0];
  return 0;
}

export function statsFromPlayerShard(chr: Record<string, unknown>): ActorStats {
  const growth = chr.growth as Record<string, { values: number[] }> | undefined;
  return {
    hpMax: growthBase(growth?.hpMax),
    mpMax: growthBase(growth?.mpMax),
    moveSpeed: scalarVal(chr.moveSpeed as never),
    physicalAttack: growthBase(growth?.physicalAttack),
    physicalDefense: growthBase(growth?.physicalDefense),
  };
}

// Goblin base stats (level-1 reference values from DNF wiki / local_baseline)
const GOBLIN_BASE: ActorStats = {
  hpMax: 70,
  mpMax: 0,
  moveSpeed: 300,
  physicalAttack: 10,
  physicalDefense: 5,
};

export function statsFromMonsterShard(mob: Record<string, unknown>): ActorStats {
  type CatEntry = { op: "*" | "+"; value: number };
  const cat = (mob.abilityCategory as { value?: Record<string, CatEntry> } | null)?.value ?? {};
  const applyEntry = (base: number, entry: CatEntry | undefined, defaultPct = 100): number =>
    entry === undefined
      ? Math.round(base * defaultPct / 100)
      : entry.op === "+"
        ? Math.round(base + entry.value)
        : Math.round(base * entry.value / 100);
  return {
    hpMax: applyEntry(GOBLIN_BASE.hpMax, cat["hp max"]),
    mpMax: 0,
    moveSpeed: scalarVal(mob.moveSpeed as never),
    physicalAttack: applyEntry(GOBLIN_BASE.physicalAttack, cat["equipment_physical_attack"]),
    physicalDefense: applyEntry(GOBLIN_BASE.physicalDefense, cat["equipment_physical_defense"]),
  };
}

export class Actor {
  readonly id: string;
  readonly kind: ActorKind;
  readonly stats: ActorStats;
  readonly fsm: ActorStateMachine;

  hp: number;
  mp: number;
  x = 0;
  y = 0;
  facing = 1; // 1 = right, -1 = left

  constructor(id: string, kind: ActorKind, stats: ActorStats) {
    this.id = id;
    this.kind = kind;
    this.stats = stats;
    this.hp = stats.hpMax;
    this.mp = stats.mpMax;
    this.fsm = new ActorStateMachine(ActorState.IDLE, (from, to, tick) => {
      console.log(`[Actor:${id}] tick=${tick} ${from}→${to}`);
    });
  }

  get isDead(): boolean {
    return this.hp <= 0;
  }
}
