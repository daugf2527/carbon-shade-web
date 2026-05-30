import type { PvfAttribute, PvfDocument, PvfRef, PvfSection } from "./PvfDocument.js";
import type { ExtractedDocumentProvenance, PvfFact, PvfStringFact, PvfVectorFact } from "./Provenance.js";

/** One stat entry from the "ability category" PVF section. */
export interface AbilityCategoryEntry {
  /** `"*"` = multiplicative (percent); `"+"` = additive (absolute). */
  op: "*" | "+";
  value: number;
}

export interface MobDef {
  kind: "mob";
  path: string;
  provenance: ExtractedDocumentProvenance;
  sections: PvfSection[];
  name: PvfStringFact | null;
  warlike: PvfFact<number> | null;
  sight: PvfFact<number> | null;
  /**
   * Single-dimension scalar from "weight" section first attribute (legacy
   * single-value contract; `weightDual` preserves both PVF dimensions).
   *
   * Phase 3 (2026-05-26, completeness-verifier-4): real PVF "weight" section
   * emits TWO ints (`[45000, 45000]` for goblins; see verification
   * 2026-05-26). `weight` keeps the legacy single-value semantics for
   * downstream consumers (`SqliteImporter` materialised view `mob_summary`
   * still reads `$.weight.value`); `weightDual` exposes the full pair.
   */
  weight: PvfFact<number> | null;
  /**
   * Both ints from "weight" section as `[w1, w2]`. Real PVF emits two values
   * across all 5/5 verified goblin mobs (identical pairs `[45000, 45000]`).
   * Second dimension's semantic not yet decoded — both values preserved
   * verbatim pending Stage 1.5 cross-mob audit. Tier-3.
   */
  weightDual: PvfVectorFact | null;
  /**
   * Reserved field for the "hp max" section — present in MobDef as a schema
   * placeholder but EMPTY across all 8 verified mob samples (2026-05-26).
   * Real PVF mob HP is computed at runtime as
   *   base_hp_reference * abilityCategory["hp max"] / 100
   * where the percentage scalar lives in the "ability category" section.
   * The field remains nullable so historical schema stays stable and
   * downstream code that already handles `hpMax === null` keeps working.
   */
  hpMax: PvfVectorFact | null;
  /**
   * Per-stat scalars from the "ability category" section. Each entry records
   * the operator (`*` multiplicative percent or `+` additive absolute) and
   * value as emitted by the PVF triple `[str("[stat]"), str(op), int(val)]`.
   *
   * Multiplicative example (cowardgoblin): `{ "hp max": { op:"*", value:80 } }`
   * → runtime HP = baseReferenceHp * value / 100.
   * Additive example (goblintaskmaster): `{ "hp max": { op:"+", value:6000 } }`
   * → runtime HP = baseReferenceHp + value. Tier-3.
   */
  abilityCategory: PvfFact<Record<string, AbilityCategoryEntry>> | null;
  /**
   * Mob level range `[min, max]` from the "level" section. Real PVF emits
   * two ints (e.g. goblin `[1, 6]`, cowardgoblin `[1, 99]`). Pair stored
   * verbatim; semantics (max==99 → "any-level scaling"?) deferred to
   * Stage 1.5 mob-design audit. Tier-3.
   */
  level: PvfVectorFact | null;
  /**
   * Single int from "attack delay" section, milliseconds between attacks
   * once a target is engaged. Real PVF emits ONE int per mob (e.g. goblin
   * `1500`, cowardgoblin `2000`). Unit is `ms` per analogous chr fields;
   * semantics (windup window? full-cycle delay?) defer to Stage 1.5. Tier-3.
   */
  attackDelay: PvfFact<number> | null;
  /**
   * Move speed pair `[x, y]` from "move speed" section. Real PVF emits two
   * ints (goblin `[300, 300]`, cowardgoblin `[600, 600]`). Pair always
   * identical in observed samples — second value may be `move speed (when
   * chasing)` per DNF .chr convention, but unverified. Tier-3.
   */
  moveSpeed: PvfVectorFact | null;
  /**
   * Hit recovery `[base, scale]` from "hit recovery" section. Real PVF
   * emits two ints (goblin / cowardgoblin both `[500, 500]`). Per chr-side
   * convention, first value is base recovery ms; second value is per-hit
   * scale or attack-type bias, but unverified for mobs. Tier-3.
   */
  hitRecovery: PvfVectorFact | null;
  /**
   * Collision-box dimensions `[w, h]` from "width" section. Real PVF emits
   * two ints (goblin / cowardgoblin both `[40, 10]`). Per chr "width"
   * convention, this is the AABB used for movement collision (not hit
   * detection — hit boxes live in .atk). Tier-3.
   */
  widthBox: PvfVectorFact | null;
  /**
   * Four ints from "stuckbonus on damage" section (goblin / cowardgoblin
   * both `[0, 0, 0, 0]`). Field exists in 5/5 verified samples but is
   * uniformly zero — the per-element bonus to stuck accumulation appears
   * unused by these mobs. Real PVF "stuckbonus" enum has 4 slots
   * (physical / fire / ice / dark per common DNF convention) but mapping
   * unverified. Tier-3.
   */
  stuckbonusOnDamage: PvfVectorFact | null;
  /**
   * Raw "attack kind" attribute list — 12-84 floats/ints with variable
   * shape across mob archetypes (goblin: 24 mixed float/int; cowardgoblin:
   * 12 entries). Decoding requires per-mob-type knowledge (melee / caster /
   * boss); Stage 1 preserves the raw list verbatim so Stage 2 consumers can
   * unpack against the right archetype schema. Tier-3 by archetype.
   */
  attackKind: PvfAttribute[] | null;
  attackInfo: PvfRef[];
  animationRefs: PvfRef[];
  category: string[];
  raw: PvfDocument;
}
