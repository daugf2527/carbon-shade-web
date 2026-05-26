/**
 * Stage 1 VALIDATE L2 — validates PARSE stage output before LOAD.
 *
 * Per docs/plans/2026-05-22-stage1-data-pipeline-design.md §2.2:
 *   EXTRACT → PARSE → **VALIDATE (L2)** → LOAD → EXPORT
 *
 * VALIDATE L2 produces a structured report covering:
 *   1. Schema sanity (kind correct, key fields present, types match)
 *   2. Ref integrity (PvfRef.targetPath resolvable against parsed set)
 *   3. Provenance audit (Tier-3 / requiresManualVerification)
 *   4. PvP scope (per [[feedback-dnf-pve-scope-only]]: read all, runtime ignores)
 *   5. 3-level error model (error → fail run, warning → continue, info → log)
 *
 * Design decisions:
 *   - **Zod schema-driven, per design §4 Day 11.** Each ParsedDef kind has a
 *     dedicated Zod schema built from the canonical type definitions in
 *     ../data/types/*. safeParse() produces an issue list which we translate
 *     to ValidationIssue entries with stable, human-readable `code` values
 *     (e.g. `missing_provenance` / `wrong_kind` / `invalid_attack_kind`).
 *     The mapping preserves every code emitted by the pre-Zod hand-rolled
 *     validator so downstream consumers (H13 probes, smoke fixtures, the
 *     report renderer) keep working without churn.
 *   - **Generic walker** for provenance + refs — every ParsedDef is a tree
 *     of typed fields; one walker handles all 7 (and forward-compat to 9).
 *     The walker stays hand-rolled because it is a *traversal*, not a
 *     schema check — Zod's job ends at shape, the walker collects evidence.
 *   - **Pure** — given the same parsed[] input, produces identical reports.
 *     Test fixtures pin runId/startedAt/finishedAt for determinism.
 */

import { z } from "zod";
import type { AtkDef } from "../data/types/AtkDef.js";
import type { ChrDef } from "../data/types/ChrDef.js";
import type { MobDef } from "../data/types/MobDef.js";
import type { SkillDef } from "../data/types/SklDef.js";
import type { DungeonDef } from "../data/types/DgnDef.js";
import type { EtcDef } from "../data/types/EtcDef.js";
import type { MapDef } from "../data/types/MapDef.js";
import type { ParsedPvfDocument } from "../data/pipeline/parseStage.js";

// ─── Public types ───────────────────────────────────────────────────────────

export type ValidationLevel = "error" | "warning" | "info";

export interface ValidationIssue {
  level: ValidationLevel;
  pvfPath: string;
  parser: string;
  field: string;
  code: string;
  message: string;
}

export interface Tier3FieldEntry {
  pvfPath: string;
  field: string;
  /** "tier3" (formerly "local_baseline"), or any future SourceConfidenceTier other than "tier1"/"tier2". */
  sourceType: string;
  requiresManualVerification: boolean;
}

export interface PvpFieldEntry {
  pvfPath: string;
  parser: string;
  field: string;
  reason: string;
}

export type RefStatus = "resolved" | "missing" | "ambiguous";

export interface RefEntry {
  fromPath: string;
  /**
   * The dotted/indexed field path on the source ParsedDef where the ref was
   * found (e.g. `animationRefs[3]` or `attackInfo.attackBase[0]`).
   * Audit F1 (test-effectiveness, 2026-05-24): SqliteImporter previously
   * wrote `targetKind` into both `from_field` AND `ref_type` columns,
   * duplicating the same value. The actual source-field path was discarded
   * by the walker before reaching the importer. Now preserved end-to-end.
   */
  fromField: string;
  toPath: string;
  targetKind: string;
  status: RefStatus;
}

export interface VerificationReportMeta {
  runId: string;
  startedAt: string;
  finishedAt: string;
  pvfHash: string | null;
  extractorVersion: string | null;
}

export interface VerificationReport {
  meta: VerificationReportMeta;
  stats: {
    filesTotal: number;
    filesParsed: number;
    filesFailed: number;
    errors: number;
    warnings: number;
    infos: number;
  };
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  infos: ValidationIssue[];
  tier3Fields: Tier3FieldEntry[];
  pvpFields: PvpFieldEntry[];
  refIntegrity: RefEntry[];
}

export interface ProvenanceAuditReport {
  meta: VerificationReportMeta;
  summary: {
    tier3Count: number;
    filesWithTier3: number;
    requiresManualVerificationCount: number;
  };
  tier3Fields: Tier3FieldEntry[];
}

export interface ValidateOptions {
  runId: string;
  startedAt: string;
  finishedAt: string;
  pvfHash?: string | null;
  extractorVersion?: string | null;
  /**
   * Optional: previously-recorded parse errors (path + message). These get
   * surfaced as "error" level ValidationIssues with code="parse_failure"
   * so the report captures the full pipeline picture (not just validation).
   */
  parseErrors?: Array<{ path: string; message: string }>;
}

// ─── Zod sub-schemas (Provenance / PvfFact variants / PvfRef) ───────────────
//
// These mirror src/dnf-native-combat/data/types/Provenance.ts and
// PvfDocument.ts. Keep them in sync with the TS types — schema drift here
// silently weakens validation, so prefer "stricter than the type" over the
// reverse. Optional TS fields use z.optional(); nullable union members use
// z.nullable(); arrays-of-PvfFact use z.array(PvfFactNumberSchema).

