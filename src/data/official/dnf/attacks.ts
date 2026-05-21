// Swordman .atk attack data — Tier-1 truths from PVF.
//
// Source: character/swordman/attackinfo/*.atk
// `lift up` field is passed directly to sq_SetCurrentAttacknUpForce(),
// units = px/s (closed by the API's grep'd usage in atmage scripts).
// See docs/research/2026-05-21-dnf-air-physics-phase1.md.

import type { Provenance } from "../../../combat/types.js";
import type { DnfNumericFact } from "./physics.js";
import { DNF_PHYSICS_RAW } from "./physics.js";

const atkProv = (atkPath: string): Provenance => ({
  sourceType: "pvf_extraction",
  sourceRef: `pvf:character/swordman/${atkPath}`,
  capturedAt: "2026-05-21",
  version: "Script.pvf v66282",
  confidence: "high",
  requiresCalibration: false,
  notes: "lift_up field consumed by sq_SetCurrentAttacknUpForce (px/s).",
});

const fact = (value: number, unit: string, prov: Provenance): DnfNumericFact =>
  ({ value, unit, provenance: prov });

export interface SwordmanAtkRaw {
  liftUp: DnfNumericFact;
}

// --- RAW: lift_up directly from .atk files ---------------------------------
export const SWORDMAN_ATK_RAW = {
  attack1:    { liftUp: fact(75,  "px/s", atkProv("attackinfo/attack1.atk")) },
  attack2:    { liftUp: fact(90,  "px/s", atkProv("attackinfo/attack2.atk")) },
  attack3:    { liftUp: fact(300, "px/s", atkProv("attackinfo/attack3.atk")) },
  hardattack: { liftUp: fact(300, "px/s", atkProv("attackinfo/hardattack.atk")) },
  jumpattack: { liftUp: fact(180, "px/s", atkProv("attackinfo/jumpattack.atk")) },
  dashattack: { liftUp: fact(80,  "px/s", atkProv("attackinfo/dashattack.atk")) },
  hitback:    { liftUp: fact(220, "px/s", atkProv("attackinfo/hitback.atk")) },
} as const satisfies Record<string, SwordmanAtkRaw>;

// --- DERIVED: peak launch height (pure arithmetic, no hypothesis) ----------
// h = v0² / (2 × |g|). Both v0 (lift_up px/s) and g (-1500 px/s²) are Tier-1
// truths, so the derived value stays sourceType=pvf_extraction (NOT experimental).

const derivedProv = (atkPath: string): Provenance => ({
  sourceType: "pvf_extraction",
  sourceRef: `derived from pvf:character/swordman/${atkPath} + DNF_PHYSICS_RAW.defaultGravityAccel`,
  capturedAt: "2026-05-21",
  version: "Script.pvf v66282",
  confidence: "high",
  requiresCalibration: false,
  notes: "Pure arithmetic: h = v0^2 / (2*|g|). No hypothesis involved.",
});

const GRAVITY_ABS = Math.abs(DNF_PHYSICS_RAW.defaultGravityAccel.value);

function derivePeakHeight(liftUp: number, atkPath: string): DnfNumericFact {
  return fact((liftUp * liftUp) / (2 * GRAVITY_ABS), "px", derivedProv(atkPath));
}

export interface SwordmanAtkDerived {
  peakHeight: DnfNumericFact;
}

// Only include peakHeight when meaningful (lift_up high enough to cause a
// visible launch arc, conventionally >100 px/s → peak >3.3 px).
export const SWORDMAN_ATK_DERIVED = {
  attack3:    { peakHeight: derivePeakHeight(300, "attackinfo/attack3.atk") },
  hardattack: { peakHeight: derivePeakHeight(300, "attackinfo/hardattack.atk") },
  jumpattack: { peakHeight: derivePeakHeight(180, "attackinfo/jumpattack.atk") },
  hitback:    { peakHeight: derivePeakHeight(220, "attackinfo/hitback.atk") },
} as const satisfies Record<string, SwordmanAtkDerived>;
