// Swordman .chr — full-field truth from PVF.
//
// Source: character/swordman/swordman.chr (Script.pvf v66282).
// Extracted 2026-05-21 via tools/dnf-extract.exe.
//
// IEEE 754 float decoding rule for `.chr`:
//   - Most numeric attributes are 32-bit integers that encode a little-endian
//     IEEE 754 float. e.g. "1138163712" -> 430.0
//   - A few fields are stored as plain ints (no float reinterpretation):
//     `jump speed`, `width`. We tag these explicitly with unit "int".
//
// Per-level vectors (hp max / mp max / physical attack / hit recovery / etc.)
// have 17 rows. Row 0 is the "initial value at level 1", rows 1-16 are the
// per-tier growth steps. The 17 rows pair with the engine's 16-tier growth
// curve plus a base.
//
// Engineering note: `module damage rate` has only 16 rows (not 17). That is
// authentic to the file; the engine indexes it differently from per-stat
// vectors.

import type { Provenance } from "../../../../combat/types.js";
import type { DnfNumericFact } from "../physics.js";

const PVF_PROV = (notes?: string): Provenance => ({
  sourceType: "pvf_extraction",
  sourceRef: "pvf:character/swordman/swordman.chr",
  capturedAt: "2026-05-21",
  version: "Script.pvf v66282",
  confidence: "high",
  requiresCalibration: false,
  notes,
});

const fact = (value: number, unit: string, notes?: string): DnfNumericFact =>
  ({ value, unit, provenance: PVF_PROV(notes) });

// ---------------------------------------------------------------------------
// Section A — scalar fields
// ---------------------------------------------------------------------------
export const SWORDMAN_CHR_SCALAR = {
  /** "[swordman]" — internal job tag. */
  job: "swordman" as const,

  /** Sprite atlas template for the body. style "%04d" is the body-color index. */
  bodyImagePath: "character/swordman/equipment/avatar/skin/sm_body%04d.img" as const,

  /** IEEE 754 float. Working hypothesis (H1): direct initial Z velocity (px/s). */
  jumpPower:  fact(430,   "ambiguous-units (H1: px/s)", "raw=1138163712 -> 430.0"),

  /** Plain int (NOT IEEE float). Engine semantics unverified — likely a tempo
   *  multiplier (% scaled by SPEED_VALUE_DEFAULT). */
  jumpSpeed:  fact(95,    "int", "raw='95' (no float decode)"),

  /** IEEE 754 float, % of SPEED_VALUE_DEFAULT (1000 = 100%). */
  moveSpeed:  fact(850,   "%×SPEED_VALUE_DEFAULT", "raw=1146388480 -> 850.0"),

  /** IEEE 754 float, % of SPEED_VALUE_DEFAULT. */
  attackSpeed: fact(850,  "%×SPEED_VALUE_DEFAULT", "raw=1146388480 -> 850.0"),

  /** IEEE 754 float. % multiplier for cast tempo. */
  castSpeed:  fact(700,   "%×SPEED_VALUE_DEFAULT", "raw=1143930880 -> 700.0"),

  /** IEEE 754 float — used by audio system only per dnf_enum_header. */
  weight:     fact(68000, "audio-only", "raw=1199886336 -> 68000.0"),

  /** IEEE 754 float, % element resistance. Negative = vulnerable. */
  lightResistance: fact(-20, "%", "raw=-1046478848 -> -20.0"),

  /** IEEE 754 float, % element resistance. */
  darkResistance:  fact(20,  "%", "raw=1101004800 -> 20.0"),

  /** Plain ints (not floats). Two values, semantic unknown — likely
   *  bounding-box width/depth. */
  widthBox: [40, 10] as const,
} as const;

/** NOTE: swordman.chr has NO `fire resistance` or `ice resistance` section.
 *  Demonicswordman / male-fighter classes may add them. */

// ---------------------------------------------------------------------------
// Section B — per-level growth vectors (17 rows: [base, +1..+16])
// ---------------------------------------------------------------------------
export interface PerLevelFact {
  /** Raw per-tier values; row 0 is initial value, rows 1-16 are growth steps. */
  values: number[];
  unit: string;
  provenance: Provenance;
}