/** Any plain object with string keys (used for `raw` slots & loose containers). */
const PlainObjectSchema = z.record(z.string(), z.unknown());

/** ExtractedDocumentProvenance — top-level provenance attached to every ParsedDef. */
const ExtractedDocumentProvenanceSchema = z.object({
  extractorVersion: z.string(),
  extractTimestamp: z.string(),
  sourcePvfHash: z.string().optional(),
  sourceRef: z.string(),
});

/** ParsedFieldProvenance — provenance attached to every PvfFact (+ sectionName). */
const ParsedFieldProvenanceSchema = z.object({
  extractorVersion: z.string(),
  extractTimestamp: z.string(),
  sourcePvfHash: z.string().optional(),
  sourceRef: z.string(),
  sectionName: z.string(),
});

/** Shared optional-fact fields (sourceType + requiresManualVerification).
 *
 * Audit F11 (ts-parser-truth, 2026-05-24): sourceType is constrained to the
 * SourceConfidenceTier enum from types/Provenance.ts so a typo like
 * "tier_one" no longer parses cleanly. The walker still treats anything
 * other than "tier1"/"tier2" as Tier-3 — but the SET of accepted values is
 * now finite. H probes that intentionally test walker behaviour with
 * out-of-enum strings must cast via `as unknown` to bypass the schema.
 *
 * D2 fix (2026-05-24, day11-17-ai-decisions-audit): the 4-value enum
 * (tier1/tier2/local_baseline/experimental) is collapsed to a 3-value
 * enum (tier1/tier2/tier3) so the schema, CLAUDE.md "three-tier rule",
 * and Stage 2 brainstorm doc all share the same vocabulary. The previously
 * AI-introduced "experimental" tier is removed entirely — it never had
 * a place in the user's three-tier truth rule.
 */
const SourceConfidenceTierSchema = z.union([
  z.literal("tier1"),
  z.literal("tier2"),
  z.literal("tier3"),
]);

const PvfFactBaseFields = {
  unit: z.string(),
  provenance: ParsedFieldProvenanceSchema,
  sourceType: SourceConfidenceTierSchema.optional(),
  requiresManualVerification: z.boolean().optional(),
};

/** PvfFact<number>. Audit P0-5 (2026-05-26): .finite() rejects NaN/Infinity
 *  at validate-time so downstream consumers (importer JSON / runtime shards
 *  / SQLite views) never see numeric pollution. */
const PvfFactNumberSchema = z.object({
  value: z.number().finite(),
  ...PvfFactBaseFields,
});

/** PvfStringFact (extends PvfFact<string> with optional rawValue). */
const PvfStringFactSchema = z.object({
  value: z.string(),
  rawValue: z.string().optional(),
  ...PvfFactBaseFields,
});

/** PvfVectorFact (values is number[]; no `value` field). Audit P0-5:
 *  every element .finite(); array capped at 10000 (audit P0-6). */
const PvfVectorFactSchema = z.object({
  values: z.array(z.number().finite()).max(10000),
  ...PvfFactBaseFields,
});

/** PvfFact<Record<string, number>> — keyed scalar map (e.g. mob "ability
 *  category" stat->percent). Phase 3 (2026-05-26). Numeric values are
 *  .finite(). Map key cardinality is bounded by the PVF section structure
 *  (typically <=10 stat keys per mob); no explicit cap is added since the
 *  parser already throws on duplicate keys and divisible-by-3 invariant. */
const PvfFactRecordNumberSchema = z.object({
  value: z.record(z.string(), z.number().finite()),
  ...PvfFactBaseFields,
});

/** PvfRef — { targetKind, targetPath, raw } as emitted by parserUtils.ref(). */
const PvfRefSchema = z.object({
  targetKind: z.string(),
  targetPath: z.string(),
  raw: z.string(),
});

/** PvfAttribute — discriminated union by `t` tag, with passthrough fallback
 *  for forward-compat unknown kinds. Audit F13 (ts-parser-truth, 2026-05-24):
 *  MapDef.monsterSpawns / passiveObjects / specialPassiveObjects previously
 *  declared `z.array(z.unknown())` — completely unconstrained. This schema
 *  enforces at minimum that every attribute carries a string `t` tag. */
const PvfAttributeSchema = z.object({ t: z.string() }).passthrough();

/** PvfSection — { name, attributes: PvfAttribute[] }. */
const PvfSectionSchema = z.object({
  name: z.string(),
  attributes: z.array(PvfAttributeSchema).max(10000),
});

// ChrWeaponHitInfoRow — 6 fields, all primitives. Per types/ChrDef.ts.
// Audit P0-5: all numeric fields .finite() — physics/damage params reject NaN.
const ChrWeaponHitInfoRowSchema = z.object({
  hitTag: z.string(),
  bloodTag: z.string(),
  damageScalePct: z.number().finite(),
  critOrSimilar: z.number().finite(),
  pushBack: z.number().finite(),
  launch: z.number().finite(),
});

// ChrWeaponWavRow — discriminated union by `format` (stereo / mono / matrix).
// Per types/ChrDef.ts. Each row in weaponWav can be one of these or null.
const ChrWeaponWavRowSchema = z.discriminatedUnion("format", [
  z.object({
    format: z.literal("stereo"),
    attackSwingA: z.string(),
    attackSwingB: z.string(),
    hitA: z.string(),
    hitB: z.string(),
  }),
  z.object({
    format: z.literal("mono"),
    swing: z.string(),
    hit: z.string(),
  }),
  z.object({
    format: z.literal("matrix"),
    entries: z.array(z.object({ swing: z.string(), hit: z.string() })).max(10000),
  }),
]);

