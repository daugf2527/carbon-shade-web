// DNF Character Stats — Tier-1 truths from 11 .chr files.
//
// Source: character/<job>/<job>.chr (PVF). All values decoded from IEEE 754
// integer representations (e.g. "1138163712" → 430.0).
// Extracted 2026-05-21. See docs/research/2026-05-21-dnf-air-physics-phase1.md.
//
// IMPORTANT: jump_power / jump_speed units are AMBIGUOUS — RAW values are
// faithful, but how the C++ engine interprets them is unknown. H1 hypothesis
// (jump_power = px/s, direct v0) is provided as a working derivation but
// flagged `experimental` + `requiresManualVerification: true` until .exe
// reverse engineering closes the unit.

import type { Provenance } from "../../../combat/types.js";
import type { DnfNumericFact } from "./physics.js";
import { DNF_PHYSICS_RAW } from "./physics.js";

export type DnfJobId =
  | "swordman" | "demonicswordman"
  | "gunner" | "atgunner"
  | "priest"
  | "fighter" | "atfighter"
  | "mage" | "atmage" | "creatormage"
  | "thief";

const chrProv = (job: DnfJobId, internalPath: string): Provenance => ({
  sourceType: "pvf_extraction",
  sourceRef: `pvf:character/${internalPath}/${job}.chr`,
  capturedAt: "2026-05-21",
  version: "Script.pvf v66282",
  confidence: "high",
  requiresCalibration: false,
  notes: "Decoded via IEEE 754 little-endian from .chr integer attribute.",
});

const fact = (value: number, unit: string, prov: Provenance): DnfNumericFact =>
  ({ value, unit, provenance: prov });

export interface DnfCharacterStatsRaw {
  jumpPower: DnfNumericFact;
  jumpSpeed: DnfNumericFact;
  moveSpeed: DnfNumericFact;
  attackSpeed: DnfNumericFact;
  weight: DnfNumericFact;
}

// --- RAW: 11 jobs' direct .chr field values --------------------------------
export const DNF_CHARACTER_STATS_RAW: Record<DnfJobId, DnfCharacterStatsRaw> = {
  swordman: {
    jumpPower:   fact(430,   "ambiguous", chrProv("swordman", "swordman")),
    jumpSpeed:   fact(95,    "ambiguous", chrProv("swordman", "swordman")),
    moveSpeed:   fact(850,   "%×SPEED_VALUE_DEFAULT", chrProv("swordman", "swordman")),
    attackSpeed: fact(850,   "%×SPEED_VALUE_DEFAULT", chrProv("swordman", "swordman")),
    weight:      fact(68000, "audio-only", chrProv("swordman", "swordman")),
  },
  demonicswordman: {
    jumpPower:   fact(430,   "ambiguous", chrProv("demonicswordman", "swordman")),
    jumpSpeed:   fact(95,    "ambiguous", chrProv("demonicswordman", "swordman")),
    moveSpeed:   fact(850,   "%×SPEED_VALUE_DEFAULT", chrProv("demonicswordman", "swordman")),
    attackSpeed: fact(1000,  "%×SPEED_VALUE_DEFAULT", chrProv("demonicswordman", "swordman")),
    weight:      fact(68000, "audio-only", chrProv("demonicswordman", "swordman")),
  },
  gunner: {
    jumpPower:   fact(490,   "ambiguous", chrProv("gunner", "gunner")),
    jumpSpeed:   fact(80,    "ambiguous", chrProv("gunner", "gunner")),
    moveSpeed:   fact(820,   "%×SPEED_VALUE_DEFAULT", chrProv("gunner", "gunner")),
    attackSpeed: fact(950,   "%×SPEED_VALUE_DEFAULT", chrProv("gunner", "gunner")),
    weight:      fact(60000, "audio-only", chrProv("gunner", "gunner")),
  },
  atgunner: {
    jumpPower:   fact(440,   "ambiguous", chrProv("atgunner", "gunner")),
    jumpSpeed:   fact(80,    "ambiguous", chrProv("atgunner", "gunner")),
    moveSpeed:   fact(850,   "%×SPEED_VALUE_DEFAULT", chrProv("atgunner", "gunner")),
    attackSpeed: fact(950,   "%×SPEED_VALUE_DEFAULT", chrProv("atgunner", "gunner")),
    weight:      fact(48000, "audio-only", chrProv("atgunner", "gunner")),
  },
  priest: {
    jumpPower:   fact(500,   "ambiguous", chrProv("priest", "priest")),
    jumpSpeed:   fact(100,   "ambiguous", chrProv("priest", "priest")),
    moveSpeed:   fact(780,   "%×SPEED_VALUE_DEFAULT", chrProv("priest", "priest")),
    attackSpeed: fact(950,   "%×SPEED_VALUE_DEFAULT", chrProv("priest", "priest")),
    weight:      fact(78000, "audio-only", chrProv("priest", "priest")),
  },
  fighter: {
    jumpPower:   fact(470,   "ambiguous", chrProv("fighter", "fighter")),
    jumpSpeed:   fact(110,   "ambiguous", chrProv("fighter", "fighter")),
    moveSpeed:   fact(910,   "%×SPEED_VALUE_DEFAULT", chrProv("fighter", "fighter")),
    attackSpeed: fact(950,   "%×SPEED_VALUE_DEFAULT", chrProv("fighter", "fighter")),
    weight:      fact(50000, "audio-only", chrProv("fighter", "fighter")),
  },
  atfighter: {
    jumpPower:   fact(470,   "ambiguous", chrProv("atfighter", "fighter")),
    jumpSpeed:   fact(110,   "ambiguous", chrProv("atfighter", "fighter")),
    moveSpeed:   fact(880,   "%×SPEED_VALUE_DEFAULT", chrProv("atfighter", "fighter")),
    attackSpeed: fact(950,   "%×SPEED_VALUE_DEFAULT", chrProv("atfighter", "fighter")),
    weight:      fact(50000, "audio-only", chrProv("atfighter", "fighter")),
  },
  mage: {
    jumpPower:   fact(350,   "ambiguous", chrProv("mage", "mage")),
    jumpSpeed:   fact(55,    "ambiguous", chrProv("mage", "mage")),
    moveSpeed:   fact(800,   "%×SPEED_VALUE_DEFAULT", chrProv("mage", "mage")),
    attackSpeed: fact(1000,  "%×SPEED_VALUE_DEFAULT", chrProv("mage", "mage")),
    weight:      fact(40000, "audio-only", chrProv("mage", "mage")),
  },
  atmage: {
    jumpPower:   fact(350,   "ambiguous", chrProv("atmage", "mage")),
    jumpSpeed:   fact(55,    "ambiguous", chrProv("atmage", "mage")),
    moveSpeed:   fact(820,   "%×SPEED_VALUE_DEFAULT", chrProv("atmage", "mage")),
    attackSpeed: fact(1000,  "%×SPEED_VALUE_DEFAULT", chrProv("atmage", "mage")),
    weight:      fact(50000, "audio-only", chrProv("atmage", "mage")),
  },
  creatormage: {
    jumpPower:   fact(350,   "ambiguous", chrProv("creatormage", "mage")),
    jumpSpeed:   fact(55,    "ambiguous", chrProv("creatormage", "mage")),
    moveSpeed:   fact(800,   "%×SPEED_VALUE_DEFAULT", chrProv("creatormage", "mage")),
    attackSpeed: fact(1000,  "%×SPEED_VALUE_DEFAULT", chrProv("creatormage", "mage")),
    weight:      fact(40000, "audio-only", chrProv("creatormage", "mage")),
  },
  thief: {
    jumpPower:   fact(465,   "ambiguous", chrProv("thief", "thief")),
    jumpSpeed:   fact(125,   "ambiguous", chrProv("thief", "thief")),
    moveSpeed:   fact(960,   "%×SPEED_VALUE_DEFAULT", chrProv("thief", "thief")),
    attackSpeed: fact(1000,  "%×SPEED_VALUE_DEFAULT", chrProv("thief", "thief")),
    weight:      fact(45000, "audio-only", chrProv("thief", "thief")),
  },
};

