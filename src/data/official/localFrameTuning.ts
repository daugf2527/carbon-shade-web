// Local Frame Tuning — Combat Lab Calibrated Baseline
//
// Contains frame windows, hitbox dimensions, cancel windows, hitstop/recoil,
// launch velocities, root motion data, and reaction profiles.
// All values are `source: "local_calibrated_baseline"` — NOT official DNF data.
//
// Official API-backed facts (cooldown, MP cost, damage %, hit count, buff values)
// live in `berserkerSkillFacts.ts` and should never be mixed into this file.
//
// ============================================================================
// Batch A (2026-05-07): Extracted from FrameDataAction.ts to split API facts
// from local tuning per evidence-source-execution-plan.md.
// ============================================================================

import type { HitReactionProfile } from "../../combat/types.js";

// --- Reaction Profiles (Local Baseline) ---
// All hitstun/knockback/launch/gravity/down/getUp values are hand-tuned.
// Official DNF hit reaction curves are NOT exposed by Neople API or wiki.

export const LOCAL_REACTIONS = {
  lightStagger: {
    hitStunFrames: 13,
    knockbackX: 5.4,
    knockbackZ: 0.32,
    horizontalFriction: 0.70,
    downFrames: 0,
    getUpFrames: 0,
  },
  mediumStagger: {
    hitStunFrames: 15,
    knockbackX: 4.8,
    knockbackZ: 0.38,
    horizontalFriction: 0.72,
    downFrames: 0,
    getUpFrames: 0,
  },
  heavyStagger: {
    hitStunFrames: 20,
    knockbackX: 10.8,
    knockbackZ: 0.55,
    launchVelocityY: 0.35,
    horizontalFriction: 0.76,
    downFrames: 0,
    getUpFrames: 0,
  },
  heavyKnockdown: {
    hitStunFrames: 9,
    knockbackX: 6.2,
    knockbackZ: 0.65,
    launchVelocityY: 2.2,
    horizontalFriction: 0.78,
    downFrames: 26,
    getUpFrames: 14,
  },
  upperLaunch: {
    hitStunFrames: 0,
    knockbackX: 3.6,
    knockbackZ: 0.28,
    launchVelocityY: 8.2,
    horizontalFriction: 0.84,
    downFrames: 36,
    getUpFrames: 16,
  },
  bloodPillarLaunch: {
    hitStunFrames: 0,
    knockbackX: 0.45,
    knockbackZ: 0.08,
    launchVelocityY: 4.0,
    horizontalFriction: 0.90,
    downFrames: 26,
    getUpFrames: 12,
  },
  enemyBasicHit: {
    hitStunFrames: 10,
    knockbackX: 3.2,
    knockbackZ: 0.2,
    horizontalFriction: 0.75,
  },
} as const satisfies Record<string, HitReactionProfile>;

// --- Default Hitbox Parameters (Local Baseline) ---
// Default values used by the `hit()` factory in FrameDataAction.ts.
// Actual per-action hitbox overrides are inlined in each action definition.

export const DEFAULT_HITBOX = {
  offsetX: 64,
  offsetZ: 0,
  offsetY: 30,
  w: 110,
  d: 40,
  h: 60,
  maxTargets: 6,
  impactSnapX: 4,
  visualRecoilFrames: 5,
} as const;

// --- Movement Speeds (Local Baseline) ---
// Walk/Run speeds in pixels per tick at 60Hz.

export const MOVEMENT_SPEEDS = {
  walk: 2.45,
  run: 4.15,
} as const;

// --- Cancel Targets (Local Baseline) ---
// The list of combat actions that can be cancelled into from any action.
// This is a design choice, not derived from official data.

export const COMBAT_CANCEL_TARGETS = [
  "NormalBasic1", "NormalBasic2", "NormalBasic3",
  "DashAttack", "Jump", "JumpAttack",
  "FrenzyBasic1", "FrenzyBasic2", "FrenzyBasic3",
  "UpwardSlash", "MountainousWheel", "RagingFury", "Bloodlust",
  "GoreCross", "OutrageBreak", "ExtremeOverkill", "RagingFury2",
  "BloodRuin", "BloodSword", "BurstFury", "EarthShatter",
  "Backstep", "Walk", "Run", "Idle",
] as const;

// --- Default Frame Policy (Local Baseline) ---
// Default hitStop and cancel behavior applied by the `action()` factory.

export const DEFAULT_FRAME_POLICY = {
  /** Whiff cancel opens at totalFrames - this offset */
  whiffCancelFromOffset: 4,
  /** Default hitStop frames for standard actions */
  defaultHitStopFrames: 3,
  /** Boss hitStop cap */
  bossHitStopCap: 2,
  /** Building armor hitStop cap */
  buildingHitStopCap: 1,
} as const;

// --- HitBox Window Counts (Local Baseline) ---
// Per-action active frame hit windows and total frames.
// These are hand-tuned values, NOT derived from official DNF frame data.

export const LOCAL_FRAME_COUNTS = {
  Idle: { totalFrames: 1 },
  NormalBasic1: { totalFrames: 20, startupEnd: 4, activeStart: 5, activeEnd: 8 },
  NormalBasic2: { totalFrames: 22, startupEnd: 5, activeStart: 6, activeEnd: 9 },
  NormalBasic3: { totalFrames: 31, startupEnd: 7, activeStart: 8, activeEnd: 13 },
  DashAttack: { totalFrames: 24, startupEnd: 6, activeStart: 7, activeEnd: 11 },
  Jump: { totalFrames: 22 },
  JumpAttack: { totalFrames: 26, activeStart: 6, activeEnd: 10 },
  FrenzyBasic1: { totalFrames: 18 },
  FrenzyBasic2: { totalFrames: 20 },
  FrenzyBasic3: { totalFrames: 28 },
  UpwardSlash: { totalFrames: 27, startupEnd: 6, activeStart: 7, activeEnd: 11 },
  MountainousWheel: { totalFrames: 45 },
  RagingFury: { totalFrames: 53 },
  Bloodlust: { totalFrames: 34, activeStart: 7, activeEnd: 10 },
  Backstep: { totalFrames: 21, rootMotionFrames: 9 },
  QuickRebound: { totalFrames: 190, maxHoldFrames: 180 },
  GoreCross: { totalFrames: 38 },
  OutrageBreak: { totalFrames: 52, maxHoldFrames: 60 },
  ExtremeOverkill: { totalFrames: 48 },
  RagingFury2: { totalFrames: 60 },
  BloodRuin: { totalFrames: 40 },
  BloodSword: { totalFrames: 55 },
  BurstFury: { totalFrames: 42 },
  EarthShatter: { totalFrames: 35 },
  EnemyBasic: { totalFrames: 36, startupEnd: 8, activeStart: 9, activeEnd: 14 },
} as const;

export type LocalFrameTuningKey = keyof typeof LOCAL_FRAME_COUNTS;

// --- Source provenance ---
export const LOCAL_TUNING_PROVENANCE = {
  sourceType: "local_calibrated_baseline" as const,
  confidence: "medium" as const,
  capturedAt: "2026-05-03",
  version: "combat-data-v1",
  requiresCalibration: true,
  sourceRef: "docs/design/tuning-baseline.md#action-frame-baseline",
} as const;
