/**
 * Stage 1 LOAD — imports VALIDATE stage output into a SQLite mirror DB.
 *
 * Per docs/plans/2026-05-22-stage1-data-pipeline-design.md §3:
 *   - `pvf_files` — one row per PVF entry, raw + parsed JSON + provenance.
 *   - `extraction_runs` — one row per pipeline invocation, with stats.
 *   - `refs` — one row per PvfRef from VALIDATE's refIntegrity walk.
 *   - 10 per-domain VIEW (characters / monsters / skills / attacks /
 *     animations / dungeons / maps / etc_entries / nuts / imgs) using
 *     json_extract() for typed field access.
 *
 * Zero npm deps — uses node:sqlite (built-in since Node 22.5; experimental
 * warning is benign).
 *
 * Upsert semantics: `pvf_files.pvf_path UNIQUE`. Re-imports replace existing
 * rows. Incremental mode skips rows whose `source_pvf_hash` matches the prior
 * write — set `mode: "incremental"` to enable.
 */

import { DatabaseSync, type StatementSync } from "node:sqlite";
import type { PvfDocument } from "../types/PvfDocument.js";
import type { ParsedPvfDocument } from "../pipeline/parseStage.js";
import type { VerificationReport } from "../validator.js";

// ─── Public types ───────────────────────────────────────────────────────────

export type ImportMode = "full" | "incremental" | "partial";

export interface SqliteImportOptions {
  /** Filesystem path or ":memory:" for an ephemeral DB. */
  dbPath: string;
  mode?: ImportMode;
}

export interface SqliteImportResult {
  dbPath: string;
  runId: number;
  filesUpserted: number;
  filesSkipped: number;
  refsInserted: number;
  durationMs: number;
}

// ─── Schema (idempotent — CREATE IF NOT EXISTS) ─────────────────────────────

/**
 * Mirror table — one row per PVF entry.
 * pvf_path is UNIQUE so subsequent runs upsert in place.
 */
const SCHEMA_PVF_FILES = `
CREATE TABLE IF NOT EXISTS pvf_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pvf_path TEXT UNIQUE NOT NULL,
  extension TEXT NOT NULL,
  file_size INTEGER,
  source_pvf_hash TEXT,
  raw_json TEXT NOT NULL,
  parsed_json TEXT,
  extracted_at TEXT NOT NULL,
  extractor_version TEXT,
  parsed_at TEXT,
  parser_version TEXT,
  last_run_id INTEGER
);
`;

const SCHEMA_EXTRACTION_RUNS = `
CREATE TABLE IF NOT EXISTS extraction_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_uid TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  pvf_hash TEXT,
  mode TEXT,
  files_total INTEGER,
  files_extracted INTEGER,
  files_failed INTEGER,
  errors INTEGER,
  warnings INTEGER,
  status TEXT
);
`;

const SCHEMA_REFS = `
CREATE TABLE IF NOT EXISTS refs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  from_path TEXT NOT NULL,
  from_field TEXT NOT NULL,
  to_path TEXT,
  ref_type TEXT,
  status TEXT,
  FOREIGN KEY (run_id) REFERENCES extraction_runs(id)
);
`;

const SCHEMA_INDEXES = [
  "CREATE INDEX IF NOT EXISTS idx_pvf_files_ext ON pvf_files(extension);",
  "CREATE INDEX IF NOT EXISTS idx_refs_run ON refs(run_id);",
  "CREATE INDEX IF NOT EXISTS idx_refs_from ON refs(from_path);",
  "CREATE INDEX IF NOT EXISTS idx_refs_to ON refs(to_path);",
  "CREATE INDEX IF NOT EXISTS idx_refs_status ON refs(status);",
];

/**
 * Per-domain VIEW definitions — 10 views, one per parser kind.
 * Each surfaces a handful of common typed fields via json_extract() and
 * preserves the full parsed_json for arbitrary lookups.
 *
 * `parsed_json` keys reflect the ParsedPvfDocument shape produced by parseStage.
 * Field paths are conservative (no nested traversal beyond `.value` for facts).
 */