// ─── Zod kind schemas (one per ParsedPvfDocument kind) ───────────────────────
//
// These are intentionally NOT exhaustive at every leaf — they enforce the
// required-presence and type contracts the hand-rolled validator enforced,
// plus deeper checks on PvfFact shapes (which the hand-rolled version
// reduced to isObject()). Optional/nullable TS fields are mirrored faithfully.

const ChrGrowthSchema = z.object({
  hpMax: PvfVectorFactSchema,
  mpMax: z.nullable(PvfVectorFactSchema),
  mpRegenSpeed: z.nullable(PvfVectorFactSchema),
  hitRecovery: z.nullable(PvfVectorFactSchema),
  physicalAttack: PvfVectorFactSchema,
  magicalAttack: z.nullable(PvfVectorFactSchema),
  physicalDefense: z.nullable(PvfVectorFactSchema),
  magicalDefense: z.nullable(PvfVectorFactSchema),
  inventoryLimit: z.nullable(PvfVectorFactSchema),
});

const ChrAttackInfoSchema = z.object({
  attackBase: z.array(PvfRefSchema).max(10000),
  etc: z.array(PvfRefSchema).max(10000),
  jumpAttack: z.nullable(PvfRefSchema),
  dashAttack: z.nullable(PvfRefSchema),
});

// 2026-05-26 verification gap-fix (completeness-verifier-1): raw .chr contains
// 4 awakening section names that parser previously dropped. Schema preserves
// data verbatim; semantics (sub-job dimension, slot meaning) deferred to
// Stage 1.5 awakening-specific audit. See ChrParser.parseAwakening.
const ChrAwakeningSchema = z.object({
  skillSlots: z.array(z.array(z.number().finite()).max(1000)).max(100),
  names: z.nullable(z.array(z.array(z.string()).max(100)).max(100)),
  tier1SlotCounts: z.array(z.number().finite()).max(100),
  tier2SlotCounts: z.array(z.number().finite()).max(100),
});

const ChrSchema = z.object({
  kind: z.literal("chr"),
  path: z.string(),
  provenance: ExtractedDocumentProvenanceSchema,
  sections: z.array(PvfSectionSchema).max(10000),
  job: PvfStringFactSchema,
  bodyImagePath: z.nullable(PvfStringFactSchema),
  jumpPower: PvfFactNumberSchema,
  jumpSpeed: PvfFactNumberSchema,
  moveSpeed: z.nullable(PvfFactNumberSchema),
  attackSpeed: z.nullable(PvfFactNumberSchema),
  castSpeed: z.nullable(PvfFactNumberSchema),
  weight: PvfFactNumberSchema,
  lightResistance: z.nullable(PvfFactNumberSchema),
  darkResistance: z.nullable(PvfFactNumberSchema),
  widthBox: z.array(z.number().finite()).max(10000),
  growth: ChrGrowthSchema,
  moduleDamageRate: z.nullable(z.array(z.array(z.number().finite()).max(10000)).max(10000)),
  // Audit F12 (ts-parser-truth, 2026-05-24): was z.array(z.unknown()) — now
  // typed against ChrWeaponHitInfoRow / ChrWeaponWavRow per types/ChrDef.ts.
  weaponHitInfo: z.array(ChrWeaponHitInfoRowSchema).max(10000),
  weaponWav: z.array(z.nullable(ChrWeaponWavRowSchema)).max(10000),
  weaponSkillInfo: z.array(z.number().finite()).max(10000),
  weaponDurabilityDecreaseRate: z.array(z.number().finite()).max(10000),
  upgradeWeaponAttackPowerRate: z.array(z.number().finite()).max(10000),
  attackInfo: ChrAttackInfoSchema,
  motionRefs: z.record(z.string(), z.array(PvfRefSchema).max(10000)),
  awakening: ChrAwakeningSchema,
  // raw is a full PvfDocument; we only enforce object-shape here (loose).
  raw: PlainObjectSchema,
}).strict();

const MobSchema = z.object({
  kind: z.literal("mob"),
  path: z.string(),
  provenance: ExtractedDocumentProvenanceSchema,
  sections: z.array(PvfSectionSchema).max(10000),
  name: z.nullable(PvfStringFactSchema),
  warlike: z.nullable(PvfFactNumberSchema),
  sight: z.nullable(PvfFactNumberSchema),
  weight: z.nullable(PvfFactNumberSchema),
  // Phase 3 (2026-05-26, completeness-verifier-4): MobParser now reads the
  // 8 sections all 5/5 verified goblin mobs carry. Schema mirrors MobDef
  // type — every new field is nullable so legacy / partial fixtures still
  // validate without backward break.
  weightDual: z.nullable(PvfVectorFactSchema),
  hpMax: z.nullable(PvfVectorFactSchema),
  abilityCategory: z.nullable(PvfFactRecordNumberSchema),
  level: z.nullable(PvfVectorFactSchema),
  attackDelay: z.nullable(PvfFactNumberSchema),
  moveSpeed: z.nullable(PvfVectorFactSchema),
  hitRecovery: z.nullable(PvfVectorFactSchema),
  widthBox: z.nullable(PvfVectorFactSchema),
  stuckbonusOnDamage: z.nullable(PvfVectorFactSchema),
  // attackKind preserved as raw PvfAttribute[] (variable shape per mob
  // archetype — see MobDef.attackKind doc). PvfAttributeSchema enforces
  // the `t` discriminator; deeper validation requires Stage 2 archetype
  // schemas. Array capped at 10000 to bound payload.
  attackKind: z.nullable(z.array(PvfAttributeSchema).max(10000)),
  attackInfo: z.array(PvfRefSchema).max(10000),
  animationRefs: z.array(PvfRefSchema).max(10000),
  category: z.array(z.string()).max(10000),
  raw: PlainObjectSchema,
}).strict();

