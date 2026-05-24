/**
 * Stage 1 EXPORT — entity-centric JSON shards + manifest.
 *
 * Per docs/plans/2026-05-22-stage1-data-pipeline-design.md §4:
 *   dist/data/players/<job>.json       — chr + skl + ani + atk inline
 *   dist/data/monsters/<id>.json       — mob + atk + ani inline
 *   dist/data/dungeons/<id>.json       — dgn + map + monsterRefs (refs only, not inline)
 *   dist/data/shared/physics.json      — global constants
 *   dist/data/shared/enums.json        — enum dictionaries
 *   dist/data/manifest.json            — index + sha256 + sizeBytes
 *
 * PvP scope filtering (per [[feedback-dnf-pve-scope-only]] + design §6):
 *   - AtkDef where pvpOnly===true → omitted entirely from runtime JSON
 *   - MapDef.pvpStartArea → cleared to [] before export
 *   - SkillDef.hasPvp flag preserved (the skill itself remains; PvE/PvP
 *     branches inside raw sections are out of scope to selectively prune)
 *
 * Not yet inlined: AniDef. Standalone-parser path (per design §2.2.1) means
 * .ani docs don't flow through ParsedPvfDocument. EXPORT accepts an optional
 * `aniDefs` input to inline animations when present; otherwise the
 * `animations` map is empty and runtime can lazy-load.
 */

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { AtkDef } from "../types/AtkDef.js";
import type { ChrDef } from "../types/ChrDef.js";
import type { MobDef } from "../types/MobDef.js";
import type { SkillDef } from "../types/SklDef.js";
import type { DungeonDef } from "../types/DgnDef.js";
import type { EtcDef } from "../types/EtcDef.js";
import type { MapDef } from "../types/MapDef.js";
import type { AniDef } from "../types/AniDef.js";
import type { ParsedPvfDocument } from "../pipeline/parseStage.js";

// ─── Public shape contracts (mirror design §4.2) ───────────────────────────

export const SHAPE_VERSION = "1.0.0";

export interface PlayerRuntimeShape {
  shape_version: string;
  job: string;                            // entity id (e.g. "swordman")
  chr: ChrDef;
  skills: Record<string, SkillDef>;       // key: skill file basename (no .skl)
  animations: Record<string, AniDef>;     // key: ani file basename (no .ani)
  attacks: Record<string, AtkDef>;        // key: atk file basename (no .atk)
  etc: EtcDef | null;                     // character/characteretc/<job>.etc when present
}

export interface MonsterRuntimeShape {
  shape_version: string;
  id: string;                             // entity id (e.g. "goblin")
  mob: MobDef;
  attacks: Record<string, AtkDef>;
  animations: Record<string, AniDef>;
}

export interface DungeonRuntimeShape {
  shape_version: string;
  id: string;                             // dungeon entity id
  dgn: DungeonDef;
  maps: MapDef[];                         // included by MapDef.dungeonId matching DungeonDef
  monsterRefs: string[];                  // monster IDs only (don't inline mobs — runtime lazy-loads)
}

export interface SharedPhysicsShape {
  shape_version: string;
  constants: Record<string, unknown>;
}

export interface SharedEnumsShape {
  shape_version: string;
  tables: Record<string, Record<string, string>>;
  field_to_enum: Record<string, string>;
}

// ─── Manifest ──────────────────────────────────────────────────────────────

export type RuntimeKind = "player" | "monster" | "dungeon" | "shared";

export interface RuntimeManifestEntry {
  path: string;          // relative to outDir
  sha256: string;
  sizeBytes: number;
  kind: RuntimeKind;
  shape_version: string;
  /**
   * sha256 of the content fingerprint (per-field provenance.extractTimestamp
   * stripped before hashing). Present iff `useContentFingerprint` was true at
   * write time. Lets a subsequent export skip a shard whose semantic content
   * is unchanged across distinct extractor runs (where raw sha256 would
   * differ purely because of timestamp drift).
   */
  contentSha256?: string;
}

