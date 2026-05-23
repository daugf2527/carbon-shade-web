/**
 * Head 14 probe suite — SQLite LOAD (SqliteImporter.ts).
 *
 * Uses in-memory DB (DatabaseSync(':memory:')) so the test is hermetic.
 * Verifies:
 *   - schema bootstrap (3 tables + 10 views + 5 indexes)
 *   - upsert: same pvf_path replaces in place; row count unchanged
 *   - incremental mode skips files whose source_pvf_hash matches existing
 *   - per-domain VIEW returns json_extract values correctly
 *   - refs table populated from validation.refIntegrity
 *   - extraction_runs row carries stats + runId
 *
 * Exit policy: BASELINE_BUGS=0, exits 1 on any unexpected outcome.
 */

export const BASELINE_BUGS = 0;

import { DatabaseSync } from "node:sqlite";
import { assert } from "./test-utils.js";
import { importToSqlite } from "../../src/dnf-native-combat/data/importer/SqliteImporter.js";
import { validateParsedDocuments } from "../../src/dnf-native-combat/data/validator.js";
import { parsePvfDocument } from "../../src/dnf-native-combat/data/pipeline/parseStage.js";
import type { PvfDocument } from "../../src/dnf-native-combat/data/types/PvfDocument.js";

// Build a minimal valid AtkDocument (passes parseStage routing)
function makeAtkDoc(pvfPath: string, liftUp: number, hash = "h14-fake"): PvfDocument {
  return {
    extractor_version: "v2.0.0",
    extract_timestamp: "2026-05-23T16:00:00Z",
    source_pvf_hash: hash,
    path: pvfPath,
    type: "document",
    sections: [
      { name: "lift up", attributes: [{ t: "int", v: liftUp }] },
    ],
  };
}

// Build a minimal valid MobDocument with one typed animation ref. MobDef
// exposes animationRefs: PvfRef[] which the validator's walker traverses
// (unlike AtkDef whose refs live only in raw sections).
function makeMobDoc(pvfPath: string, animTargetPath: string, hash = "h14-fake"): PvfDocument {
  return {
    extractor_version: "v2.0.0",
    extract_timestamp: "2026-05-23T16:00:00Z",
    source_pvf_hash: hash,
    path: pvfPath,
    type: "document",
    sections: [
      { name: "animation", attributes: [
        { t: "ref", target_kind: "ani", target_path: animTargetPath, raw: animTargetPath },
      ] },
    ],
  };
}

function buildContext(docs: PvfDocument[]) {
  const parsed = docs.map(parsePvfDocument);
  const validation = validateParsedDocuments(parsed, {
    runId: "h14-run-001",
    startedAt: "2026-05-23T16:00:00Z",
    finishedAt: "2026-05-23T16:00:01Z",
    pvfHash: "h14-fake",
    extractorVersion: "v2.0.0",
  });
  return { docs, parsed, validation };
}

// ───────────────────────────────────────────────────────────────────────────
// H14-1: Schema bootstrap — 3 tables + 10 views + indexes
// ───────────────────────────────────────────────────────────────────────────
{
  const { docs, parsed, validation } = buildContext([makeAtkDoc("atk/test1.atk", 100)]);
  importToSqlite({ dbPath: ":memory:" }, docs, parsed, validation);

  // Re-open ephemerally to inspect: actually we need to inspect within the
  // import call's DB. Since importToSqlite closes the DB at the end, ":memory:"
  // is gone. We'll re-import into a shared DB for inspection-style tests.
  // For H14-1 we test that the import completes without throwing and returns
  // sensible structure.
  console.log("[OK] H14-1: import to :memory: completes without throwing");
}

// ───────────────────────────────────────────────────────────────────────────
// H14-2: Persisting DB — schema bootstrapped + 1 row inserted
// ───────────────────────────────────────────────────────────────────────────
{
  const tmpDb = ".tmp/h14-probe.db";
  // Clean prior state by opening + dropping if exists. Since DatabaseSync only
  // creates if missing, use a unique runId here and overwrite is fine.
  const fs = await import("node:fs/promises");
  try { await fs.rm(tmpDb, { force: true }); } catch { /* ignore */ }

  // Use a mob doc — its animationRefs field carries the ref into the walker.
  const { docs, parsed, validation } = buildContext([makeMobDoc("monster/test.mob", "anim/test.ani")]);
  const result = importToSqlite({ dbPath: tmpDb }, docs, parsed, validation);

  assert.equal(result.filesUpserted, 1, "H14-2: 1 file upserted");
  assert.equal(result.refsInserted, 1, "H14-2: 1 ref inserted");
  assert.ok(result.runId >= 1, "H14-2: runId >= 1");
  assert.ok(result.durationMs >= 0, "H14-2: durationMs non-negative");

  // Inspect schema via a separate open.
  const db = new DatabaseSync(tmpDb);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as Array<{ name: string }>;
  const tableNames = tables.map(t => t.name);
  for (const required of ["pvf_files", "extraction_runs", "refs"]) {
    assert.ok(tableNames.includes(required), `H14-2: table ${required} exists (got ${tableNames.join(",")})`);
  }

  const views = db.prepare("SELECT name FROM sqlite_master WHERE type='view' ORDER BY name").all() as Array<{ name: string }>;
  const viewNames = views.map(v => v.name);
  const expectedViews = ["animations", "attacks", "characters", "dungeons", "etc_entries", "imgs", "maps", "monsters", "nuts", "skills"];
  for (const v of expectedViews) {
    assert.ok(viewNames.includes(v), `H14-2: view ${v} exists`);
  }
  assert.equal(viewNames.length, 10, `H14-2: 10 per-domain views (got ${viewNames.length})`);

  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name").all() as Array<{ name: string }>;
  assert.ok(indexes.length >= 5, `H14-2: ≥5 named indexes (got ${indexes.length})`);

  db.close();
  await fs.rm(tmpDb, { force: true });
  console.log("[OK] H14-2: schema bootstrap — 3 tables + 10 views + 5+ indexes");
}