const AtkAttackKindSchema = z.union([z.literal("physic"), z.literal("magic"), z.null()]);
const AtkHitReactionSchema = z.union([
  z.literal("none"),
  z.literal("hit_down"),
  z.literal("hit_lift_up"),
  z.literal("hit_horizon"),
]);
const AtkElementSchema = z.union([
  z.literal("none"),
  z.literal("dark"),
  z.literal("fire"),
  z.literal("ice"),
  z.literal("light"),
]);

const AtkSchema = z.object({
  kind: z.literal("atk"),
  path: z.string(),
  provenance: ExtractedDocumentProvenanceSchema,
  sections: z.array(PvfSectionSchema).max(10000),
  liftUp: z.nullable(PvfFactNumberSchema),
  pushAside: z.nullable(PvfFactNumberSchema),
  damageBonus: z.nullable(PvfFactNumberSchema),
  attackEnemy: z.boolean(),
  attackFriend: z.boolean(),
  weaponDamageApply: z.boolean(),
  attackKind: AtkAttackKindSchema,
  element: AtkElementSchema,
  hitReaction: AtkHitReactionSchema,
  causesDown: z.boolean(),
  causesStun: z.boolean(),
  causesBounce: z.boolean(),
  causesStuck: z.boolean(),
  pvpOnly: z.boolean(),
  ignoreWeight: z.boolean(),
  hitWav: z.nullable(PvfStringFactSchema),
  knuckBack: z.nullable(PvfFactNumberSchema),
  raw: PlainObjectSchema,
}).strict();

const SklSkillTypeSchema = z.union([
  z.literal("active"),
  z.literal("passive"),
  z.literal("unknown"),
]);
const SklWeaponEffectTypeSchema = z.union([
  z.literal("physical"),
  z.literal("magical"),
  z.literal("unknown"),
]);

const SklCancelWindowSchema = z.object({
  cancelWindowStart: z.number().finite(),
  cancelWindowDuration: z.number().finite(),
  cancelGroup: z.number().finite(),
  cancelWeaponMask: z.array(z.number().finite()).max(10000),
  cancelTargetSlots: z.array(z.number().finite()).max(10000),
});

const SklSchema = z.object({
  kind: z.literal("skl"),
  path: z.string(),
  provenance: ExtractedDocumentProvenanceSchema,
  sections: z.array(PvfSectionSchema).max(10000),
  name: z.nullable(PvfStringFactSchema),
  skillType: SklSkillTypeSchema,
  weaponEffectType: SklWeaponEffectTypeSchema,
  skillClass: z.nullable(PvfFactNumberSchema),
  purchaseCost: z.nullable(PvfFactNumberSchema),
  requiredLevel: z.nullable(PvfFactNumberSchema),
  requiredLevelRange: z.nullable(PvfFactNumberSchema),
  maximumLevel: z.nullable(PvfFactNumberSchema),
  durabilityDecreaseRate: z.nullable(PvfFactNumberSchema),
  growtypeMaximumLevel: z.nullable(z.array(z.number().finite()).max(10000)),
  skillFitnessGrowtype: z.nullable(z.array(z.number().finite()).max(10000)),
  hasPvp: z.boolean(),
  hasDungeon: z.boolean(),
  hasWarroom: z.boolean(),
  hasDeathTower: z.boolean(),
  autoCoolTimeApply: z.boolean(),
  cancelWindow: z.nullable(SklCancelWindowSchema),
  // Phase 4 (2026-05-26) — 12 raw-section typed fields per
  // stage1.5-revised-plan §二.P0-2. Real-PVF shape verified against
  // dashattackmultihit.skl / icewave.skl / hellbenter.skl samples.
  command: z.nullable(z.array(z.string()).max(1000)),
  coolTime: z.nullable(z.object({
    dungeonMs: z.number().finite(),
    pvpMs: z.number().finite(),
  }).strict()),
  consumeMp: z.nullable(z.object({
    baseMp: z.number().finite(),
    lvlMaxMp: z.number().finite(),
  }).strict()),
  castingTime: z.nullable(z.object({
    baseMs: z.number().finite(),
    lvl20Ms: z.number().finite(),
  }).strict()),
  levelProperty: z.nullable(z.array(PvfAttributeSchema).max(1000)),
  levelInfo: z.nullable(z.array(PvfAttributeSchema).max(1000)),
  preRequiredSkill: z.nullable(z.array(z.number().finite()).max(100)),
  featureSkillIndex: z.nullable(z.number().finite()),
  icon: z.nullable(z.object({
    atlasPath: z.string(),
    frame: z.number().finite(),
    litAtlasPath: z.string(),
    litFrame: z.number().finite(),
  }).strict()),
  consumeItem: z.nullable(z.array(z.number().finite()).max(100)),
  maintainMp: z.nullable(z.number().finite()),
  skillCommandAdvantage: z.nullable(z.object({
    normal: z.number().finite(),
    advanced: z.number().finite(),
  }).strict()),
  raw: PlainObjectSchema,
}).strict();