// --- DERIVED H1: jump_power treated as direct v0 (px/s) --------------------
// Falsifiable: reverse engineer DNF.exe to see how the engine reads jump_power
// when the character initiates a jump. If engine multiplies by a hidden base
// (e.g. 1800 px/s × jump_power/1000), H1 is false and H2 holds instead.

const H1_PROV: Provenance = {
  sourceType: "experimental",
  sourceRef: "derived from DNF_CHARACTER_STATS_RAW + H1 hypothesis",
  capturedAt: "2026-05-21",
  version: "Script.pvf v66282",
  confidence: "low",
  requiresCalibration: true,
  requiresManualVerification: true,
  hypothesis: "H1: .chr jump_power field unit is px/s (initial Z velocity directly).",
  falsifiableBy: "reverse engineering DNF.exe to inspect how jump_power is consumed by the C++ jump initiator",
  notes: "H2 alternative: jump_power is a %-scaler over a hidden engine base ≈1800 px/s. H1 is provided as working assumption.",
};

const GRAVITY_ABS = Math.abs(DNF_PHYSICS_RAW.defaultGravityAccel.value);

export interface DnfJumpDerivedH1 {
  initialZVelocity: DnfNumericFact;
  peakHeight: DnfNumericFact;
  riseTime: DnfNumericFact;
}

function deriveH1(jumpPower: number): DnfJumpDerivedH1 {
  const v0 = jumpPower;
  const peak = (v0 * v0) / (2 * GRAVITY_ABS);
  const rise = v0 / GRAVITY_ABS;
  return {
    initialZVelocity: fact(v0, "px/s", H1_PROV),
    peakHeight: fact(peak, "px", H1_PROV),
    riseTime: fact(rise, "s", H1_PROV),
  };
}

export const DNF_JUMP_DERIVED_H1: Record<DnfJobId, DnfJumpDerivedH1> = {
  swordman: deriveH1(DNF_CHARACTER_STATS_RAW.swordman.jumpPower.value),
  demonicswordman: deriveH1(DNF_CHARACTER_STATS_RAW.demonicswordman.jumpPower.value),
  gunner: deriveH1(DNF_CHARACTER_STATS_RAW.gunner.jumpPower.value),
  atgunner: deriveH1(DNF_CHARACTER_STATS_RAW.atgunner.jumpPower.value),
  priest: deriveH1(DNF_CHARACTER_STATS_RAW.priest.jumpPower.value),
  fighter: deriveH1(DNF_CHARACTER_STATS_RAW.fighter.jumpPower.value),
  atfighter: deriveH1(DNF_CHARACTER_STATS_RAW.atfighter.jumpPower.value),
  mage: deriveH1(DNF_CHARACTER_STATS_RAW.mage.jumpPower.value),
  atmage: deriveH1(DNF_CHARACTER_STATS_RAW.atmage.jumpPower.value),
  creatormage: deriveH1(DNF_CHARACTER_STATS_RAW.creatormage.jumpPower.value),
  thief: deriveH1(DNF_CHARACTER_STATS_RAW.thief.jumpPower.value),
};
