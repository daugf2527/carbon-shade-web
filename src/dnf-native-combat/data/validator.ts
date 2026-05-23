/**
 * Stage 1 VALIDATE L2 — validates PARSE stage output before LOAD.
 *
 * Per docs/plans/2026-05-22-stage1-data-pipeline-design.md §2.2:
 *   EXTRACT → PARSE → **VALIDATE (L2)** → LOAD → EXPORT
 *
 * VALIDATE L2 produces a structured report covering:
 *   1. Schema sanity (kind correct, key fields present, types match)
 *   2. Ref integrity (PvfRef.targetPath resolvable against parsed set)
 *   3. Provenance audit (Tier-3 / local_baseline / requiresManualVerification)
 *   4. PvP scope (per [[feedback-dnf-pve-scope-only]]: read all, runtime ignores)
 *   5. 3-level error model (error → fail run, warning → continue, info → log)
 *
 * Design decisions:
 *   - **Hand-rolled (no Zod)** — project keeps deps minimal; Day 12 SQLite uses
 *     node:sqlite "零 npm 依赖" by the same principle. Each schema check
 *     is explicit, surfacing exact field paths instead of opaque parse errors.
 *   - **Generic walker** for provenance + refs — every ParsedDef is a tree
 *     of typed fields; one walker handles all 7 (and forward-compat to 9).
 *   - **Pure** — given the same parsed[] input, produces identical reports.
 *     Test fixtures pin runId/startedAt/finishedAt for determinism.
 */

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
  /** "local_baseline" or any future SourceConfidenceTier other than "tier1"/"tier2". */
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
 * Per-kind schema check. Confirms the parsed object's required fields are
 * present with correct types. Parsers already throw on most invariant
 * violations during parse; this stage catches anything they may have missed.
 *
 * Reports `error` (kind unknown, required missing/wrong-type) and `warning`
 * (optional present but wrong type) issues into the shared issues list.
 */
function validateSchema(def: ParsedPvfDocument, issues: ValidationIssue[]): void {
  switch (def.kind) {
    case "chr": return validateChrDef(def, issues);
    case "mob": return validateMobDef(def, issues);
    case "atk": return validateAtkDef(def, issues);
    case "skl": return validateSklDef(def, issues);
    case "dgn": return validateDgnDef(def, issues);
    case "etc": return validateEtcDef(def, issues);
    case "map": return validateMapDef(def, issues);
    default:
      issues.push({
        level: "error",
        pvfPath: (def as { path?: string }).path ?? "<unknown>",
        parser: "<unknown>",
        field: "kind",
        code: "unknown_kind",
        message: `Unknown ParsedDef.kind="${String((def as { kind: unknown }).kind)}". Expected one of chr/mob/atk/skl/dgn/etc/map.`,
      });
  }
}