const DgnSchema = z.object({
  kind: z.literal("dgn"),
  path: z.string(),
  provenance: ExtractedDocumentProvenanceSchema,
  sections: z.array(PvfSectionSchema).max(10000),
  name: z.nullable(PvfStringFactSchema),
  explain: z.nullable(PvfStringFactSchema),
  basisLevel: z.nullable(PvfFactNumberSchema),
  minimumRequiredLevel: z.nullable(PvfFactNumberSchema),
  experienceIncreasingPoint: z.nullable(PvfFactNumberSchema),
  backgroundPos: z.nullable(PvfFactNumberSchema),
  startMap: z.nullable(z.array(z.number().finite()).max(10000)),
  bossMap: z.nullable(z.array(z.number().finite()).max(10000)),
  size: z.nullable(z.object({ width: z.number().finite(), height: z.number().finite() })),
  mapSpecification: z.nullable(z.object({
    rows: z.number().finite(),
    cols: z.number().finite(),
    items: z.array(z.array(z.number().finite()).max(10000)).max(10000),
  })),
  enteringTitleRefs: z.array(PvfRefSchema).max(10000),
  imageRefs: z.array(z.object({
    section: z.string(),
    path: z.string(),
    resolved: z.boolean(),
  })).max(10000),
  championLevels: z.nullable(z.array(z.number().finite()).max(10000)),
  pathgateObjects: z.nullable(z.array(z.number().finite()).max(10000)),
  eventMonsters: z.nullable(z.array(z.number().finite()).max(10000)),
  greedLayout: z.nullable(z.string()),
  // Audit P0-7 (2026-05-26): was z.array(z.unknown()) — now PvfAttribute[]
  // (every attribute must carry a string `t` discriminator), matching the
  // monsterSpawns / passiveObjects pattern used by MapDef.
  worldmapPatternInfo: z.nullable(z.array(PvfAttributeSchema).max(10000)),
  raw: PlainObjectSchema,
}).strict();

const EtcKeyValueEntrySchema = z.object({
  key: z.string(),
  values: z.array(z.number().finite()).max(10000),
  indexedValues: z.nullable(z.record(z.string(), z.number().finite())),
});

const EtcSchema = z.object({
  kind: z.literal("etc"),
  path: z.string(),
  provenance: ExtractedDocumentProvenanceSchema,
  sections: z.array(PvfSectionSchema).max(10000),
  entries: z.array(EtcKeyValueEntrySchema).max(10000),
  byKey: z.record(z.string(), EtcKeyValueEntrySchema),
  raw: PlainObjectSchema,
}).strict();

const MapSchema = z.object({
  kind: z.literal("map"),
  path: z.string(),
  provenance: ExtractedDocumentProvenanceSchema,
  sections: z.array(PvfSectionSchema).max(10000),
  name: z.nullable(PvfStringFactSchema),
  mapType: z.nullable(PvfStringFactSchema),
  dungeonId: z.nullable(PvfFactNumberSchema),
  nearSightScroll: z.nullable(PvfFactNumberSchema),
  middleSightScroll: z.nullable(PvfFactNumberSchema),
  farSightScroll: z.nullable(PvfFactNumberSchema),
  tiles: z.array(z.string()).max(10000),
  playerNumber: z.array(z.number().finite()).max(10000),
  sounds: z.array(z.string()).max(10000),
  monsterAiHints: z.array(z.string()).max(10000),
  eventMonsterPositions: z.array(z.number().finite()).max(10000),
  pathgatePos: z.array(z.number().finite()).max(10000),
  pvpStartArea: z.array(z.number().finite()).max(10000),
  // Audit F13 (ts-parser-truth, 2026-05-24): was z.array(z.unknown()) — now
  // PvfAttribute[] per types/MapDef.ts. Section attributes preserve their
  // typed `t` discriminator, so silent coercion at parser boundary surfaces.
  monsterSpawns: z.array(PvfAttributeSchema).max(10000),
  passiveObjects: z.array(PvfAttributeSchema).max(10000),
  specialPassiveObjects: z.array(PvfAttributeSchema).max(10000),
  animationRefs: z.array(PvfRefSchema).max(10000),
  backgroundAnimation: z.array(PvfRefSchema).max(10000),
  greed: z.nullable(PvfStringFactSchema),
  raw: PlainObjectSchema,
}).strict();

// ─── Issue translation: Zod issue → ValidationIssue code ────────────────────
//
// All hand-rolled validator codes are preserved here. The mapping is keyed
// off the TOP-LEVEL field name (path[0]) so a nested type error (e.g.
// jumpPower.value being a string) maps back to the same `missing_jump_power`
// bucket the hand-rolled code used. This keeps H13 probes + downstream
// consumers stable while still surfacing deep errors via the issue `field`.

function camelToSnake(s: string): string {
  return s.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_+/, "");
}

interface CodeMapping {
  code: string;
  level: ValidationLevel;
}

/**
 * Special-case map of top-level field name → code mapping.
 * Anything not listed falls back to `missing_<camelToSnake(top)>`.
 *
 * `wrong_kind`, `invalid_attack_kind`, `invalid_hit_reaction`, and
 * `invalid_skill_type` are the only codes that don't follow the default
 * `missing_` prefix — they retain `invalid_` to signal "wrong value in a
 * known enum slot" vs "field missing or wrong type".
 */