const perLevel = (values: number[], unit: string, notes?: string): PerLevelFact =>
  ({ values, unit, provenance: PVF_PROV(notes) });

export const SWORDMAN_CHR_GROWTH = {
  hpMax: perLevel(
    [180, 45, 50, 50, 50, 40, 40, 40, 55, 55, 55, 45, 45, 45, 47.5, 55, 55],
    "hp",
    "row 0 = initial HP at level 1, rows 1-16 = per-tier growth",
  ),
  mpMax: perLevel(
    [140, 25, 20, 20, 20, 30, 30, 30, 15, 15, 15, 25, 25, 25, 22.5, 15, 15],
    "mp",
  ),
  mpRegenSpeed: perLevel(
    [50, 2.5, 2.5, 2.5, 2.5, 5, 5, 5, 2.5, 2.5, 2.5, 4, 4, 4, 3.5, 3, 3],
    "mp/min",
  ),
  /** Per-level hitstun-recovery vector. Row 0 = 600.0 base; growth rows decode
   *  to a small multiplier. */
  hitRecovery: perLevel(
    [600, 1.5, 2, 2, 2, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 3, 3],
    "ms (base) / multiplier",
    "row 0 base ms, rows 1-16 stack delta",
  ),
  physicalAttack: perLevel(
    [7.5, 4.8, 5, 5, 5, 3.5, 3.5, 3.5, 5.5, 5.5, 5.5, 4.5, 4.5, 4.5, 5, 5, 5],
    "physAtk",
  ),
  magicalAttack: perLevel(
    [4.5, 4.2, 4, 4, 4, 5.5, 5.5, 5.5, 3.5, 3.5, 3.5, 4.5, 4.5, 4.5, 5, 3.5, 3.5],
    "magAtk",
  ),
  physicalDefense: perLevel(
    [7.5, 4.8, 5, 5, 5, 3.5, 3.5, 3.5, 5.5, 5.5, 5.5, 4.5, 4.5, 4.5, 4, 6, 6],
    "physDef",
  ),
  magicalDefense: perLevel(
    [4.5, 4.2, 4, 4, 4, 5.5, 5.5, 5.5, 3.5, 3.5, 3.5, 4.5, 4.5, 4.5, 4, 3.5, 3.5],
    "magDef",
  ),
  inventoryLimit: perLevel(
    [48000, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 270, 270, 270],
    "weight",
  ),
} as const satisfies Record<string, PerLevelFact>;

// ---------------------------------------------------------------------------
// Section C — module damage rate (16 rows × 4 cols: per equipment slot)
// ---------------------------------------------------------------------------
export interface ModuleDamageRateRow {
  /** 4 columns; engine indexes by equipment slot enum (slot 0..3). */
  values: [number, number, number, number];
  provenance: Provenance;
}

/** 16 rows × 4 slots. Rows correspond to skill/weapon-pairing index. */
export const SWORDMAN_CHR_MODULE_DAMAGE_RATE: ModuleDamageRateRow[] = [
  { values: [0.95, 1.0, 1.0, 0.95], provenance: PVF_PROV() },
  { values: [0.70, 1.0, 1.1, 0.70], provenance: PVF_PROV() },
  { values: [0.70, 1.0, 1.1, 0.70], provenance: PVF_PROV() },
  { values: [0.70, 1.0, 1.1, 0.70], provenance: PVF_PROV() },
  { values: [1.00, 1.0, 1.2, 1.00], provenance: PVF_PROV() },
  { values: [1.00, 1.0, 1.2, 1.00], provenance: PVF_PROV() },
  { values: [1.00, 1.0, 1.2, 1.00], provenance: PVF_PROV() },
  { values: [0.84, 1.0, 0.8, 0.90], provenance: PVF_PROV() },
  { values: [0.84, 1.0, 0.8, 0.90], provenance: PVF_PROV() },
  { values: [0.84, 1.0, 0.8, 0.90], provenance: PVF_PROV() },
  { values: [0.81, 1.0, 1.1, 0.90], provenance: PVF_PROV() },
  { values: [0.81, 1.0, 1.1, 0.90], provenance: PVF_PROV() },
  { values: [0.90, 1.0, 1.1, 0.90], provenance: PVF_PROV() },
  { values: [1.00, 1.0, 1.0, 1.00], provenance: PVF_PROV() },
  { values: [1.00, 1.0, 1.0, 1.00], provenance: PVF_PROV() },
  { values: [1.00, 1.0, 1.0, 1.00], provenance: PVF_PROV() },
];

