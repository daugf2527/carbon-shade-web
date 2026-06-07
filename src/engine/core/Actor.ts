/**
 * Actor.ts — Runtime entity initialized from shard data (Phase 3 T3.3)
 */

import { ActorState, ActorStateMachine } from "./ActorStateMachine.js";
import type { AirborneState } from "./AirbornePhysicsSystem.js";
import { AnimationPlayer } from "./AnimationPlayer.js";
import type { KnockbackState } from "./KnockbackPhysics.js";
import type { MonsterAIConfig } from "./MonsterAIConfig.js";
import type { ReactionState } from "./ReactionResolver.js";
import { CooldownLedger } from "./ResourcePool.js";
import type { ActiveStatus } from "./StatusEffects.js";

export type ActorKind = "player" | "monster";

/** Per-tick input intent for an actor (P3.0). dir: -1 left, 0 none, 1 right. */
export interface ActorIntent {
  attack: boolean;
  dir: -1 | 0 | 1;
  /** Z-axis (depth) direction: -1 up (toward screen back), 0 none, 1 down (toward screen front). Stage 4A. */
  zDir?: -1 | 0 | 1;
  /** Full 4-way command direction this frame (skill-action infra §2). Inline union mirrors
   *  input/InputCommand DirInput (kept inline to avoid a core→input dependency). Omit → "none". */
  commandDir?: "left" | "right" | "up" | "down" | "none";
  /** Skill/buff/jump/attack button pressed this frame (skill-action §2). Mirrors ButtonInput. */
  button?: "attack" | "skill" | "jump" | "buff" | "none";
}

export interface ActorStats {
  readonly hpMax: number;
  readonly mpMax: number;
  readonly moveSpeed: number;
  readonly physicalAttack: number;
  readonly physicalDefense: number;
  /** MP regenerated per MINUTE (PVF chr.growth.mpRegenSpeed; 08-Resource). Omit/0 = no regen
   *  (monsters, test dummies). Optional so inline ActorStats constructions stay terse. */
  readonly mpRegenSpeed?: number;
  /** Hit-stun duration in ms when this actor is hit (PVF: swordman chr.growth.hitRecovery base
   *  600ms, goblin mob.hitRecovery 500ms). Read by ReactionResolver. Omit → DEFAULT_HITSTUN_MS. */
  readonly hitRecovery?: number;
  /** Jump launch velocity (PVF chr.jumpPower, swordman=430, unit ambiguous — see truth-coverage-matrix).
   *  Omit/0 → actor cannot jump. Monsters generally don't jump. */
  readonly jumpPower?: number;
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
    mpRegenSpeed: growthBase(growth?.mpRegenSpeed), // PVF mp/min (swordman base 50)
    hitRecovery: growthBase(growth?.hitRecovery),   // PVF hit-stun ms (swordman base 600)
    jumpPower: scalarVal(chr.jumpPower as never),   // PVF launch velocity (swordman 430)
  };
}

/**
 * Goblin base stats — **local_baseline**, NOT PVF-derived (requiresManualVerification).
 *
 * PVF monster/goblin/*.mob carries NO absolute hp/atk/def numbers: mob.hpMax is null and
 * only `abilityCategory` percent modifiers (op="*"/"+") are extractable. The absolute base
 * an archetype's category multiplies against lives in DNF.exe, not PVF — so these numbers are
 * a hand-tuned reference, the documented gap per CLAUDE.md's "已知缺口" rule. This object is
 * the `base` input to statsFromMonsterShard; abilityCategory (the multiplier) is the real
 * PVF truth, the base is the placeholder.
 */
const GOBLIN_BASE: ActorStats = {
  hpMax: 70,
  mpMax: 0,
  moveSpeed: 300,
  physicalAttack: 10,
  physicalDefense: 5,
  mpRegenSpeed: 0, // monsters don't regen MP
};

/**
 * Goblin abilityCategory — **mirrored** from verification/baseline-shards/monsters/goblin.json
 * (sourceRef: pvf:monster/goblin/goblinthrower.mob). The percent modifiers ARE PVF-extracted
 * truth (extractorVersion v2.0.0); only the base they apply to (GOBLIN_BASE) is local_baseline.
 *
 * Inline because goblin has no TS truth SOT (unlike swordman.ts) and the browser cannot load
 * verification/ JSON (not in the Vite bundle). This is a controlled, audit-tracked temporary
 * mirror — replace with `import { GOBLIN_TRUTH } from ".../truth/goblin.js"` once that SOT lands.
 * Applied: hp 70→46 (×65%), atk 10→8 (×75%), def 5→4 (×80%). moveSpeed 350 (PVF, engine
 * does not consume moveSpeed yet — see CombatScene wiring notes).
 */