const FIELD_CODE_OVERRIDES: Record<string, string> = {
  kind: "wrong_kind",
  attackKind: "invalid_attack_kind",
  hitReaction: "invalid_hit_reaction",
  skillType: "invalid_skill_type",
};

function mapIssueToCode(issuePath: ReadonlyArray<PropertyKey>): string {
  if (issuePath.length === 0) return "schema_error";

  // Etc-specific entries[N].key missing → preserve hand-rolled code.
  if (
    issuePath[0] === "entries" &&
    typeof issuePath[1] === "number" &&
    issuePath[2] === "key"
  ) {
    return "etc_entry_missing_key";
  }

  const top = issuePath[0];
  if (typeof top !== "string") return "schema_error";

  const override = FIELD_CODE_OVERRIDES[top];
  if (override !== undefined) return override;

  return `missing_${camelToSnake(top)}`;
}

function fieldPathString(issuePath: ReadonlyArray<PropertyKey>): string {
  if (issuePath.length === 0) return "<root>";
  return issuePath
    .map(seg => (typeof seg === "number" ? `[${seg}]` : String(seg)))
    .reduce((acc, seg) => {
      if (acc === "") return seg.startsWith("[") ? seg : seg;
      return seg.startsWith("[") ? acc + seg : acc + "." + seg;
    }, "");
}

interface KindSchemaSpec {
  parser: string;
  schema: z.ZodTypeAny;
}

const KIND_SCHEMAS: Record<string, KindSchemaSpec> = {
  chr: { parser: "chr", schema: ChrSchema },
  mob: { parser: "mob", schema: MobSchema },
  atk: { parser: "atk", schema: AtkSchema },
  skl: { parser: "skl", schema: SklSchema },
  dgn: { parser: "dgn", schema: DgnSchema },
  etc: { parser: "etc", schema: EtcSchema },
  map: { parser: "map", schema: MapSchema },
};

// ─── Public API ─────────────────────────────────────────────────────────────

export function validateParsedDocuments(
  parsed: ParsedPvfDocument[],
  options: ValidateOptions,
): VerificationReport {
  const issues: ValidationIssue[] = [];
  const tier3Fields: Tier3FieldEntry[] = [];
  const pvpFields: PvpFieldEntry[] = [];
  const refs: RefEntry[] = [];

  // Build path → def index for ref resolution. Duplicate paths are a
  // schema-level error (shouldn't happen — extractor emits one doc per path).
  const byPath = new Map<string, ParsedPvfDocument>();
  const duplicatePaths = new Set<string>();
  for (const def of parsed) {
    if (typeof def?.path !== "string" || def.path.length === 0) {
      issues.push({
        level: "error",
        pvfPath: "<unknown>",
        parser: typeof def?.kind === "string" ? def.kind : "<unknown>",
        field: "path",
        code: "missing_path",
        message: "Parsed document has missing or empty path",
      });
      continue;
    }
    if (byPath.has(def.path)) {
      duplicatePaths.add(def.path);
    } else {
      byPath.set(def.path, def);
    }
  }
  for (const path of duplicatePaths) {
    issues.push({
      level: "error",
      pvfPath: path,
      parser: byPath.get(path)?.kind ?? "<unknown>",
      field: "path",
      code: "duplicate_path",
      message: `Duplicate parsed document at path "${path}". Extractor invariant violated.`,
    });
  }

  // Surface parse-stage errors (caller-supplied) into the verification report.
  for (const err of options.parseErrors ?? []) {
    issues.push({
      level: "error",
      pvfPath: err.path,
      parser: "<unknown>",
      field: "<root>",
      code: "parse_failure",
      message: err.message,
    });
  }

  // Per-doc audits
  for (const def of parsed) {
    if (typeof def?.path !== "string" || def.path.length === 0) continue;
    validateSchema(def, issues);
    walkForProvenance(def, def.path, def.kind, "", tier3Fields);
    collectPvpFields(def, pvpFields);
    walkForRefs(def, def.path, "", refs, byPath);
  }

  // Detect ambiguous refs (same fromPath/targetPath appears via multiple ref
  // fields is fine, but reporting marks them — kept simple: count duplicates
  // and elevate to ambiguous only when status differs across entries).
  // For now, all refs are "resolved" or "missing" — ambiguous left as future
  // hook if we add multi-extension targets (e.g. an .ani referenced as both
  // .ani and .img). Tier-1 PVF does not currently produce that shape.

  const errors = issues.filter(i => i.level === "error");
  const warnings = issues.filter(i => i.level === "warning");
  const infos = issues.filter(i => i.level === "info");

  // filesTotal = parsed.length + parseErrors (which never made it to parsed)
  const filesParsed = parsed.length;
  const filesFailed = (options.parseErrors ?? []).length;
  const filesTotal = filesParsed + filesFailed;

  return {
    meta: {
      runId: options.runId,
      startedAt: options.startedAt,
      finishedAt: options.finishedAt,
      pvfHash: options.pvfHash ?? null,
      extractorVersion: options.extractorVersion ?? null,
    },
    stats: {
      filesTotal,
      filesParsed,
      filesFailed,
      errors: errors.length,
      warnings: warnings.length,
      infos: infos.length,
    },
    errors,
    warnings,
    infos,
    tier3Fields,
    pvpFields,
    refIntegrity: refs,
  };
}

