// Swordman shared hit-reaction motions — derivation layer.
//
// This file is the BRIDGE between the raw .ani frame data (animations.ts) and
// the higher-level "what happens when this character is hit" semantics used by
// the combat kernel.
//
// All raw .ani frame data here is Tier-1 (PVF-extracted). The mapping between
// damage-type and which .ani plays is Tier 3 (local_baseline) — based on
// canonical DNF conventions, requires manual verification against engine
// dispatch logic.
//
// Source raw .ani:
//   damage1.ani  — 1 frame, delay=10000 (engine-driven release).
//   damage2.ani  — 1 frame, delay=10000.
//   hitback.ani  — 9 frames, total ~850ms.
//   down.ani     — 6 frames, ~660ms timed + external waits.
//   overturn.ani — 1 frame, delay=10000 (special aniOffset for lying pose).
//
// The aniOffset for `overturn.ani` is (-226, -246), NOT the default (-232, -333).
// That difference is authentic: when the character is on the ground (lying),
// the sprite's pivot relative to the feet anchor shifts. Renderer MUST use the
// per-frame aniOffset, not the body-default aniOffset.
//
// Note: swordman.chr does NOT define a "death motion" slot. The "getup" /
// "quick rebound" / "death" animations live on shared 'common/' .ani's (not
// in character/swordman/animation/). They are deferred to a future extraction
// pass that scans character/common/.

import type { Provenance } from "../../../../combat/types.js";

const baselineProv: Provenance = {
  sourceType: "local_baseline",
  sourceRef: "derived from canonical DNF hit-reaction convention",
  capturedAt: "2026-05-21",
  version: "Script.pvf v66282",
  confidence: "low",
  requiresCalibration: true,
  requiresManualVerification: true,
  notes: "Mapping from .atk hit reaction kind to .ani motion is convention; engine dispatch logic must be reverse-engineered to lock the rule.",
  falsifiableBy: "decompile DNF.exe combat reaction dispatch (or sample in-game frame-by-frame).",
};

const aniProv = (aniName: string): Provenance => ({
  sourceType: "pvf_extraction",
  sourceRef: `pvf:character/swordman/animation/${aniName}.ani`,
  capturedAt: "2026-05-21",
  version: "Script.pvf v66282",
  confidence: "high",
  requiresCalibration: false,
  notes: "Raw .ani frames are PVF truth; engine-side delay-event tags not extracted.",
});

// ---------------------------------------------------------------------------
// Hit reaction kind -> default motion mapping (Tier-3 baseline)
// ---------------------------------------------------------------------------
export type SwordmanHitReactionKind =
  | "hit_horizon"    // light hit, horizontal flinch
  | "hit_down"       // medium hit, ground-leaning flinch
  | "hit_lift_up"    // launch (.atk lift_up triggers airborne)
  | "knockback"      // big push (hitback.ani)
  | "knockdown"      // forced down (down.ani)
  | "overturn"       // overturned / face-up downed
  | "stun"           // stun status overlay
  | "bounce";        // wall/floor bounce

export interface SwordmanMotionMapping {
  reaction: SwordmanHitReactionKind;
  /** Which .ani plays. */
  motion: string;
  provenance: Provenance;
}

export const SWORDMAN_HIT_REACTION_MAPPING: SwordmanMotionMapping[] = [
  { reaction: "hit_horizon", motion: "damage1",  provenance: baselineProv },
  { reaction: "hit_down",    motion: "damage2",  provenance: baselineProv },
  { reaction: "hit_lift_up", motion: "damage1",  provenance: baselineProv }, // immediate frame, then airborne arc via lift_up
  { reaction: "knockback",   motion: "hitback",  provenance: baselineProv },
  { reaction: "knockdown",   motion: "down",     provenance: baselineProv },
  { reaction: "overturn",    motion: "overturn", provenance: baselineProv },
  { reaction: "stun",        motion: "damage1",  provenance: baselineProv },
  { reaction: "bounce",      motion: "hitback",  provenance: baselineProv },
];