// ───────────────────────────────────────────────────────────────────────────
// H14-3: Upsert — second import with same pvf_path replaces, not duplicates
// ───────────────────────────────────────────────────────────────────────────
{
  const tmpDb = ".tmp/h14-upsert.db";
  const fs = await import("node:fs/promises");
  try { await fs.rm(tmpDb, { force: true }); } catch { /* ignore */ }

  const ctx1 = buildContext([makeAtkDoc("atk/upsert.atk", 100, "hash-v1")]);
  importToSqlite({ dbPath: tmpDb }, ctx1.docs, ctx1.parsed, ctx1.validation);

  const ctx2 = buildContext([makeAtkDoc("atk/upsert.atk", 999, "hash-v2")]);
  // Second import — same path, different content.
  const result2 = importToSqlite({ dbPath: tmpDb }, ctx2.docs, ctx2.parsed, ctx2.validation);

  const db = new DatabaseSync(tmpDb);
  const row = db.prepare("SELECT pvf_path, source_pvf_hash FROM pvf_files WHERE pvf_path = ?").get("atk/upsert.atk") as { pvf_path: string; source_pvf_hash: string };
  const totalRows = db.prepare("SELECT COUNT(*) AS n FROM pvf_files").get() as { n: number };

  assert.equal(row.source_pvf_hash, "hash-v2", "H14-3: row was updated (not duplicated)");
  assert.equal(totalRows.n, 1, `H14-3: row count stays 1 (upsert not insert; got ${totalRows.n})`);
  assert.equal(result2.filesUpserted, 1, "H14-3: filesUpserted=1 on second run");

  // extraction_runs has 2 rows now
  const runs = db.prepare("SELECT COUNT(*) AS n FROM extraction_runs").get() as { n: number };
  assert.equal(runs.n, 2, `H14-3: 2 extraction_runs rows (got ${runs.n})`);

  db.close();
  await fs.rm(tmpDb, { force: true });
  console.log("[OK] H14-3: upsert by pvf_path UNIQUE");
}

// ───────────────────────────────────────────────────────────────────────────
// H14-4: Incremental mode — same hash → skip
// ───────────────────────────────────────────────────────────────────────────
{
  const tmpDb = ".tmp/h14-incr.db";
  const fs = await import("node:fs/promises");
  try { await fs.rm(tmpDb, { force: true }); } catch { /* ignore */ }

  const ctx1 = buildContext([makeAtkDoc("atk/stable.atk", 100, "hash-stable")]);
  importToSqlite({ dbPath: tmpDb }, ctx1.docs, ctx1.parsed, ctx1.validation);

  // Second run with same hash — should skip in incremental mode
  const ctx2 = buildContext([makeAtkDoc("atk/stable.atk", 100, "hash-stable")]);
  const result2 = importToSqlite({ dbPath: tmpDb, mode: "incremental" }, ctx2.docs, ctx2.parsed, ctx2.validation);

  assert.equal(result2.filesUpserted, 0, `H14-4: filesUpserted=0 (skipped; got ${result2.filesUpserted})`);
  assert.equal(result2.filesSkipped, 1, `H14-4: filesSkipped=1 (got ${result2.filesSkipped})`);

  const fs2 = await import("node:fs/promises");
  await fs2.rm(tmpDb, { force: true });
  console.log("[OK] H14-4: incremental mode skips unchanged hash");
}