// ---------------------------------------------------------------------------
// Section D — weapon hit info (6 weapon types × 6 cols)
// ---------------------------------------------------------------------------
// Per-weapon-class hit feedback. 6 columns:
//   [hitTag, bloodTag, damageScalePct (int), critRate (float), pushBack (float), launch (float)]
// Weapon classes correspond to equip slot indices used by .chr `weapon wav` section.

export interface WeaponHitInfoRow {
  hitTag: string;        // "[cut]" | "[blow]"
  bloodTag: string;      // "[blood]" | "[no blood]"
  damageScalePct: number;
  critOrSimilar: number; // float
  pushBack: number;      // float
  launch: number;        // float (often 0)
  provenance: Provenance;
}

export const SWORDMAN_CHR_WEAPON_HIT_INFO: WeaponHitInfoRow[] = [
  { hitTag: "[cut]",  bloodTag: "[blood]",    damageScalePct:  90, critOrSimilar: 1.000, pushBack:  0.000, launch:  0.00, provenance: PVF_PROV() },
  { hitTag: "[cut]",  bloodTag: "[blood]",    damageScalePct:  70, critOrSimilar: 0.860, pushBack: -0.100, launch:  0.00, provenance: PVF_PROV() },
  { hitTag: "[blow]", bloodTag: "[no blood]", damageScalePct: 100, critOrSimilar: 1.200, pushBack:  0.100, launch: -0.95, provenance: PVF_PROV() },
  { hitTag: "[cut]",  bloodTag: "[blood]",    damageScalePct: 120, critOrSimilar: 1.400, pushBack:  0.200, launch:  0.00, provenance: PVF_PROV() },
  { hitTag: "[cut]",  bloodTag: "[blood]",    damageScalePct: 100, critOrSimilar: 1.000, pushBack:  0.000, launch:  0.00, provenance: PVF_PROV() },
  { hitTag: "[cut]",  bloodTag: "[blood]",    damageScalePct:  60, critOrSimilar: 0.850, pushBack: -0.150, launch:  0.00, provenance: PVF_PROV() },
];

// ---------------------------------------------------------------------------
// Section E — weapon wav (6 slots × 4 sound IDs)
// ---------------------------------------------------------------------------
export interface WeaponWavRow {
  attackSwingA: string;
  attackSwingB: string;
  hitA: string;
  hitB: string;
}

/** 6 weapon-class slots; slot 4 is empty (not present in retail swordman). */
export const SWORDMAN_CHR_WEAPON_WAV: (WeaponWavRow | null)[] = [
  { attackSwingA: "r_mineralswda", attackSwingB: "mineralswdb",   hitA: "r_mineralswda_hit", hitB: "mineral_swdb_hit" },
  { attackSwingA: "r_katanaa",     attackSwingB: "katanab",        hitA: "r_katanaa_hit",     hitB: "katanab_hit"       },
  { attackSwingA: "r_sticka",      attackSwingB: "stickb_01",      hitA: "r_sticka_hit",      hitB: "stickb_hit_01"     },
  { attackSwingA: "r_squareswda",  attackSwingB: "squareswdb",     hitA: "r_squareswda_hit",  hitB: "squareswdb_hit"    },
  null, // Slot 4 empty in source.
  { attackSwingA: "r_beamswda",    attackSwingB: "beamswdb",       hitA: "r_beamswda_hit",    hitB: "beamswdb_hit"      },
];