export function buildProvenanceAudit(report: VerificationReport): ProvenanceAuditReport {
  const filesWithTier3 = new Set(report.tier3Fields.map(t => t.pvfPath));
  const requiresManualVerificationCount = report.tier3Fields
    .filter(t => t.requiresManualVerification).length;
  return {
    meta: report.meta,
    summary: {
      tier3Count: report.tier3Fields.length,
      filesWithTier3: filesWithTier3.size,
      requiresManualVerificationCount,
    },
    tier3Fields: report.tier3Fields,
  };
}

// ─── Schema validation (per-kind dispatch) ─────────────────────────────────

/**
 * Per-kind schema check. Routes by `def.kind` to a Zod schema; translates
 * each Zod issue into a stable ValidationIssue (code + field path + level).
 *
 * Unknown kinds bypass schema entirely and emit `unknown_kind`.
 */
function validateSchema(def: ParsedPvfDocument, issues: ValidationIssue[]): void {
  const kind = (def as { kind?: unknown }).kind;
  if (typeof kind !== "string" || !(kind in KIND_SCHEMAS)) {
    issues.push({
      level: "error",
      pvfPath: (def as { path?: string }).path ?? "<unknown>",
      parser: "<unknown>",
      field: "kind",
      code: "unknown_kind",
      message: `Unknown ParsedDef.kind="${String(kind)}". Expected one of chr/mob/atk/skl/dgn/etc/map.`,
    });
    return;
  }
  const spec = KIND_SCHEMAS[kind];

  switch (kind) {
    case "chr": validateChrDef(def as ChrDef, issues, spec); break;
    case "mob": validateMobDef(def as MobDef, issues, spec); break;
    case "atk": validateAtkDef(def as AtkDef, issues, spec); break;
    case "skl": validateSklDef(def as SkillDef, issues, spec); break;
    case "dgn": validateDgnDef(def as DungeonDef, issues, spec); break;
    case "etc": validateEtcDef(def as EtcDef, issues, spec); break;
    case "map": validateMapDef(def as MapDef, issues, spec); break;
    default: break; // unreachable — guarded by `kind in KIND_SCHEMAS` above
  }
}

/**
 * Runs the given schema's safeParse against `def`, translating each issue
 * into a ValidationIssue and pushing onto `issues`. Returns nothing.
 *
 * Issue → ValidationIssue contract:
 *   - level: "error" by default (schema violations are hard fails)
 *   - pvfPath: def.path
 *   - parser: kind name
 *   - field: dotted/bracketed path string for human reading
 *   - code: stable code derived via mapIssueToCode (preserves hand-rolled names)
 *   - message: Zod-formatted message prefixed with the field path
 */
function runSchema(
  def: ParsedPvfDocument,
  schema: z.ZodTypeAny,
  parser: string,
  issues: ValidationIssue[],
): void {
  const result = schema.safeParse(def);
  if (result.success) return;
  for (const issue of result.error.issues) {
    const path = issue.path;
    const code = mapIssueToCode(path);
    const fieldStr = fieldPathString(path);
    issues.push({
      level: "error",
      pvfPath: def.path,
      parser,
      field: fieldStr,
      code,
      message: `${parser}: ${fieldStr} — ${issue.message}`,
    });
  }
}

function validateChrDef(def: ChrDef, issues: ValidationIssue[], spec: KindSchemaSpec): void {
  runSchema(def, spec.schema, spec.parser, issues);
}

function validateMobDef(def: MobDef, issues: ValidationIssue[], spec: KindSchemaSpec): void {
  runSchema(def, spec.schema, spec.parser, issues);
}

function validateAtkDef(def: AtkDef, issues: ValidationIssue[], spec: KindSchemaSpec): void {
  runSchema(def, spec.schema, spec.parser, issues);
}

function validateSklDef(def: SkillDef, issues: ValidationIssue[], spec: KindSchemaSpec): void {
  runSchema(def, spec.schema, spec.parser, issues);
}

function validateDgnDef(def: DungeonDef, issues: ValidationIssue[], spec: KindSchemaSpec): void {
  runSchema(def, spec.schema, spec.parser, issues);
}

function validateEtcDef(def: EtcDef, issues: ValidationIssue[], spec: KindSchemaSpec): void {
  runSchema(def, spec.schema, spec.parser, issues);

  // Cross-check (warning, not schema): entries[].key must all be findable
  // in byKey. Schema already guarantees entries[].key is a string and byKey
  // values are EtcKeyValueEntry — this is a *consistency* check across two
  // schema-valid sub-trees, so it stays hand-rolled and emits at WARNING
  // level (matches H13-10 expectation).
  const entries = Array.isArray((def as EtcDef).entries) ? (def as EtcDef).entries : [];
  const byKey = ((def as EtcDef).byKey ?? {}) as Record<string, unknown>;
  for (const entry of entries) {
    if (typeof entry?.key !== "string" || entry.key.length === 0) continue; // schema already flagged this
    if (!(entry.key in byKey)) {
      issues.push({
        level: "warning",
        pvfPath: def.path,
        parser: "etc",
        field: `byKey["${entry.key}"]`,
        code: "etc_bykey_missing",
        message: `EtcDef.byKey missing entry for key "${entry.key}" (present in entries[])`,
      });
    }
  }
}

