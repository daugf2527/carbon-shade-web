// DNF Physics Constants — extracted from dnf_enum_header.nut (Script.pvf, sqr/dnf_enum_header.nut)
// Reverse-engineered 2026-05. Source: DNF PVF /sqr/dnf_enum_header.nut lines 1251–1280.
// These are engine-level global constants shared by all characters and objects.
// Per-skill launch curves, gravity curves, and hitstun frame tables are not here —
// those are hardcoded in the C++ engine binary (see docs/research/pvf-ani-toolchain-research.md).
export const DNF_PHYSICS_CONSTANTS = {
  // ── Gravity & Velocity ──
  /** Default gravity acceleration (negative = downward). Unit: game units/s² */
  defaultGravityAccel: -1500,

  /** Velocity conversion: velocity = force × const / weight */
  forceToVelocityConst: 4000,

  // ── Move Speeds (at 100% speed baseline) ──
  /** Horizontal movement velocity at SPEED_VALUE_DEFAULT (1000) */
  xNormalMoveVelocity: 143,

  /** Vertical movement velocity at SPEED_VALUE_DEFAULT (1000) */
  yNormalMoveVelocity: 114,

  /** 100% speed baseline value */
  speedValueDefault: 1000,

  // ── Object Weight Thresholds ──
  /** Objects below this weight are "light" */
  lightObjectMaxWeight: 60000,

  /** Objects below this weight are "medium"; above = "heavy" */
  middleObjectMaxWeight: 100000,

  // ── Down Parameter Types ──
  /** Down param types control how an actor falls after being knocked down */
  downParamType: {
    /** Apply velocity immediately on down */
    value: 0,
    /** Apply force continuously during down */
    force: 1,
    /** Bounce: apply velocity at bounce point (value-based) */
    bounceValue: 2,
    /** Bounce: apply force at bounce point */
    bounceForce: 3,
    /** Bounce: generic bounce */
    bounce: 4,
  },

  // ── Knockback Types ──
  knockBackType: {
    normal: 0,
    strong: 1,
    weak: 2,
    none: 3,
    custom: 4,
  },

  // ── Z-Axis Acceleration Types ──
  zAccelType: {
    /** Standard world gravity */
    gravityWorld: 0,
    /** Object-specific gravity */
    gravityObject: 1,
    /** Anti-gravity for objects */
    antiGravityObject: 2,
  },

  // ── Status Effect Timing ──
  /** Hit recovery status type ID (used in CHANGE_STATUS_TYPE enum) */
  hitRecoveryStatusType: 34,

  /** Melee hit delay status type ID */
  meleeHitDelayStatusType: 35,
} as const;
