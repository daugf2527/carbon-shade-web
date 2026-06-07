/**
 * ComboPressure.ts — 连击压力衰减 (combo pressure: damage + launch decay) — Stage 4C Batch 4.
 *
 * NOTE: distinct from the existing ComboCorrection.ts (which is positional SNAP — pulling a target
 * toward the attacker so hits connect). THIS module is the DNF combo-DECAY mechanic: each hit on a
 * target raises a "pressure" gauge; as the gauge climbs that target takes LESS damage (damageScale
 * → min) and resists launch more (launchResistance → max). After comboResetFrames of no hits the
 * gauge resets. This is what stops an infinite full-damage juggle. Ported from the old kernel
 * src/combat/combo/ComboCorrection.ts (applyComboCorrectionFromHit + derived-state math).
 *
 * The combo state is per-DEFENDER (受击累计): the more a target is comboed, the more it resists.
 *
 * ── ENGINE ADAPTATION ────────────────────────────────────────────────────────────
 * The old kernel keyed buckets off its richer ReactionKind ("launch"/"air_hitstun"/"downed"/...)
 * + a HitDecision object. The engine's ReactionKind is the 4-value "hit"|"down"|"airborne"|
 * "stagger"; this port classifies airborne→aerial, down→down, hit/stagger→stand, and reads
 * attackLevel directly. Decay is a hard reset after comboResetFrames (the old kernel had no
 * explicit decay loop — added here per the handoff).
 *
 * ⚠️ requiresManualVerification — ALL config numbers are local_baseline, mirrored from the old
 * kernel DEFAULT_COMBO_CORRECTION_CONFIG (sourceRef docs/design/tuning-baseline.md). DNF's real
 * combo-correction table is hardcoded in DNF.exe and NOT extractable from PVF.
 */
import type { ReactionKind } from "./ReactionResolver.js";

export interface ComboConfig {
  readonly barMax: number;
  readonly standHitAdd: number;
  readonly standHeavyBonus: number;   // extra gauge for attackLevel >= 2
  readonly airHitAdd: number;
  readonly airLaunchBonus: number;    // extra gauge when the hit itself launches
  readonly downHitAdd: number;
  readonly gravityScaleMax: number;   // airGauge full → gravity ×this (faster fall; AirborneSystem wiring pending)
  readonly launchResistanceMax: number; // airGauge full → launch vy ÷this
  readonly damageScaleMin: number;    // pressure full → damage ×this (floor)
  readonly comboResetFrames: number;  // frames of no-hit before the gauge resets
}

/** local_baseline combo-correction tuning (mirrors old kernel DEFAULT_COMBO_CORRECTION_CONFIG). */
export const DEFAULT_COMBO_CONFIG: ComboConfig = {
  barMax: 10000,
  standHitAdd: 420,
  standHeavyBonus: 180,
  airHitAdd: 380,
  airLaunchBonus: 90,
  downHitAdd: 650,
  gravityScaleMax: 2.4,
  launchResistanceMax: 1.8,
  damageScaleMin: 0.15,
  comboResetFrames: 180,
};

export interface ComboState {
  standGauge: number;
  airGauge: number;
  downGauge: number;
  comboHitCount: number;
  framesSinceLastHit: number;
  /** Derived: airGauge full → gravity ×gravityScaleMax (AirborneSystem wiring is a Batch 4 follow-up). */
  gravityScale: number;
  /** Derived: airGauge full → launch vy ÷launchResistance (applied in ReactionResolver). */
  launchResistance: number;
  /** Derived: pressure full → damage ×damageScale (applied in CombatResolutionSystem). */
  damageScale: number;
}

export function createComboState(): ComboState {
  return {
    standGauge: 0, airGauge: 0, downGauge: 0, comboHitCount: 0, framesSinceLastHit: 0,
    gravityScale: 1, launchResistance: 1, damageScale: 1,
  };
}

function clampGauge(value: number, config: ComboConfig): number {
  return Math.max(0, Math.min(config.barMax, value));
}

/** Map an engine ReactionKind to a pressure bucket. */
export function classifyComboBucket(kind: ReactionKind): "stand" | "aerial" | "down" {
  if (kind === "airborne") return "aerial";
  if (kind === "down") return "down";
  return "stand"; // hit + stagger
}

/** Recompute the derived multipliers (gravityScale / launchResistance / damageScale) from gauges. */
export function refreshComboDerived(state: ComboState, config: ComboConfig = DEFAULT_COMBO_CONFIG): void {
  const airRatio = clampGauge(state.airGauge, config) / config.barMax;
  const pressureRatio = Math.max(
    clampGauge(state.standGauge, config) / config.barMax,
    clampGauge(state.airGauge, config) / config.barMax,
    clampGauge(state.downGauge, config) / config.barMax,
  );
  state.gravityScale = 1 + (config.gravityScaleMax - 1) * airRatio;
  state.launchResistance = 1 + (config.launchResistanceMax - 1) * airRatio;
  state.damageScale = Math.max(config.damageScaleMin, 1 - (1 - config.damageScaleMin) * pressureRatio);
}

/**
 * Accumulate one hit into the defender's combo pressure, then refresh the derived multipliers.
 * Call AFTER reading the current damageScale/launchResistance for this hit (so hit N is scaled by
 * the pressure from hits 1..N-1, and the first hit lands at full value).
 */
export function applyComboFromHit(
  state: ComboState,
  kind: ReactionKind,
  attackLevel: number,
  config: ComboConfig = DEFAULT_COMBO_CONFIG,
): void {
  const bucket = classifyComboBucket(kind);
  if (bucket === "stand") {
    state.standGauge = clampGauge(state.standGauge + config.standHitAdd + (attackLevel >= 2 ? config.standHeavyBonus : 0), config);
  } else if (bucket === "aerial") {
    state.airGauge = clampGauge(state.airGauge + config.airHitAdd + config.airLaunchBonus, config);
  } else {
    state.downGauge = clampGauge(state.downGauge + config.downHitAdd, config);
  }
  state.framesSinceLastHit = 0;
  state.comboHitCount += 1;
  refreshComboDerived(state, config);
}

/** True while any pressure is built up (used to skip decay work). */
export function hasComboPressure(state: ComboState): boolean {
  return state.standGauge > 0 || state.airGauge > 0 || state.downGauge > 0 || state.comboHitCount > 0;
}

/** Zero all gauges + reset derived multipliers to neutral. */
export function resetComboState(state: ComboState, config: ComboConfig = DEFAULT_COMBO_CONFIG): void {
  state.standGauge = 0;
  state.airGauge = 0;
  state.downGauge = 0;
  state.comboHitCount = 0;
  state.framesSinceLastHit = 0;
  refreshComboDerived(state, config);
}

/**
 * Per-tick decay: count frames since the last hit; once the combo has gone comboResetFrames frames
 * without a new hit, the pressure resets (the combo "dropped"). Called by ComboSystem each tick.
 */
export function tickComboDecay(state: ComboState, config: ComboConfig = DEFAULT_COMBO_CONFIG): void {
  if (!hasComboPressure(state)) return;
  state.framesSinceLastHit += 1;
  if (state.framesSinceLastHit > config.comboResetFrames) {
    resetComboState(state, config);
  }
}