function requireField(
  obj: unknown,
  pvfPath: string,
  parser: string,
  field: string,
  predicate: (v: unknown) => boolean,
  code: string,
  message: string,
  issues: ValidationIssue[],
  level: ValidationLevel = "error",
): boolean {
  const value = (obj as Record<string, unknown>)?.[field];
  if (!predicate(value)) {
    issues.push({ level, pvfPath, parser, field, code, message });
    return false;
  }
  return true;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0;
const isFiniteNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const isArray = (v: unknown): v is unknown[] => Array.isArray(v);
const isBoolean = (v: unknown): v is boolean => typeof v === "boolean";

function validateChrDef(def: ChrDef, issues: ValidationIssue[]): void {
  const p = def.path;
  requireField(def, p, "chr", "kind", v => v === "chr", "wrong_kind", "ChrDef.kind must be 'chr'", issues);
  requireField(def, p, "chr", "provenance", isObject, "missing_provenance", "ChrDef.provenance must be object", issues);
  requireField(def, p, "chr", "sections", isArray, "missing_sections", "ChrDef.sections must be array", issues);
  requireField(def, p, "chr", "job", isObject, "missing_job", "ChrDef.job (required PvfStringFact) missing", issues);
  requireField(def, p, "chr", "jumpPower", isObject, "missing_jump_power", "ChrDef.jumpPower (required PvfFact<number>) missing", issues);
  requireField(def, p, "chr", "jumpSpeed", isObject, "missing_jump_speed", "ChrDef.jumpSpeed (required PvfFact<number>) missing", issues);
  requireField(def, p, "chr", "weight", isObject, "missing_weight", "ChrDef.weight (required PvfFact<number>) missing", issues);
  requireField(def, p, "chr", "widthBox", isArray, "missing_width_box", "ChrDef.widthBox must be array", issues);
  requireField(def, p, "chr", "growth", isObject, "missing_growth", "ChrDef.growth must be object", issues);
  requireField(def, p, "chr", "weaponHitInfo", isArray, "missing_weapon_hit_info", "ChrDef.weaponHitInfo must be array", issues);
  requireField(def, p, "chr", "attackInfo", isObject, "missing_attack_info", "ChrDef.attackInfo must be object", issues);
  requireField(def, p, "chr", "motionRefs", isObject, "missing_motion_refs", "ChrDef.motionRefs must be object", issues);
}

function validateMobDef(def: MobDef, issues: ValidationIssue[]): void {
  const p = def.path;
  requireField(def, p, "mob", "kind", v => v === "mob", "wrong_kind", "MobDef.kind must be 'mob'", issues);
  requireField(def, p, "mob", "provenance", isObject, "missing_provenance", "MobDef.provenance must be object", issues);
  requireField(def, p, "mob", "sections", isArray, "missing_sections", "MobDef.sections must be array", issues);
  requireField(def, p, "mob", "attackInfo", isArray, "missing_attack_info", "MobDef.attackInfo must be array", issues);
  requireField(def, p, "mob", "animationRefs", isArray, "missing_animation_refs", "MobDef.animationRefs must be array", issues);
  requireField(def, p, "mob", "category", isArray, "missing_category", "MobDef.category must be array", issues);
}

function validateAtkDef(def: AtkDef, issues: ValidationIssue[]): void {
  const p = def.path;
  requireField(def, p, "atk", "kind", v => v === "atk", "wrong_kind", "AtkDef.kind must be 'atk'", issues);
  requireField(def, p, "atk", "provenance", isObject, "missing_provenance", "AtkDef.provenance must be object", issues);
  requireField(def, p, "atk", "attackEnemy", isBoolean, "missing_attack_enemy", "AtkDef.attackEnemy must be boolean", issues);
  requireField(def, p, "atk", "attackFriend", isBoolean, "missing_attack_friend", "AtkDef.attackFriend must be boolean", issues);
  requireField(def, p, "atk", "pvpOnly", isBoolean, "missing_pvp_only", "AtkDef.pvpOnly must be boolean", issues);
  const validKinds = new Set(["physic", "magic", null]);
  if (!validKinds.has(def.attackKind)) {
    issues.push({
      level: "error", pvfPath: p, parser: "atk", field: "attackKind",
      code: "invalid_attack_kind",
      message: `AtkDef.attackKind must be one of physic/magic/null, got "${String(def.attackKind)}"`,
    });
  }
  const validReactions = new Set(["none", "hit_down", "hit_lift_up", "hit_horizon"]);
  if (!validReactions.has(def.hitReaction)) {
    issues.push({
      level: "error", pvfPath: p, parser: "atk", field: "hitReaction",
      code: "invalid_hit_reaction",
      message: `AtkDef.hitReaction invalid: "${String(def.hitReaction)}"`,
    });
  }
}

function validateSklDef(def: SkillDef, issues: ValidationIssue[]): void {
  const p = def.path;
  requireField(def, p, "skl", "kind", v => v === "skl", "wrong_kind", "SkillDef.kind must be 'skl'", issues);
  requireField(def, p, "skl", "provenance", isObject, "missing_provenance", "SkillDef.provenance must be object", issues);
  requireField(def, p, "skl", "hasPvp", isBoolean, "missing_has_pvp", "SkillDef.hasPvp must be boolean", issues);
  requireField(def, p, "skl", "hasDungeon", isBoolean, "missing_has_dungeon", "SkillDef.hasDungeon must be boolean", issues);
  const validTypes = new Set(["active", "passive", "unknown"]);
  if (!validTypes.has(def.skillType)) {
    issues.push({
      level: "error", pvfPath: p, parser: "skl", field: "skillType",
      code: "invalid_skill_type",
      message: `SkillDef.skillType invalid: "${String(def.skillType)}"`,
    });
  }
}

function validateDgnDef(def: DungeonDef, issues: ValidationIssue[]): void {
  const p = def.path;
  requireField(def, p, "dgn", "kind", v => v === "dgn", "wrong_kind", "DungeonDef.kind must be 'dgn'", issues);
  requireField(def, p, "dgn", "provenance", isObject, "missing_provenance", "DungeonDef.provenance must be object", issues);
  requireField(def, p, "dgn", "sections", isArray, "missing_sections", "DungeonDef.sections must be array", issues);
  requireField(def, p, "dgn", "enteringTitleRefs", isArray, "missing_entering_title_refs", "DungeonDef.enteringTitleRefs must be array", issues);
  requireField(def, p, "dgn", "imageRefs", isArray, "missing_image_refs", "DungeonDef.imageRefs must be array", issues);
  requireField(def, p, "dgn", "raw", isObject, "missing_raw", "DungeonDef.raw must be object", issues);
}

function validateEtcDef(def: EtcDef, issues: ValidationIssue[]): void {
  const p = def.path;
  requireField(def, p, "etc", "kind", v => v === "etc", "wrong_kind", "EtcDef.kind must be 'etc'", issues);
  requireField(def, p, "etc", "provenance", isObject, "missing_provenance", "EtcDef.provenance must be object", issues);
  requireField(def, p, "etc", "entries", isArray, "missing_entries", "EtcDef.entries must be array", issues);
  requireField(def, p, "etc", "byKey", isObject, "missing_by_key", "EtcDef.byKey must be object", issues);
  // Cross-check: entries[].key must all be findable in byKey (entries is source of truth)
  for (const entry of def.entries) {
    if (!isNonEmptyString(entry.key)) {
      issues.push({
        level: "error", pvfPath: p, parser: "etc", field: "entries[].key",
        code: "etc_entry_missing_key",
        message: "EtcDef entry has missing or non-string key",
      });
    } else if (!(entry.key in def.byKey)) {
      issues.push({
        level: "warning", pvfPath: p, parser: "etc", field: `byKey["${entry.key}"]`,
        code: "etc_bykey_missing",
        message: `EtcDef.byKey missing entry for key "${entry.key}" (present in entries[])`,
      });
    }
  }
}

function validateMapDef(def: MapDef, issues: ValidationIssue[]): void {
  const p = def.path;
  requireField(def, p, "map", "kind", v => v === "map", "wrong_kind", "MapDef.kind must be 'map'", issues);
  requireField(def, p, "map", "provenance", isObject, "missing_provenance", "MapDef.provenance must be object", issues);
  requireField(def, p, "map", "sections", isArray, "missing_sections", "MapDef.sections must be array", issues);
  requireField(def, p, "map", "tiles", isArray, "missing_tiles", "MapDef.tiles must be array", issues);
  requireField(def, p, "map", "monsterSpawns", isArray, "missing_monster_spawns", "MapDef.monsterSpawns must be array", issues);
  requireField(def, p, "map", "animationRefs", isArray, "missing_animation_refs", "MapDef.animationRefs must be array", issues);
  requireField(def, p, "map", "pvpStartArea", isArray, "missing_pvp_start_area", "MapDef.pvpStartArea must be array (PvE scope: read but ignore)", issues);
}

// ─── Generic walkers ────────────────────────────────────────────────────────

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
      if (def.pvpStartArea.length > 0 && def.pvpStartArea.some(v => v !== 0)) {
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