const SCHEMA_VIEWS: Array<{ name: string; sql: string }> = [
  {
    name: "characters",
    sql: `
CREATE VIEW IF NOT EXISTS characters AS
SELECT id, pvf_path,
  json_extract(parsed_json, '$.job.value') AS job,
  json_extract(parsed_json, '$.jumpPower.value') AS jump_power,
  json_extract(parsed_json, '$.jumpSpeed.value') AS jump_speed,
  json_extract(parsed_json, '$.weight.value') AS weight,
  json_extract(parsed_json, '$.moveSpeed.value') AS move_speed,
  parsed_json AS data
FROM pvf_files WHERE extension = 'chr';
`,
  },
  {
    name: "monsters",
    sql: `
CREATE VIEW IF NOT EXISTS monsters AS
SELECT id, pvf_path,
  json_extract(parsed_json, '$.name.value') AS name,
  json_extract(parsed_json, '$.warlike.value') AS warlike,
  json_extract(parsed_json, '$.sight.value') AS sight,
  json_extract(parsed_json, '$.weight.value') AS weight,
  parsed_json AS data
FROM pvf_files WHERE extension = 'mob';
`,
  },
  {
    name: "skills",
    sql: `
CREATE VIEW IF NOT EXISTS skills AS
SELECT id, pvf_path,
  json_extract(parsed_json, '$.skillType') AS skill_type,
  json_extract(parsed_json, '$.weaponEffectType') AS weapon_effect_type,
  json_extract(parsed_json, '$.skillClass.value') AS skill_class,
  json_extract(parsed_json, '$.hasPvp') AS has_pvp,
  json_extract(parsed_json, '$.hasDungeon') AS has_dungeon,
  parsed_json AS data
FROM pvf_files WHERE extension = 'skl';
`,
  },
  {
    name: "attacks",
    sql: `
CREATE VIEW IF NOT EXISTS attacks AS
SELECT id, pvf_path,
  json_extract(parsed_json, '$.attackKind') AS attack_kind,
  json_extract(parsed_json, '$.element') AS element,
  json_extract(parsed_json, '$.hitReaction') AS hit_reaction,
  json_extract(parsed_json, '$.liftUp.value') AS lift_up,
  json_extract(parsed_json, '$.pushAside.value') AS push_aside,
  json_extract(parsed_json, '$.pvpOnly') AS pvp_only,
  parsed_json AS data
FROM pvf_files WHERE extension = 'atk';
`,
  },
  {
    name: "animations",
    sql: `
CREATE VIEW IF NOT EXISTS animations AS
SELECT id, pvf_path,
  json_extract(parsed_json, '$.framesCount') AS frames_count,
  json_extract(parsed_json, '$.loop') AS loop_flag,
  parsed_json AS data
FROM pvf_files WHERE extension = 'ani';
`,
  },
  {
    name: "dungeons",
    sql: `
CREATE VIEW IF NOT EXISTS dungeons AS
SELECT id, pvf_path,
  json_extract(parsed_json, '$.basisLevel.value') AS basis_level,
  json_extract(parsed_json, '$.minimumRequiredLevel.value') AS minimum_required_level,
  parsed_json AS data
FROM pvf_files WHERE extension = 'dgn';
`,
  },
  {
    name: "maps",
    sql: `
CREATE VIEW IF NOT EXISTS maps AS
SELECT id, pvf_path,
  json_extract(parsed_json, '$.mapType.value') AS map_type,
  json_extract(parsed_json, '$.dungeonId.value') AS dungeon_id,
  json_extract(parsed_json, '$.nearSightScroll.value') AS near_sight_scroll,
  parsed_json AS data
FROM pvf_files WHERE extension = 'map';
`,
  },
  {
    name: "etc_entries",
    sql: `
CREATE VIEW IF NOT EXISTS etc_entries AS
SELECT id, pvf_path,
  json_extract(parsed_json, '$.entries') AS entries,
  parsed_json AS data
FROM pvf_files WHERE extension = 'etc';
`,
  },
  {
    name: "nuts",
    sql: `
CREATE VIEW IF NOT EXISTS nuts AS
SELECT id, pvf_path,
  json_extract(parsed_json, '$.byteLength') AS byte_length,
  json_extract(parsed_json, '$.lineCount') AS line_count,
  parsed_json AS data
FROM pvf_files WHERE extension = 'nut';
`,
  },
  {
    name: "imgs",
    sql: `
CREATE VIEW IF NOT EXISTS imgs AS
SELECT id, pvf_path,
  json_extract(parsed_json, '$.format') AS format,
  json_extract(parsed_json, '$.sizeBytes') AS size_bytes,
  parsed_json AS data
FROM pvf_files WHERE extension = 'img';
`,
  },
];

// ─── Public API ─────────────────────────────────────────────────────────────