// ---------------------------------------------------------------------------
// Section F — weapon skill info / weapon durability decrease rate
// ---------------------------------------------------------------------------
/** 24 IEEE-float multipliers; semantics undocumented in this layer.
 *  Likely per-(weapon × skill-class) damage multipliers (6 weapons × 4 classes).
 *  Marked requiresManualVerification until cross-checked against engine code. */
export const SWORDMAN_CHR_WEAPON_SKILL_INFO = {
  values: [
    1.0,  1.0,  1.15, 1.05, 0.95, 0.95,
    1.05, 1.0,  1.10, 1.05, 0.95, 1.0,
    1.20, 1.10, 0.90, 1.0,  1.0,  1.0,
    1.0,  1.0,  0.90, 0.90, 1.0,  1.0,
  ],
  provenance: {
    ...PVF_PROV("24 IEEE floats; layout likely 6 weapons × 4 skill-classes"),
    requiresManualVerification: true,
    falsifiableBy: "reverse engineering DNF.exe to confirm column/row layout",
  },
} as const;

/** Durability tick rate per weapon slot (6 values). */
export const SWORDMAN_CHR_WEAPON_DURABILITY_DECREASE_RATE = {
  values: [1.0, 0.9, 1.05, 0.9, 1.0, 1.0],
  unit: "multiplier",
  provenance: PVF_PROV("6-element vector, one per weapon slot"),
};

/** 12 IEEE floats for "upgrade weapon attack power rate" — multipliers by
 *  upgrade tier or weapon type. Semantic verified manually. */
export const SWORDMAN_CHR_UPGRADE_WEAPON_ATTACK_POWER_RATE = {
  values: [
    0.95, 1.15, 0.95, 1.05, 1.10, 0.95,
    1.20, 0.90, 1.0,  1.0,  0.93, 0.90,
  ],
  provenance: {
    ...PVF_PROV("12 IEEE floats; layout likely 6 weapons × 2 tiers"),
    requiresManualVerification: true,
  },
};

// ---------------------------------------------------------------------------
// Section G — skill list per growtype (6 rows; row 0 = base swordman skills)
// ---------------------------------------------------------------------------
// Each row is a flat [(skillId, levelMax), (skillId, levelMax), ...].
// Row 0 — base swordman (shared by all 5 transforms).
// Rows 1-5 — per-growtype additional skills (5 transforms: weaponmaster,
// souledge, berserker, asura, demonicswordman-male).

export interface SkillIdLevel { skillId: number; levelMax: number; }

function parseSkillRow(flat: number[]): SkillIdLevel[] {
  const out: SkillIdLevel[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    out.push({ skillId: flat[i]!, levelMax: flat[i + 1]! });
  }
  return out;
}

export const SWORDMAN_CHR_SKILL_BY_GROWTYPE: {
  growtype: number; skills: SkillIdLevel[]; provenance: Provenance;
}[] = [
  // growtype 0 = base (shared by all transforms)
  { growtype: 0, skills: parseSkillRow([181, 2, 182, 2, 184, 1, 179, 7, 5, 1, 46, 1, 169, 1, 174, 1]), provenance: PVF_PROV("base swordman shared skills") },
  // growtype 1 = weaponmaster (鬼泣)
  { growtype: 1, skills: parseSkillRow([27, 1, 33, 1, 37, 1, 8, 1, 25, 1, 65, 1, 94, 1, 197, 1]),       provenance: PVF_PROV("weaponmaster (귀검사 무기 마스터)") },
  // growtype 2 = souledge (鬼剑士-剑魂)
  { growtype: 2, skills: parseSkillRow([35, 1, 29, 1, 25, 1, 65, 1, 93, 1, 197, 1]),                    provenance: PVF_PROV("soul edge") },
  // growtype 3 = berserker (狂战士)
  { growtype: 3, skills: parseSkillRow([56, 1, 25, 1, 65, 1, 76, 1, 197, 1]),                            provenance: PVF_PROV("berserker") },
  // growtype 4 = asura (阿修罗)
  { growtype: 4, skills: parseSkillRow([47, 1, 55, 1, 61, 1, 25, 1, 65, 1, 20, 1, 197, 1]),              provenance: PVF_PROV("asura") },
  // growtype 5 = demonicswordman (demonic / male-demonic, unverified)
  { growtype: 5, skills: parseSkillRow([8, 1, 25, 1, 65, 1, 20, 1, 94, 1, 27, 1, 33, 1, 37, 1, 56, 1, 187, 1]), provenance: { ...PVF_PROV("demonicswordman (variant)"), requiresManualVerification: true } },
];