export interface RuntimeManifest {
  manifest_version: string;
  exported_at: string;
  pvf_hash: string | null;
  extractor_version: string | null;
  files: RuntimeManifestEntry[];
}

const MANIFEST_VERSION = "1.0.0";

// ─── Public API ────────────────────────────────────────────────────────────

export interface ExportOptions {
  /** Output root (e.g. "dist/data"). */
  outDir: string;
  parsed: ReadonlyArray<ParsedPvfDocument>;
  /** Optional inline animations. When omitted, `animations` shape field stays {}. */
  aniDefs?: ReadonlyArray<AniDef>;
  meta: {
    pvfHash: string | null;
    extractorVersion: string | null;
    exportedAt: string;
  };
  /** Optional override for shared/physics.json content. */
  sharedPhysics?: Record<string, unknown>;
  /** Optional override for shared/enums.json content. */
  sharedEnums?: { tables: Record<string, Record<string, string>>; field_to_enum: Record<string, string> };
  /**
   * Incremental mode: when an existing manifest is provided, shards whose
   * computed sha256 matches the prior entry are NOT rewritten to disk.
   * Manifest entries for skipped shards retain prior path/sha256/sizeBytes
   * verbatim. The reported `filesWritten` excludes skipped shards but
   * `manifest.files` still lists them (consumers need the full index).
   *
   * Caveat: sha256 reflects the *complete* shard JSON, including per-field
   * provenance.extractTimestamp. PVF re-extraction generates fresh timestamps,
   * so byte-identical shards are uncommon across distinct extractor runs.
   * Incremental skip is most useful when the same parsed[]+aniDefs[] is
   * re-exported (e.g. retry after a transient I/O failure, or split-stage
   * pipeline where EXPORT is invoked without re-running EXTRACT). For
   * content-equivalence skip across extractor runs, set `useContentFingerprint`
   * (Day 17 work).
   */
  incrementalBaseManifest?: RuntimeManifest;
  /**
   * When true, the incremental-skip comparison uses a `contentSha256`
   * fingerprint (sha256 of shard JSON with every `provenance.extractTimestamp`
   * replaced by a fixed sentinel) instead of the raw sha256. This lets a
   * re-export of byte-equivalent content — extracted at a different time —
   * skip rewriting the file. The manifest entry's `sha256` field still
   * reflects the raw on-disk bytes; a new `contentSha256` field is added
   * alongside it. Default: false (preserves Day 13 raw-sha256 behavior).
   *
   * Recommended usage: set true for any pipeline where EXTRACT is re-run
   * end-to-end against the same PVF (smoke tests, daily rebuilds), so that
   * EXPORT can short-circuit on content equivalence rather than incidental
   * timestamp drift.
   */
  useContentFingerprint?: boolean;
}

export interface ExportResult {
  outDir: string;
  manifestPath: string;
  manifest: RuntimeManifest;
  /** Number of shards actually written to disk this run (excludes incremental skips). */
  filesWritten: number;
  /** Number of shards skipped because their sha256 matched the base manifest. */
  filesSkipped: number;
  durationMs: number;
}