export function importToSqlite(
  options: SqliteImportOptions,
  documents: readonly PvfDocument[],
  parsed: readonly ParsedPvfDocument[],
  validation: VerificationReport,
): SqliteImportResult {
  const startedAtMs = Date.now();
  const db = new DatabaseSync(options.dbPath);

  try {
    ensureSchema(db);

    const mode = options.mode ?? "full";

    // ── extraction_runs row ─────────────────────────────────────────────
    db.prepare(
      `INSERT INTO extraction_runs (run_uid, started_at, finished_at, pvf_hash, mode,
                                    files_total, files_extracted, files_failed,
                                    errors, warnings, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      validation.meta.runId,
      validation.meta.startedAt,
      validation.meta.finishedAt,
      validation.meta.pvfHash,
      mode,
      validation.stats.filesTotal,
      validation.stats.filesParsed,
      validation.stats.filesFailed,
      validation.stats.errors,
      validation.stats.warnings,
      "completed",
    );
    const runRow = db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number };
    const runId = runRow.id;

    // ── pvf_files upsert ────────────────────────────────────────────────
    const parsedByPath = new Map<string, ParsedPvfDocument>();
    for (const def of parsed) parsedByPath.set(def.path, def);

    const checkExisting = db.prepare(
      "SELECT source_pvf_hash FROM pvf_files WHERE pvf_path = ?",
    );
    const upsertFile = db.prepare(
      `INSERT INTO pvf_files (pvf_path, extension, source_pvf_hash, raw_json, parsed_json,
                              extracted_at, extractor_version, parsed_at, parser_version, last_run_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(pvf_path) DO UPDATE SET
         extension = excluded.extension,
         source_pvf_hash = excluded.source_pvf_hash,
         raw_json = excluded.raw_json,
         parsed_json = excluded.parsed_json,
         extracted_at = excluded.extracted_at,
         extractor_version = excluded.extractor_version,
         parsed_at = excluded.parsed_at,
         parser_version = excluded.parser_version,
         last_run_id = excluded.last_run_id`,
    );

    let filesUpserted = 0;
    let filesSkipped = 0;

    // Transaction wrap for batch insert performance + atomicity.
    db.exec("BEGIN");
    try {
      for (const doc of documents) {
        const docHash = doc.source_pvf_hash ?? null;
        if (mode === "incremental" && docHash !== null) {
          const existing = checkExisting.get(doc.path) as { source_pvf_hash: string } | undefined;
          if (existing?.source_pvf_hash === docHash) {
            filesSkipped += 1;
            continue;
          }
        }

        const extension = extractExtension(doc.path);
        const parsedDef = parsedByPath.get(doc.path) ?? null;
        upsertFile.run(
          doc.path,
          extension,
          docHash,
          JSON.stringify(doc),
          parsedDef ? JSON.stringify(stripRawAndSections(parsedDef)) : null,
          doc.extract_timestamp,
          doc.extractor_version,
          parsedDef ? validation.meta.finishedAt : null,
          parsedDef ? "v1" : null,
          runId,
        );
        filesUpserted += 1;
      }

      // ── refs insert ───────────────────────────────────────────────────
      const insertRef = db.prepare(
        `INSERT INTO refs (run_id, from_path, from_field, to_path, ref_type, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      let refsInsertedLocal = 0;
      // Audit F1 (test-effectiveness, 2026-05-24): from_field column was
      // receiving `ref.targetKind` instead of the actual source field path
      // (`animationRefs[3]` / `attackInfo.attackBase[0]` / etc), making
      // both DB columns duplicates of `ref_type`. Now uses ref.fromField
      // which the validator's walker populates from its `prefix` accumulator.
      for (const ref of validation.refIntegrity) {
        insertRef.run(runId, ref.fromPath, ref.fromField, ref.toPath, ref.targetKind, ref.status);
        refsInsertedLocal += 1;
      }

      db.exec("COMMIT");

      return {
        dbPath: options.dbPath,
        runId,
        filesUpserted,
        filesSkipped,
        refsInserted: refsInsertedLocal,
        durationMs: Date.now() - startedAtMs,
      };
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  } finally {
    db.close();
  }
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function ensureSchema(db: DatabaseSync): void {
  db.exec(SCHEMA_PVF_FILES);
  db.exec(SCHEMA_EXTRACTION_RUNS);
  db.exec(SCHEMA_REFS);
  for (const idx of SCHEMA_INDEXES) db.exec(idx);
  for (const view of SCHEMA_VIEWS) db.exec(view.sql);
}

/**
 * Extract the file extension for routing purposes. Mirrors parseStage.ts
 * routingExtension() but returns the bare extension (no leading dot) — the
 * shape stored in pvf_files.extension column.
 */
function extractExtension(pvfPath: string): string {
  const lastDot = pvfPath.lastIndexOf(".");
  if (lastDot < 0 || lastDot === pvfPath.length - 1) return "";
  // Trim leading dot, lowercase.
  const ext = pvfPath.slice(lastDot + 1).toLowerCase();
  // Filter to known PARSER kinds; anything else gets "other" so views don't
  // accidentally include garbage rows.
  const known = new Set(["chr", "mob", "atk", "skl", "dgn", "etc", "map", "ani", "nut", "img"]);
  return known.has(ext) ? ext : "other";
}

function stripRawAndSections(parsedDoc: ParsedPvfDocument): unknown {
  const obj = parsedDoc as unknown as { raw?: unknown; sections?: unknown };
  const { raw: _raw, sections: _sections, ...rest } = obj as Record<string, unknown>;
  return rest;
}

// Suppress unused import warning when StatementSync is type-only.
type _SuppressStatementUnused = StatementSync;