function validateMapDef(def: MapDef, issues: ValidationIssue[], spec: KindSchemaSpec): void {
  runSchema(def, spec.schema, spec.parser, issues);
}

// ─── Generic walkers ────────────────────────────────────────────────────────

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0;

/**
 * Walk a typed ParsedDef recursively looking for PvfFact-shaped objects
 * (i.e., have a `provenance` object plus optional `sourceType` /
 * `requiresManualVerification`). When `sourceType` is not "tier1"/"tier2"
 * OR `requiresManualVerification` is true, record as a Tier-3 entry.
 *
 * Skips `raw` (PvfDocument) and `sections` (PvfSection[]) to avoid walking
 * the raw extraction tree — fields-of-interest live on the parsed level.
 */
function walkForProvenance(
  obj: unknown,
  pvfPath: string,
  parserKind: string,
  prefix: string,
  out: Tier3FieldEntry[],
): void {
  if (obj === null || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => walkForProvenance(item, pvfPath, parserKind, `${prefix}[${i}]`, out));
    return;
  }
  const o = obj as Record<string, unknown>;

  // PvfFact detection: must have `provenance` object. `value` may be number,
  // string, vector, or boolean. We bias for false positives but the keys
  // sourceType/requiresManualVerification narrow it.
  if (isObject(o.provenance) && ("sourceType" in o || "requiresManualVerification" in o)) {
    const sourceType = typeof o.sourceType === "string" ? o.sourceType : "tier1";
    const requiresManual = o.requiresManualVerification === true;
    if (sourceType !== "tier1" && sourceType !== "tier2" || requiresManual) {
      const provenance = o.provenance as { sectionName?: string };
      const fieldName = isNonEmptyString(provenance.sectionName)
        ? provenance.sectionName
        : (prefix || "<root>");
      out.push({
        pvfPath,
        field: fieldName,
        sourceType,
        requiresManualVerification: requiresManual,
      });
    }
  }

  for (const [key, value] of Object.entries(o)) {
    // Skip raw PVF inputs (they don't carry parsed provenance) and the
    // top-level provenance object itself (already inspected via parent).
    if (key === "raw" || key === "sections" || key === "provenance") continue;
    walkForProvenance(value, pvfPath, parserKind, prefix ? `${prefix}.${key}` : key, out);
  }
}

/**
 * Walk a typed ParsedDef looking for PvfRef-shaped objects
 * (`{ targetKind, targetPath, raw }`). For each, check whether targetPath is
 * a known parsed document; record status="resolved" or "missing".
 */
function walkForRefs(
  obj: unknown,
  fromPath: string,
  prefix: string,
  out: RefEntry[],
  byPath: Map<string, ParsedPvfDocument>,
): void {
  if (obj === null || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => walkForRefs(item, fromPath, `${prefix}[${i}]`, out, byPath));
    return;
  }
  const o = obj as Record<string, unknown>;

  // PvfRef shape: { targetKind: string, targetPath: string, raw: string }
  if (isNonEmptyString(o.targetKind) && isNonEmptyString(o.targetPath) && typeof o.raw === "string") {
    const status: RefStatus = byPath.has(o.targetPath) ? "resolved" : "missing";
    out.push({
      fromPath,
      fromField: prefix.length > 0 ? prefix : "<root>",
      toPath: o.targetPath,
      targetKind: o.targetKind,
      status,
    });
    return;  // Don't descend into a Ref; it has no nested refs.
  }

  for (const [key, value] of Object.entries(o)) {
    if (key === "raw" || key === "sections") continue;
    walkForRefs(value, fromPath, prefix ? `${prefix}.${key}` : key, out, byPath);
  }
}

/**
 * Collect PvP scope fields per [[feedback-dnf-pve-scope-only]].
 *
 * PvE-only Combat Lab: these fields are read by parsers (full 1:1 PVF fidelity)
 * but the runtime ignores them. The audit surfaces which docs carry PvP content
 * so callers can confirm scope compliance without re-parsing.
 *
 *   AtkDef.pvpOnly === true       → record
 *   SkillDef.hasPvp === true       → record
 *   MapDef.pvpStartArea has any non-zero → record (zero-only is placeholder)
 */
function collectPvpFields(def: ParsedPvfDocument, out: PvpFieldEntry[]): void {
  switch (def.kind) {
    case "atk":
      if (def.pvpOnly === true) {
        out.push({
          pvfPath: def.path, parser: "atk", field: "pvpOnly",
          reason: "AtkDef.pvpOnly=true — attack restricted to PvP mode",
        });
      }
      return;
    case "skl":
      if (def.hasPvp === true) {
        out.push({
          pvfPath: def.path, parser: "skl", field: "hasPvp",
          reason: "SkillDef.hasPvp=true — skill has a `pvp` section block",
        });
      }
      return;
    case "map":
      // Real PVF often emits all-zero pvpStartArea as a placeholder. Only
      // record when at least one non-zero coordinate is present — that's
      // the signal the map actually has PvP spawn data.
      if (Array.isArray(def.pvpStartArea) && def.pvpStartArea.length > 0 && def.pvpStartArea.some(v => v !== 0)) {
        out.push({
          pvfPath: def.path, parser: "map", field: "pvpStartArea",
          reason: `MapDef.pvpStartArea has ${def.pvpStartArea.filter(v => v !== 0).length} non-zero entries`,
        });
      }
      return;
    default:
      return;
  }
}