// ---------------------------------------------------------------------------
// Section H — awakening skills (4 entries appear; semantics: skillId + level)
// ---------------------------------------------------------------------------
export const SWORDMAN_CHR_AWAKENING_SKILLS: { skillId: number; level: number; provenance: Provenance }[] = [
  { skillId: 91, level: 1, provenance: PVF_PROV("awakening skill slot 0") },
  { skillId: 89, level: 1, provenance: PVF_PROV("awakening skill slot 2") },
  { skillId: 90, level: 1, provenance: PVF_PROV("awakening skill slot 4") },
  { skillId: 92, level: 1, provenance: PVF_PROV("awakening skill slot 6") },
];

// ---------------------------------------------------------------------------
// Section I — motion → .ani path map (24 named slots + etc-motion array)
// ---------------------------------------------------------------------------
export const SWORDMAN_CHR_MOTION_ANI = {
  // Named motion slots (chr field name -> ani path)
  stay:           "animation/stay.ani",            // "waiting motion"
  simpleRest:     "animation/simple_rest.ani",
  rest:           "animation/rest.ani",
  move:           "animation/move.ani",
  simpleMove:     "animation/simple_move.ani",
  dash:           "animation/dash.ani",
  jump:           "animation/jump.ani",
  jumpAttack:     "animation/jumpattack.ani",
  attackBase:     ["animation/attack1.ani", "animation/attack2.ani", "animation/attack3.ani"],
  dashAttack:     "animation/dashattack.ani",
  damage1:        "animation/damage1.ani",
  damage2:        "animation/damage2.ani",
  down:           "animation/down.ani",
  overturn:       "animation/overturn.ani",
  sit:            "animation/sit.ani",
  getItem:        "animation/getitem.ani",
  ghost:          ["animation/ghost.ani", "animation/ghost_dodge.ani"],
  guard:          "animation/guard.ani",
  hardAttack:     "animation/hardattack.ani",
  hitback:        "animation/hitback.ani",
  // back motion is a reuse alias for attack3 in retail data
  back:           "animation/attack3.ani",
  buff:           "animation/summon2.ani",
  throw1:         ["animation/throw1.ani", "animation/throw2.ani"],   // throw motion 1-1, 1-2
  throw2:         ["animation/summon1.ani", "animation/summon2.ani"], // throw motion 2-1, 2-2
} as const;

