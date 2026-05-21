// DNF Engine Physics Constants — Tier-1 truths extracted from PVF.
//
// Source: sqr/dnf_enum_header.nut (Korean comments cite units explicitly).
// Extracted 2026-05-21 via tools/dnf-extract.exe from Script.pvf v66282.
// See docs/research/2026-05-21-dnf-air-physics-phase1.md for full evidence.
//
// All speeds are px/s; all accelerations px/s². Z is height (jump axis) in DNF
// native convention. The project's Vec3 currently uses {x, z, y} with y=height
// — Phase 4 must reconcile this before runtime consumption.

import type { Provenance } from "../../../combat/types.js";

const PVF_HEADER_PROV: Provenance = {
  sourceType: "pvf_extraction",
  sourceRef: "pvf:sqr/dnf_enum_header.nut",
  capturedAt: "2026-05-21",
  version: "Script.pvf v66282",
  confidence: "high",
  requiresCalibration: false,
  notes: "Korean comments cite units (px/s, px/s^2, '1초동안 이동 픽셀 수').",
};

export interface DnfNumericFact {
  value: number;
  unit: string;
  provenance: Provenance;
}

export const DNF_PHYSICS_RAW = {
  /** World default gravity acceleration. Actions may locally override
   *  via sq_SetZVelocity(obj, v0, accel). */
  defaultGravityAccel: { value: -1500, unit: "px/s^2", provenance: PVF_HEADER_PROV },

  /** Horizontal velocity at SPEED_VALUE_DEFAULT (1000). */
  xNormalMoveVelocity: { value: 143, unit: "px/s", provenance: PVF_HEADER_PROV },

  /** Ground-depth (DNF y-axis) velocity at SPEED_VALUE_DEFAULT. */
  yNormalMoveVelocity: { value: 114, unit: "px/s", provenance: PVF_HEADER_PROV },

  /** Diagonal-move horizontal component. */
  xSlantMoveVelocity: { value: 119, unit: "px/s", provenance: PVF_HEADER_PROV },

  /** Diagonal-move depth component. */
  ySlantMoveVelocity: { value: 95, unit: "px/s", provenance: PVF_HEADER_PROV },

  /** Force → velocity conversion: velocity = const × force / weight. */
  forceToVelocityConst: { value: 4000, unit: "v=k*F/w", provenance: PVF_HEADER_PROV },

  /** Speed-percentage baseline: 1000 = 100%. */
  speedValueDefault: { value: 1000, unit: "1000=100%", provenance: PVF_HEADER_PROV },

  /** Weight threshold for "light" audio category — NOT used in physics. */
  lightObjectMaxWeight: { value: 60000, unit: "audio-only", provenance: PVF_HEADER_PROV },

  /** Weight threshold for "medium" audio category — NOT used in physics. */
  middleObjectMaxWeight: { value: 100000, unit: "audio-only", provenance: PVF_HEADER_PROV },
} as const satisfies Record<string, DnfNumericFact>;

/** Per-tick gravity at 60 Hz, derived from defaultGravityAccel.
 *  Pure arithmetic: -1500 px/s² ÷ 60² = -0.4166... px/tick².
 *  No hypothesis — sourceType stays pvf_extraction. */
export const DNF_GRAVITY_PER_TICK_60HZ: DnfNumericFact = {
  value: -1500 / (60 * 60),
  unit: "px/tick^2",
  provenance: {
    ...PVF_HEADER_PROV,
    sourceRef: "derived from DNF_PHYSICS_RAW.defaultGravityAccel @ 60 Hz",
    notes: "Pure arithmetic from PVF gravity constant; no hypothesis.",
  },
};

/** DNF native 3D axis convention. The project's Vec3 reverses y/z — Phase 4
 *  reconciles by either renaming Vec3 or documenting the inversion. */
export const DNF_AXIS_CONVENTION = {
  x: "horizontal (left-right)",
  y: "ground depth (forward-backward on the ground plane)",
  z: "height (jump / vertical axis)",
} as const;

/** Reverse-engineered Squirrel API map for combat physics.
 *  Source: grep across 193 .nut files in sqr/ (see Phase 1 research doc). */
export const DNF_PHYSICS_API = {
  setZVelocity: {
    signature: "sq_SetZVelocity(obj, v0, accel)",
    args: ["initial Z velocity (px/s)", "Z acceleration (px/s^2)"],
    notes: "Used for jumps, upward launches, falling. Sample: elementalrain (750, -1200) → peak 234 px.",
  },
  setVelocity: {
    signature: "sq_SetVelocity(obj, axis, value)",
    args: ["axis (0=X horizontal, 1=Y depth, 2=Z height)", "velocity (px/s)"],
  },
  setCurrentAttackUpForce: {
    signature: "sq_SetCurrentAttacknUpForce(attackInfo, F)",
    args: ["upward launch velocity (px/s)"],
    notes: "Reads from .atk [lift up] field. See attacks.ts.",
  },
  setCurrentAttackBackForce: {
    signature: "sq_SetCurrentAttacknBackForce(attackInfo, F)",
    args: ["backward knockback velocity (px/s)"],
  },
  jumpUpStartFrame: { signature: "sq_JumpUpStartFrame(N)", args: ["rise-phase start frame index"] },
  jumpDownStartFrame: { signature: "sq_JumpDownStartFrame(N)", args: ["descent-phase start frame index"] },
  jumpLandStartFrame: { signature: "sq_JumpLandStartFrame(N)", args: ["landing-phase start frame index"] },
} as const;