export async function exportRuntimeShards(options: ExportOptions): Promise<ExportResult> {
  const startedAtMs = Date.now();
  const entries: RuntimeManifestEntry[] = [];
  let writtenCount = 0;
  let skippedCount = 0;

  // Build a path → entry index from the base manifest for incremental diff.
  const baseByPath = new Map<string, RuntimeManifestEntry>();
  for (const e of options.incrementalBaseManifest?.files ?? []) {
    baseByPath.set(e.path, e);
  }

  const queueWrite = async (relPath: string, shape: unknown, kind: RuntimeKind) => {
    const result = await writeShardIncremental(
      options.outDir, relPath, shape, kind, baseByPath.get(relPath),
      options.useContentFingerprint === true,
    );
    entries.push(result.entry);
    if (result.wrote) writtenCount += 1; else skippedCount += 1;
  };

  // Index parsed defs by kind for entity composition
  const byPath = new Map<string, ParsedPvfDocument>();
  const chrs: ChrDef[] = [];
  const mobs: MobDef[] = [];
  const skls: SkillDef[] = [];
  const atks: AtkDef[] = [];
  const dgns: DungeonDef[] = [];
  const etcs: EtcDef[] = [];
  const maps: MapDef[] = [];
  for (const def of options.parsed) {
    byPath.set(def.path, def);
    switch (def.kind) {
      case "chr": chrs.push(def); break;
      case "mob": mobs.push(def); break;
      case "skl": skls.push(def); break;
      case "atk": atks.push(def); break;
      case "dgn": dgns.push(def); break;
      case "etc": etcs.push(def); break;
      case "map": maps.push(def); break;
    }
  }

  // Index animations by basename for lookup during entity composition
  const aniByPath = new Map<string, AniDef>();
  for (const ani of options.aniDefs ?? []) {
    aniByPath.set(ani.path, ani);
  }

  // ── Players ──────────────────────────────────────────────────────────
  for (const chr of chrs) {
    const job = chrJob(chr.path);
    if (job === null) continue;

    const playerSkills: Record<string, SkillDef> = {};
    for (const skl of skls) {
      if (skl.path.startsWith(`skill/${job}/`)) {
        playerSkills[basenameWithoutExt(skl.path)] = skl;
      }
    }
    const playerAttacks: Record<string, AtkDef> = {};
    for (const atk of atks) {
      if (atk.path.startsWith(`character/${job}/attackinfo/`) && !isPvpOnlyAtk(atk)) {
        playerAttacks[basenameWithoutExt(atk.path)] = atk;
      }
    }
    const playerAnims: Record<string, AniDef> = {};
    for (const [aniPath, ani] of aniByPath) {
      if (aniPath.startsWith(`character/${job}/animation/`)) {
        playerAnims[basenameWithoutExt(aniPath)] = ani;
      }
    }
    const playerEtc = etcs.find(e => e.path === `character/characteretc/${job}.etc`) ?? null;

    const shape: PlayerRuntimeShape = {
      shape_version: SHAPE_VERSION,
      job,
      chr,
      skills: playerSkills,
      animations: playerAnims,
      attacks: playerAttacks,
      etc: playerEtc,
    };
    await queueWrite(`players/${job}.json`, shape, "player");
  }

  // ── Monsters ─────────────────────────────────────────────────────────
  for (const mob of mobs) {
    const id = mobId(mob.path);
    if (id === null) continue;

    const monsterAttacks: Record<string, AtkDef> = {};
    for (const atk of atks) {
      if (atk.path.startsWith(`monster/${id}/attackinfo/`) && !isPvpOnlyAtk(atk)) {
        monsterAttacks[basenameWithoutExt(atk.path)] = atk;
      }
    }
    const monsterAnims: Record<string, AniDef> = {};
    for (const [aniPath, ani] of aniByPath) {
      if (aniPath.startsWith(`monster/${id}/animation/`)) {
        monsterAnims[basenameWithoutExt(aniPath)] = ani;
      }
    }

    const shape: MonsterRuntimeShape = {
      shape_version: SHAPE_VERSION,
      id,
      mob,
      attacks: monsterAttacks,
      animations: monsterAnims,
    };
    await queueWrite(`monsters/${id}.json`, shape, "monster");
  }

  // ── Dungeons ─────────────────────────────────────────────────────────
  for (const dgn of dgns) {
    const id = dungeonId(dgn.path);
    if (id === null) continue;

    const dungeonMaps = maps
      .filter(m => m.path.startsWith(`map/${id}/`))
      .map(m => sanitizeMapForRuntime(m));

    const monsterRefs: string[] = [];

    const shape: DungeonRuntimeShape = {
      shape_version: SHAPE_VERSION,
      id,
      dgn,
      maps: dungeonMaps,
      monsterRefs,
    };
    await queueWrite(`dungeons/${id}.json`, shape, "dungeon");
  }

  // ── Shared / physics + enums ─────────────────────────────────────────
  if (options.sharedPhysics) {
    const physicsShape: SharedPhysicsShape = {
      shape_version: SHAPE_VERSION,
      constants: options.sharedPhysics,
    };
    await queueWrite("shared/physics.json", physicsShape, "shared");
  }
  if (options.sharedEnums) {
    const enumsShape: SharedEnumsShape = {
      shape_version: SHAPE_VERSION,
      tables: options.sharedEnums.tables,
      field_to_enum: options.sharedEnums.field_to_enum,
    };
    await queueWrite("shared/enums.json", enumsShape, "shared");
  }

  // ── Manifest ─────────────────────────────────────────────────────────
  const manifest: RuntimeManifest = {
    manifest_version: MANIFEST_VERSION,
    exported_at: options.meta.exportedAt,
    pvf_hash: options.meta.pvfHash,
    extractor_version: options.meta.extractorVersion,
    files: entries,
  };
  const manifestPath = join(options.outDir, "manifest.json");
  await mkdir(options.outDir, { recursive: true });
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  return {
    outDir: options.outDir,
    manifestPath,
    manifest,
    filesWritten: writtenCount + 1,  // +1 for manifest itself (always written)
    filesSkipped: skippedCount,
    durationMs: Date.now() - startedAtMs,
  };
}