// ---------------------------------------------------------------------------
// Raw motion truths (.ani -> wall-clock structure)
// ---------------------------------------------------------------------------
export interface SwordmanCoreMotionFact {
  /** Animation name. */
  motion: string;
  framesCount: number;
  /** Sum of `delay` excluding `delay=10000` external waits. */
  totalTimedMs: number;
  /** Frames whose delay is the 10000 'wait-for-event' sentinel. */
  externalWaitFrames: ReadonlyArray<number>;
  /** Anchor (aniOffset) of frame 0 — special-cased for overturn. */
  baseAniOffset: { x: number; y: number };
  provenance: Provenance;
}

/** Tier-1 raw structural facts pulled directly from animations.ts data. */
export const SWORDMAN_CORE_HIT_MOTIONS: Record<string, SwordmanCoreMotionFact> = {
  damage1:  { motion: "damage1",  framesCount: 1, totalTimedMs:     0, externalWaitFrames: [0],        baseAniOffset: { x: -232, y: -333 }, provenance: aniProv("damage1") },
  damage2:  { motion: "damage2",  framesCount: 1, totalTimedMs:     0, externalWaitFrames: [0],        baseAniOffset: { x: -232, y: -333 }, provenance: aniProv("damage2") },
  hitback:  { motion: "hitback",  framesCount: 9, totalTimedMs:   850, externalWaitFrames: [],         baseAniOffset: { x: -232, y: -333 }, provenance: aniProv("hitback") },
  down:     { motion: "down",     framesCount: 6, totalTimedMs:   660, externalWaitFrames: [3, 4],     baseAniOffset: { x: -232, y: -333 }, provenance: aniProv("down") },
  overturn: { motion: "overturn", framesCount: 1, totalTimedMs:     0, externalWaitFrames: [0],        baseAniOffset: { x: -226, y: -246 }, provenance: aniProv("overturn") },
};

// ---------------------------------------------------------------------------
// Reaction selection rules — DERIVED from .atk fields (Tier-2 / Tier-3)
// ---------------------------------------------------------------------------
/**
 * Given a .atk's reaction flags, pick the default motion for the receiving
 * swordman character. The rule below is a working baseline; the engine likely
 * also factors target weight (vs lift_up magnitude), current state (airborne
 * vs grounded), and tolerance accumulation.
 */
export interface SwordmanReactionRule {
  /** .atk hit-reaction kind (from attacks.ts SwordmanHitReaction). */
  trigger:
    | { atkHitReaction: "hit_down" }
    | { atkHitReaction: "hit_lift_up" }
    | { atkHitReaction: "hit_horizon" }
    | { atkCausesDown: true }
    | { atkLiftUp: { gte: number } };
  motion: string;
  provenance: Provenance;
}

export const SWORDMAN_REACTION_RULES: SwordmanReactionRule[] = [
  // Atk.lift_up >= ~200 typically airborne-launches (hitback.atk has 220).
  { trigger: { atkLiftUp: { gte: 200 } }, motion: "hitback", provenance: baselineProv },
  // .atk causesDown — full knockdown.
  { trigger: { atkCausesDown: true },    motion: "down",    provenance: baselineProv },
  { trigger: { atkHitReaction: "hit_lift_up" }, motion: "hitback", provenance: baselineProv },
  { trigger: { atkHitReaction: "hit_down" },    motion: "damage2", provenance: baselineProv },
  { trigger: { atkHitReaction: "hit_horizon" }, motion: "damage1", provenance: baselineProv },
];

// ---------------------------------------------------------------------------
// Open questions — Tier-2 evidence needed
// ---------------------------------------------------------------------------
export const SWORDMAN_MOTION_OPEN_QUESTIONS: ReadonlyArray<string> = [
  "Death motion: swordman.chr has no 'death motion' slot. Where is the death ani referenced?",
  "Getup motion: no 'getup' slot in chr. Look in character/common/ or check engine default.",
  "Quick rebound: 'quickstanding' skill exists, but the rebound ani path is not in chr motion table.",
  "Frame-by-frame delay_event tags (jump_up_start, attack_cancel_window_start) are NOT extracted by current dnf-extract.exe .ani parser.",
];