/** 119 additional .ani paths from the etc-motion section (skills + finishers). */
export const SWORDMAN_CHR_ETC_MOTION_ANI: ReadonlyArray<string> = [
  "animation/guard.ani","animation/hardattack.ani","animation/hitback.ani","animation/tripleslash1.ani","animation/tripleslash2.ani","animation/tripleslash3.ani","animation/tripleslash4.ani","animation/tripleslash5.ani","animation/momentaryslash.ani","animation/wave.ani","animation/grab.ani","animation/dashattackmultihit.ani","animation/shockwaveareacast.ani","animation/shockwaveareasmash.ani","animation/vaneslashtry.ani","animation/vaneslash.ani","animation/upperslashafter.ani","animation/hardattackchargeafter.ani","animation/ghoststepslashready.ani","animation/ghoststepslashmove.ani","animation/standalonewaveready.ani","animation/standalonewavebasic.ani","animation/standalonewavestrong.ani","animation/jumpattackmultislash1.ani","animation/jumpattackmultislash2.ani","animation/gorecross.ani","animation/hopsmashready.ani","animation/hopsmash.ani","animation/weaponcomboshort1.ani","animation/weaponcomboshort2.ani","animation/weaponcomboshort3.ani","animation/weaponcomboblade1.ani","animation/weaponcomboblade2.ani","animation/weaponcomboblade3.ani","animation/weaponcomboblade4.ani","animation/weaponcomboblunt1.ani","animation/weaponcomboblunt2.ani","animation/weaponcomboblunt3.ani","animation/weaponcomboheavy1.ani","animation/weaponcomboheavy2.ani","animation/weaponcombolight1.ani","animation/weaponcombolight2.ani","animation/weaponcombolight3.ani","animation/chargecrashdash.ani","animation/chargecrashupper.ani","animation/chargecrashfinish.ani","animation/reflectguard.ani","animation/rapidmoveslashready1.ani","animation/rapidmoveslashready2.ani","animation/rapidmoveslashmove1.ani","animation/rapidmoveslashmove2.ani","animation/illusionslash1.ani","animation/illusionslash2.ani","animation/illusionslash3.ani","animation/illusionslash4.ani","animation/illusionslashfinal.ani","animation/wavespinareabomb.ani","animation/frenzy1.ani","animation/frenzy2.ani","animation/frenzy3.ani","animation/frenzy4.ani","animation/moonlightslash1.ani","animation/moonlightslash2.ani","animation/bloodyraveinhale.ani","animation/bloodyraveslash.ani","animation/moonlightslashfull.ani","animation/outragebreakready.ani","animation/outragebreakslash.ani","animation/kallaland.ani","animation/kallaair.ani","animation/kallafinishready.ani","animation/kallafinish1.ani","animation/kallafinish2.ani","animation/kallafinish3.ani","animation/hellbenterfinish.ani","animation/hundredswordready.ani","animation/hundredswordmoveready1.ani","animation/hundredswordmoveready2.ani","animation/hundredswordmoveready3.ani","animation/hundredswordmoveready4.ani","animation/hundredswordmoveready5.ani","animation/hundredswordmoveslash1.ani","animation/hundredswordmoveslash2.ani","animation/hundredswordmoveslash3.ani","animation/hundredswordmoveslash4.ani","animation/hundredswordmoveslash5.ani","animation/hundredswordfinish.ani","animation/blachecast.ani","animation/blachesmash.ani","animation/waveeyecast.ani","animation/waveeyestart.ani","animation/waveeyeattack1.ani","animation/waveeyeattack2.ani","animation/waveeyeattack3.ani","animation/waveeyeclaw.ani","animation/waveeyewing.ani","animation/waveeyespear.ani","animation/tombstoneex.ani","animation/momentaryslashex.ani","animation/chargecrashexshoulder.ani","animation/chargecrashexpick.ani","animation/chargecrashexupper.ani","animation/bloodswordmake.ani","animation/bloodswordcharge.ani","animation/flowmindstart.ani","animation/flowmindstay.ani","animation/flowmindone.ani","animation/flowmindoneadd.ani","animation/flowmindtwojump.ani","animation/flowmindtwolanding.ani","animation/flowmindtwoattack1.ani","animation/flowmindtwoattack2.ani","animation/flowmindthreeready.ani","animation/flowmindthreeattack.ani","animation/staysacrifice.ani","animation/spiritattack1.ani","animation/spiritattack2.ani","animation/spiritattack3.ani","animation/spiritattack4.ani","animation/spiritdashattack.ani","animation/ghostsidewind.ani","animation/triplestab.ani",
];

// ---------------------------------------------------------------------------
// Section J — attack info references (atk paths used by base motions)
// ---------------------------------------------------------------------------
export const SWORDMAN_CHR_ATTACK_INFO_REFS = {
  attackBase:  ["attackinfo/attack1.atk", "attackinfo/attack2.atk", "attackinfo/attack3.atk"],
  jumpAttack:  "attackinfo/jumpattack.atk",
  dashAttack:  "attackinfo/dashattack.atk",
} as const;