// ─── Internal helpers ──────────────────────────────────────────────────────

async function writeShardIncremental(
  outDir: string,
  relPath: string,
  shape: unknown,
  kind: RuntimeKind,
  baseEntry: RuntimeManifestEntry | undefined,
  useContentFingerprint: boolean,
): Promise<{ entry: RuntimeManifestEntry; wrote: boolean }> {
  const absPath = join(outDir, relPath);
  const dir = dirnameOf(absPath);
  await mkdir(dir, { recursive: true });

  const json = JSON.stringify(shape, null, 2);
  const sha256 = createHash("sha256").update(json).digest("hex");
  const sizeBytes = Buffer.byteLength(json, "utf-8");
  const shapeVersion = (shape as { shape_version?: string }).shape_version ?? SHAPE_VERSION;
  const contentSha256 = useContentFingerprint
    ? computeContentFingerprint(shape)
    : undefined;

  // Build the manifest entry — contentSha256 only appears when fingerprint
  // mode is on, keeping JSON shape backward-compatible by default.
  const buildEntry = (overrides: Partial<RuntimeManifestEntry> = {}): RuntimeManifestEntry => {
    const entry: RuntimeManifestEntry = {
      path: relPath,
      sha256,
      sizeBytes,
      kind,
      shape_version: shapeVersion,
      ...overrides,
    };
    if (contentSha256 !== undefined) entry.contentSha256 = contentSha256;
    return entry;
  };

  // Incremental skip:
  //   - fingerprint mode: compare baseEntry.contentSha256 with the freshly
  //     computed fingerprint. If baseEntry lacks contentSha256 (e.g. a
  //     pre-Day-17 manifest), fall through to raw-sha256 comparison so we
  //     don't spuriously rewrite.
  //   - default mode: compare raw sha256 (preserves Day 13 semantics).
  // When skipping, retain the prior path/sha256/sizeBytes (assumes the file
  // on disk is unchanged); refresh contentSha256 to the value we just
  // computed so the manifest stays useful for the *next* incremental run.
  if (baseEntry) {
    const skipByFingerprint =
      useContentFingerprint &&
      baseEntry.contentSha256 !== undefined &&
      contentSha256 !== undefined &&
      baseEntry.contentSha256 === contentSha256;
    const skipByRaw = baseEntry.sha256 === sha256;
    if (skipByFingerprint || skipByRaw) {
      return {
        entry: buildEntry({
          path: baseEntry.path,
          sha256: baseEntry.sha256,
          sizeBytes: baseEntry.sizeBytes,
          shape_version: baseEntry.shape_version,
        }),
        wrote: false,
      };
    }
  }

  await writeFile(absPath, json);
  return {
    entry: buildEntry(),
    wrote: true,
  };
}