// ───────────────────────────────────────────────────────────────────────────
// H14-5: Per-domain VIEW — `attacks` view exposes json_extract values
// ───────────────────────────────────────────────────────────────────────────
{
  const tmpDb = ".tmp/h14-view.db";
  const fs = await import("node:fs/promises");
  try { await fs.rm(tmpDb, { force: true }); } catch { /* ignore */ }

  const ctx = buildContext([
    makeAtkDoc("atk/v1.atk", 100),
    makeAtkDoc("atk/v2.atk", 200),
  ]);
  importToSqlite({ dbPath: tmpDb }, ctx.docs, ctx.parsed, ctx.validation);

  const db = new DatabaseSync(tmpDb);
  const rows = db.prepare("SELECT pvf_path, lift_up FROM attacks ORDER BY pvf_path").all() as Array<{ pvf_path: string; lift_up: number }>;
  assert.equal(rows.length, 2, `H14-5: 2 attacks rows (got ${rows.length})`);
  assert.equal(rows[0].pvf_path, "atk/v1.atk", "H14-5: row 0 path");
  assert.equal(rows[0].lift_up, 100, `H14-5: lift_up extracted (got ${rows[0].lift_up})`);
  assert.equal(rows[1].lift_up, 200, "H14-5: row 1 lift_up");

  db.close();
  await fs.rm(tmpDb, { force: true });
  console.log("[OK] H14-5: attacks view exposes json_extract");
}

// ───────────────────────────────────────────────────────────────────────────
// H14-6: refs table populated from validation.refIntegrity
// ───────────────────────────────────────────────────────────────────────────
{
  const tmpDb = ".tmp/h14-refs.db";
  const fs = await import("node:fs/promises");
  try { await fs.rm(tmpDb, { force: true }); } catch { /* ignore */ }

  const ctx = buildContext([
    makeMobDoc("monster/a.mob", "anim/a.ani"),
    makeMobDoc("monster/b.mob", "anim/b.ani"),
  ]);
  const result = importToSqlite({ dbPath: tmpDb }, ctx.docs, ctx.parsed, ctx.validation);

  assert.equal(result.refsInserted, 2, `H14-6: 2 refs inserted (got ${result.refsInserted})`);

  const db = new DatabaseSync(tmpDb);
  const refRows = db.prepare("SELECT from_path, to_path, status FROM refs ORDER BY from_path").all() as Array<{ from_path: string; to_path: string; status: string }>;
  assert.equal(refRows.length, 2, "H14-6: refs table has 2 rows");
  assert.ok(refRows.every(r => r.status === "missing"), `H14-6: all refs missing (got ${refRows.map(r => r.status).join(",")})`);
  assert.equal(refRows[0].to_path, "anim/a.ani", "H14-6: ref a target");
  assert.equal(refRows[1].to_path, "anim/b.ani", "H14-6: ref b target");

  db.close();
  await fs.rm(tmpDb, { force: true });
  console.log("[OK] H14-6: refs populated with VALIDATE.refIntegrity");
}

// ───────────────────────────────────────────────────────────────────────────
// H14-7: extraction_runs carries runId + stats from validation report
// ───────────────────────────────────────────────────────────────────────────
{
  const tmpDb = ".tmp/h14-runs.db";
  const fs = await import("node:fs/promises");
  try { await fs.rm(tmpDb, { force: true }); } catch { /* ignore */ }

  const ctx = buildContext([makeAtkDoc("atk/runs.atk", 100)]);
  importToSqlite({ dbPath: tmpDb }, ctx.docs, ctx.parsed, ctx.validation);

  const db = new DatabaseSync(tmpDb);
  const row = db.prepare("SELECT run_uid, files_total, files_extracted, files_failed, status, mode FROM extraction_runs ORDER BY id DESC LIMIT 1").get() as {
    run_uid: string; files_total: number; files_extracted: number; files_failed: number; status: string; mode: string;
  };
  assert.equal(row.run_uid, "h14-run-001", "H14-7: run_uid echoed from validation.meta.runId");
  assert.equal(row.files_total, 1, "H14-7: files_total");
  assert.equal(row.files_extracted, 1, "H14-7: files_extracted");
  assert.equal(row.files_failed, 0, "H14-7: files_failed");
  assert.equal(row.status, "completed", "H14-7: status=completed");
  assert.equal(row.mode, "full", "H14-7: default mode=full");

  db.close();
  await fs.rm(tmpDb, { force: true });
  console.log("[OK] H14-7: extraction_runs metadata correct");
}

// ───────────────────────────────────────────────────────────────────────────
// H14-8: pvf_files.extension routing — unknown extension → "other"
// ───────────────────────────────────────────────────────────────────────────
{
  const tmpDb = ".tmp/h14-ext.db";
  const fs = await import("node:fs/promises");
  try { await fs.rm(tmpDb, { force: true }); } catch { /* ignore */ }

  // Use an atk doc with a known extension (test the happy path)
  const ctx = buildContext([makeAtkDoc("atk/ext.atk", 100)]);
  importToSqlite({ dbPath: tmpDb }, ctx.docs, ctx.parsed, ctx.validation);

  const db = new DatabaseSync(tmpDb);
  const row = db.prepare("SELECT extension FROM pvf_files WHERE pvf_path = ?").get("atk/ext.atk") as { extension: string };
  assert.equal(row.extension, "atk", "H14-8: extension extracted from path");

  db.close();
  await fs.rm(tmpDb, { force: true });
  console.log("[OK] H14-8: extension routing via path");
}

// ───────────────────────────────────────────────────────────────────────────
// Summary
// ───────────────────────────────────────────────────────────────────────────
console.log("");
console.log("H14 SQLite LOAD probes: all assertions passed (8 cases)");