const GOBLIN_TRUTH = {
  abilityCategory: {
    value: {
      "hp max": { op: "*" as const, value: 65 },
      equipment_physical_attack: { op: "*" as const, value: 75 },
      equipment_physical_defense: { op: "*" as const, value: 80 },
    },
  },
  moveSpeed: { values: [350, 350] },
  hitRecovery: { values: [500, 500] }, // PVF mob.hitRecovery ms (goblinthrower.mob, tier3)
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
    mpRegenSpeed: 0, // monsters don't regen MP
    hitRecovery: scalarVal(mob.hitRecovery as never) || undefined, // PVF mob.hitRecovery ms (goblin 500)
  };
}

/**
 * Convenience: goblin stats from the mirrored GOBLIN_TRUTH category (PVF truth modifiers over
 * local_baseline GOBLIN_BASE). Wires statsFromMonsterShard at the CombatScene instantiation
 * point without requiring browser-side shard loading. Returns {hpMax:46, atk:8, def:4, moveSpeed:350}.
 */
export function statsFromGoblinTruth(): ActorStats {
  return statsFromMonsterShard(GOBLIN_TRUTH as unknown as Record<string, unknown>);
}

export class Actor {
  readonly id: string;
  readonly kind: ActorKind;
  readonly stats: ActorStats;
  readonly fsm: ActorStateMachine;
  readonly animationPlayer: AnimationPlayer;

  hp: number;
  mp: number;
  x = 0;
  y = 0;
  z = 0; // 2.5D depth coordinate (0 = neutral plane)
  facing = 1; // 1 = right, -1 = left

  /** Active hit-reaction (hitstun) state; null when not in hitstun. P3.0 per-actor work state (like fsm). */
  reaction: ReactionState | null = null;
  /** Active airborne (launch) physics state; null when grounded. P3.0 per-actor work state. */
  airborne: AirborneState | null = null;
  /** Active horizontal-knockback slide state; null when not sliding. Mirrors `airborne` —
   *  KnockbackSystem integrates it and syncs actor.x. (P4-GAP fill, pushAside truth-driven.) */
  knockback: KnockbackState | null = null;
  /** Active DOT/status effects (09-Status). Per-actor work state like reaction/airborne;
   *  written by StatusSystem (apply on hit + tick DOT). Empty when no status active. */
  statusEffects: ActiveStatus[] = [];
  /** Per-actor skill cooldown ledger (08-Resource). Tick-based; ResourceSystem decrements it
   *  each frame and trySpendForSkill starts entries. MP itself is the `mp` field above. */
  readonly cooldowns = new CooldownLedger();
  /** Monster AI config (03-Monster/AI). PVF-truth sight/attackDelay; read by EnemyAISystem.
   *  Undefined for the player + monsters with no shard config (EnemyAISystem falls back). */
  aiConfig?: MonsterAIConfig;
  /** Frame input intent (P3.0). Written by the scene/recorder/AI; read by InputSystem.
   *  Decoupled from CombatScene's BrowserInputState — engine only sees abstract intent. */
  intent: ActorIntent = { attack: false, dir: 0 };
  /** Current action name set by ActionSystem on play. Read by render layer for sprite selection. */
  currentActionName: string | null = null;
  /** Locomotion state for render layer: idle/walk/run. Set by MovementSystem. */
  locomotion: "idle" | "walk" | "run" = "idle";
  /** Active buff list (P3.1 placeholder — engine has no buff system yet). */
  buffs: Array<{ type: string; stacks: number; expiresAtTick: number }> = [];

  constructor(id: string, kind: ActorKind, stats: ActorStats) {
    this.id = id;
    this.kind = kind;
    this.stats = stats;
    this.hp = stats.hpMax;
    this.mp = stats.mpMax;
    this.fsm = new ActorStateMachine(ActorState.IDLE);
    this.animationPlayer = new AnimationPlayer();
  }

  get isDead(): boolean {
    return this.hp <= 0;
  }
}