/**
 * Compute a content fingerprint: shape JSON with every timestamp-bearing
 * field replaced by a fixed sentinel, then sha256'd. Two extractor runs that
 * produce semantically identical shards but different timestamps yield
 * identical fingerprints.
 *
 * Stripped keys (both naming conventions surface inside shards):
 *   - `extractTimestamp` — camelCase from ParsedFieldProvenance
 *     (every PvfFact in a parsed def carries one).
 *   - `extract_timestamp` — snake_case from the raw PvfDocument
 *     (preserved inside `parsedDef.raw`; the C++ extractor emits this name).
 *
 * The sentinel string `"<stripped:extractTimestamp>"` is deliberately
 * impossible inside real provenance (ISO 8601 timestamps never contain `<`
 * or `>`), so collisions with real data are not a concern.
 *
 * Implementation: structural walk that materializes a stripped copy, then
 * stringifies with the same `(value, null, 2)` formatter used for on-disk
 * shard JSON. Object key ordering is preserved (insertion order), so the
 * fingerprint is deterministic across calls.
 */
export function computeContentFingerprint(shape: unknown): string {
  const stripped = stripExtractTimestamps(shape);
  const json = JSON.stringify(stripped, null, 2);
  return createHash("sha256").update(json).digest("hex");
}

const TIMESTAMP_SENTINEL = "<stripped:extractTimestamp>";
const TIMESTAMP_KEYS = new Set(["extractTimestamp", "extract_timestamp"]);

function stripExtractTimestamps(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map(stripExtractTimestamps);
  }
  // Object: clone with each value walked. If the current node carries a known
  // timestamp key (camelCase parsed-side or snake_case raw-side), replace
  // that field's value with the sentinel.
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (TIMESTAMP_KEYS.has(key) && typeof v === "string") {
      out[key] = TIMESTAMP_SENTINEL;
    } else {
      out[key] = stripExtractTimestamps(v);
    }
  }
  return out;
}

function dirnameOf(p: string): string {
  const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return idx >= 0 ? p.slice(0, idx) : ".";
}

function basenameWithoutExt(pvfPath: string): string {
  const slash = pvfPath.lastIndexOf("/");
  const base = slash < 0 ? pvfPath : pvfPath.slice(slash + 1);
  const dot = base.lastIndexOf(".");
  return dot < 0 ? base : base.slice(0, dot);
}

function chrJob(chrPath: string): string | null {
  // character/<job>/<job>.chr
  const parts = chrPath.split("/");
  if (parts[0] !== "character" || parts.length < 3) return null;
  return parts[1];
}

function mobId(mobPath: string): string | null {
  // monster/<id>/<id>.mob — or any depth ≥3 under monster/
  const parts = mobPath.split("/");
  if (parts[0] !== "monster" || parts.length < 3) return null;
  return parts[1];
}

function dungeonId(dgnPath: string): string | null {
  // dungeon/<id>/<id>.dgn or dungeon/<id>.dgn
  const parts = dgnPath.split("/");
  if (parts[0] !== "dungeon" || parts.length < 2) return null;
  const last = parts[parts.length - 1];
  return last.replace(/\.dgn$/i, "");
}

function isPvpOnlyAtk(atk: AtkDef): boolean {
  return atk.pvpOnly === true;
}

function sanitizeMapForRuntime(m: MapDef): MapDef {
  // PvE-only scope: clear pvpStartArea before export. See
  // [[feedback-dnf-pve-scope-only]] and design §6 line 391.
  return { ...m, pvpStartArea: [] };
}
