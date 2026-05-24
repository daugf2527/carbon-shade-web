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
function makeMobDoc(
  pvfPath: string,
  animTargetPath: string,
  opts: { warlike?: number; sight?: number; weight?: number; hash?: string } = {},
): PvfDocument {
  const sections: PvfDocument["sections"] = [
    { name: "animation", attributes: [
      { t: "ref", target_kind: "ani", target_path: animTargetPath, raw: animTargetPath },
    ] },
  ];
  if (opts.warlike !== undefined) sections.push({ name: "warlike", attributes: [{ t: "int", v: opts.warlike }] });
  if (opts.sight   !== undefined) sections.push({ name: "sight",   attributes: [{ t: "int", v: opts.sight   }] });
  if (opts.weight  !== undefined) sections.push({ name: "weight",  attributes: [{ t: "int", v: opts.weight  }] });
  return {
    extractor_version: "v2.0.0",
    extract_timestamp: "2026-05-23T16:00:00Z",
    source_pvf_hash: opts.hash ?? "h14-fake",
    path: pvfPath,
    type: "document",
    sections,
  };
}

// Build a minimal valid ChrDocument. ChrParser requires `job`, `hp max`,
// `physical attack`, `jump power`, `jump speed`, `weight` to be present and
// well-typed. All other sections are optional.
function makeChrDoc(
  pvfPath: string,
  opts: { job?: string; jumpPower?: number; jumpSpeed?: number; weight?: number; hash?: string } = {},
): PvfDocument {
  const job = opts.job ?? "swordman";
  const jumpPower = opts.jumpPower ?? 430;
  const jumpSpeed = opts.jumpSpeed ?? 12;
  const weight = opts.weight ?? 68000;
  return {
    extractor_version: "v2.0.0",
    extract_timestamp: "2026-05-23T16:00:00Z",
    source_pvf_hash: opts.hash ?? "h14-fake",
    path: pvfPath,
    type: "document",
    sections: [
      { name: "job", attributes: [{ t: "str", v: job }] },
      { name: "jump power", attributes: [{ t: "int", v: jumpPower }] },
      { name: "jump speed", attributes: [{ t: "int", v: jumpSpeed }] },
      { name: "weight", attributes: [{ t: "int", v: weight }] },
      { name: "hp max", attributes: [{ t: "vec", length: 1, items: [100] }] },
      { name: "physical attack", attributes: [{ t: "vec", length: 1, items: [10] }] },
    ],
  };
}

// Build a minimal valid SkillDocument. SklParser doesn't `requireValue`
// anything, so an empty .skl is technically valid; we add optional sections
// to drive the views. `type` is read for skillType. `pvp`/`dungeon` sections
// (empty presence) flip the `hasPvp` / `hasDungeon` flags.
function makeSklDoc(
  pvfPath: string,
  opts: { type?: "active" | "passive"; hasPvp?: boolean; hasDungeon?: boolean; hash?: string } = {},
): PvfDocument {
  const sections: PvfDocument["sections"] = [];
  if (opts.type !== undefined) {
    sections.push({ name: "type", attributes: [{ t: "str", v: opts.type }] });
  }
  if (opts.hasPvp) sections.push({ name: "pvp", attributes: [] });
  if (opts.hasDungeon) sections.push({ name: "dungeon", attributes: [] });
  return {
    extractor_version: "v2.0.0",
    extract_timestamp: "2026-05-23T16:00:00Z",
    source_pvf_hash: opts.hash ?? "h14-fake",
    path: pvfPath,
    type: "document",
    sections,
  };
}

// Build a minimal valid DungeonDocument.
function makeDgnDoc(pvfPath: string, hash = "h14-fake"): PvfDocument {
  return {
    extractor_version: "v2.0.0",
    extract_timestamp: "2026-05-23T16:00:00Z",
    source_pvf_hash: hash,
    path: pvfPath,
    type: "document",
    sections: [
      { name: "basis level", attributes: [{ t: "int", v: 70 }] },
      { name: "minimum required level", attributes: [{ t: "int", v: 60 }] },
    ],
  };
}

// Build a minimal valid EtcDocument — one "key value index" section with
// a str key plus two int pairs.
function makeEtcDoc(pvfPath: string, hash = "h14-fake"): PvfDocument {
  return {
    extractor_version: "v2.0.0",
    extract_timestamp: "2026-05-23T16:00:00Z",
    source_pvf_hash: hash,
    path: pvfPath,
    type: "document",
    sections: [
      { name: "key value index", attributes: [
        { t: "str", v: "test_key" },
        { t: "int", v: 100 }, { t: "int", v: 0 },
        { t: "int", v: 200 }, { t: "int", v: 1 },
      ] },
    ],
  };
}

// Build a minimal valid MapDocument.
function makeMapDoc(pvfPath: string, hash = "h14-fake"): PvfDocument {
  return {
    extractor_version: "v2.0.0",
    extract_timestamp: "2026-05-23T16:00:00Z",
    source_pvf_hash: hash,
    path: pvfPath,
    type: "document",
    sections: [
      { name: "type", attributes: [{ t: "str", v: "dungeon" }] },
      { name: "dungeon", attributes: [{ t: "int", v: 42 }] },
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
// H14-9: Multi-extension routing — chr/mob/skl/atk/dgn/etc/map all land in
//         the correct per-domain view (extension column is the discriminator).
//
// Note: ani/nut/img are standalone parsers that bypass parseStage today
// (see parseStage.ts comment) — they cannot reach pvf_files via importToSqlite
// through the documents+parsed flow without manual fake parsed entries, so we
// only cover the 7 reachable types here.
// ───────────────────────────────────────────────────────────────────────────
{
  const tmpDb = ".tmp/h14-routing.db";
  const fs = await import("node:fs/promises");
  try { await fs.rm(tmpDb, { force: true }); } catch { /* ignore */ }

  const docs: PvfDocument[] = [
    makeChrDoc("character/swordman/swordman.chr"),
    makeMobDoc("monster/goblin.mob", "anim/goblin.ani"),
    makeSklDoc("skill/swordman/triplerush.skl"),
    makeAtkDoc("atk/route.atk", 100),
    makeDgnDoc("dungeon/test.dgn"),
    makeEtcDoc("etc/swordman.etc"),
    makeMapDoc("map/lostway.map"),
  ];
  const ctx = buildContext(docs);
  const result = importToSqlite({ dbPath: tmpDb }, ctx.docs, ctx.parsed, ctx.validation);
  assert.equal(result.filesUpserted, 7, `H14-9: 7 files upserted (got ${result.filesUpserted})`);

  const db = new DatabaseSync(tmpDb);
  // Extension column populated correctly for each row.
  const extRows = db.prepare("SELECT extension, COUNT(*) AS n FROM pvf_files GROUP BY extension ORDER BY extension").all() as Array<{ extension: string; n: number }>;
  const extMap = Object.fromEntries(extRows.map(r => [r.extension, r.n]));
  for (const ext of ["chr", "mob", "skl", "atk", "dgn", "etc", "map"]) {
    assert.equal(extMap[ext], 1, `H14-9: pvf_files.extension="${ext}" has 1 row (got ${extMap[ext] ?? 0})`);
  }

  // Each per-domain view returns exactly its own rows.
  const viewExt: Array<[string, string]> = [
    ["characters", "chr"], ["monsters", "mob"], ["skills", "skl"],
    ["attacks", "atk"], ["dungeons", "dgn"], ["etc_entries", "etc"], ["maps", "map"],
  ];
  for (const [view, ext] of viewExt) {
    const rows = db.prepare(`SELECT COUNT(*) AS n FROM ${view}`).get() as { n: number };
    assert.equal(rows.n, 1, `H14-9: view "${view}" sees 1 row (the ${ext} doc) — got ${rows.n}`);
  }

  db.close();
  await fs.rm(tmpDb, { force: true });
  console.log("[OK] H14-9: 7-way extension routing (chr/mob/skl/atk/dgn/etc/map)");
}

// ───────────────────────────────────────────────────────────────────────────
// H14-10: characters view json_extract — job / jump_power / weight
// ───────────────────────────────────────────────────────────────────────────
{
  const tmpDb = ".tmp/h14-chr-view.db";
  const fs = await import("node:fs/promises");
  try { await fs.rm(tmpDb, { force: true }); } catch { /* ignore */ }

  const ctx = buildContext([makeChrDoc("character/swordman/swordman.chr", { job: "swordman", jumpPower: 430, weight: 68000 })]);
  importToSqlite({ dbPath: tmpDb }, ctx.docs, ctx.parsed, ctx.validation);

  const db = new DatabaseSync(tmpDb);
  const row = db.prepare("SELECT job, jump_power, weight FROM characters WHERE pvf_path = ?").get("character/swordman/swordman.chr") as { job: string; jump_power: number; weight: number };
  assert.equal(row.job, "swordman", `H14-10: characters.job extracted (got "${row.job}")`);
  assert.equal(row.jump_power, 430, `H14-10: characters.jump_power extracted (got ${row.jump_power})`);
  assert.equal(row.weight, 68000, `H14-10: characters.weight extracted (got ${row.weight})`);

  db.close();
  await fs.rm(tmpDb, { force: true });
  console.log("[OK] H14-10: characters view exposes job/jump_power/weight");
}

// ───────────────────────────────────────────────────────────────────────────
// H14-11: monsters view json_extract — sight / warlike / weight
// ───────────────────────────────────────────────────────────────────────────
{
  const tmpDb = ".tmp/h14-mob-view.db";
  const fs = await import("node:fs/promises");
  try { await fs.rm(tmpDb, { force: true }); } catch { /* ignore */ }

  const ctx = buildContext([makeMobDoc("monster/aggro.mob", "anim/aggro.ani", { warlike: 80, sight: 350, weight: 25 })]);
  importToSqlite({ dbPath: tmpDb }, ctx.docs, ctx.parsed, ctx.validation);

  const db = new DatabaseSync(tmpDb);
  const row = db.prepare("SELECT warlike, sight, weight FROM monsters WHERE pvf_path = ?").get("monster/aggro.mob") as { warlike: number; sight: number; weight: number };
  assert.equal(row.warlike, 80, `H14-11: monsters.warlike (got ${row.warlike})`);
  assert.equal(row.sight, 350, `H14-11: monsters.sight (got ${row.sight})`);
  assert.equal(row.weight, 25, `H14-11: monsters.weight (got ${row.weight})`);

  db.close();
  await fs.rm(tmpDb, { force: true });
  console.log("[OK] H14-11: monsters view exposes sight/warlike/weight");
}

// ───────────────────────────────────────────────────────────────────────────
// H14-12: skills view json_extract — skill_type / has_pvp / has_dungeon
// ───────────────────────────────────────────────────────────────────────────
{
  const tmpDb = ".tmp/h14-skl-view.db";
  const fs = await import("node:fs/promises");
  try { await fs.rm(tmpDb, { force: true }); } catch { /* ignore */ }

  const ctx = buildContext([
    makeSklDoc("skill/active-pve.skl", { type: "active", hasPvp: false, hasDungeon: true }),
    makeSklDoc("skill/passive-pvp.skl", { type: "passive", hasPvp: true, hasDungeon: false }),
  ]);
  importToSqlite({ dbPath: tmpDb }, ctx.docs, ctx.parsed, ctx.validation);

  const db = new DatabaseSync(tmpDb);
  const active = db.prepare("SELECT skill_type, has_pvp, has_dungeon FROM skills WHERE pvf_path = ?").get("skill/active-pve.skl") as { skill_type: string; has_pvp: number; has_dungeon: number };
  const passive = db.prepare("SELECT skill_type, has_pvp, has_dungeon FROM skills WHERE pvf_path = ?").get("skill/passive-pvp.skl") as { skill_type: string; has_pvp: number; has_dungeon: number };

  assert.equal(active.skill_type, "active", `H14-12: active.skill_type (got "${active.skill_type}")`);
  // SQLite json_extract turns JSON booleans into 0/1 integers.
  assert.equal(active.has_pvp, 0, `H14-12: active.has_pvp=0 (got ${active.has_pvp})`);
  assert.equal(active.has_dungeon, 1, `H14-12: active.has_dungeon=1 (got ${active.has_dungeon})`);
  assert.equal(passive.skill_type, "passive", `H14-12: passive.skill_type (got "${passive.skill_type}")`);
  assert.equal(passive.has_pvp, 1, `H14-12: passive.has_pvp=1 (got ${passive.has_pvp})`);
  assert.equal(passive.has_dungeon, 0, `H14-12: passive.has_dungeon=0 (got ${passive.has_dungeon})`);

  db.close();
  await fs.rm(tmpDb, { force: true });
  console.log("[OK] H14-12: skills view exposes skill_type/has_pvp/has_dungeon");
}

// ───────────────────────────────────────────────────────────────────────────
// H14-13: refs table — from_path / from_field / to_path / ref_type / status
//         All five columns are stamped from validation.refIntegrity.
//         Audit F1 test-effectiveness (2026-05-24): SqliteImporter previously
//         wrote ref.targetKind into BOTH from_field AND ref_type columns,
//         duplicating the same value. The validator's walker computes a
//         prefix (the source field path) but RefEntry discarded it before
//         the importer. Now RefEntry.fromField is preserved end-to-end, so
//         from_field and ref_type hold distinct values.
// ───────────────────────────────────────────────────────────────────────────
{
  const tmpDb = ".tmp/h14-refs-cols.db";
  const fs = await import("node:fs/promises");
  try { await fs.rm(tmpDb, { force: true }); } catch { /* ignore */ }

  const ctx = buildContext([makeMobDoc("monster/r.mob", "anim/r.ani")]);
  importToSqlite({ dbPath: tmpDb }, ctx.docs, ctx.parsed, ctx.validation);

  const db = new DatabaseSync(tmpDb);
  const row = db.prepare("SELECT from_path, from_field, to_path, ref_type, status FROM refs WHERE from_path = ?").get("monster/r.mob") as { from_path: string; from_field: string; to_path: string; ref_type: string; status: string };
  assert.equal(row.from_path, "monster/r.mob", "H14-13: from_path");
  assert.equal(row.to_path, "anim/r.ani", "H14-13: to_path");
  assert.equal(row.status, "missing", `H14-13: status=missing (got "${row.status}")`);
  // ref_type carries the PvfRef targetKind ("ani") — the kind of doc this points to.
  assert.equal(row.ref_type, "ani", `H14-13: ref_type="ani" (got "${row.ref_type}")`);
  // from_field carries the source ParsedDef field path. MobDef.animationRefs is
  // a top-level PvfRef[]; the walker's prefix accumulates to "animationRefs[0]".
  assert.equal(
    row.from_field,
    "animationRefs[0]",
    `H14-13: from_field is the source field path (got "${row.from_field}")`,
  );
  // Defensive: neither column is NULL/empty, and they hold DISTINCT values now.
  assert.ok(row.from_field && row.from_field.length > 0, "H14-13: from_field non-empty");
  assert.ok(row.ref_type && row.ref_type.length > 0, "H14-13: ref_type non-empty");
  assert.notEqual(
    row.from_field,
    row.ref_type,
    "H14-13: from_field and ref_type now hold distinct values (audit F1 fix)",
  );

  db.close();
  await fs.rm(tmpDb, { force: true });
  console.log("[OK] H14-13: refs row carries all 5 typed columns (from_field=path, ref_type=targetKind)");
}

// ───────────────────────────────────────────────────────────────────────────
// H14-14: Full mode (default) does NOT skip same-hash repeats.
//         Contrast with H14-4 (incremental skips).
// ───────────────────────────────────────────────────────────────────────────
{
  const tmpDb = ".tmp/h14-fullmode.db";
  const fs = await import("node:fs/promises");
  try { await fs.rm(tmpDb, { force: true }); } catch { /* ignore */ }

  const ctx1 = buildContext([makeAtkDoc("atk/fm.atk", 100, "hash-x")]);
  importToSqlite({ dbPath: tmpDb }, ctx1.docs, ctx1.parsed, ctx1.validation);

  // Same path + same hash, full mode → must upsert (not skip).
  const ctx2 = buildContext([makeAtkDoc("atk/fm.atk", 100, "hash-x")]);
  const result = importToSqlite({ dbPath: tmpDb, mode: "full" }, ctx2.docs, ctx2.parsed, ctx2.validation);
  assert.equal(result.filesUpserted, 1, `H14-14: full mode upserts same-hash row (got upserted=${result.filesUpserted})`);
  assert.equal(result.filesSkipped, 0, `H14-14: full mode skipped=0 (got ${result.filesSkipped})`);

  // Default mode (no explicit `mode`) should match full's behaviour.
  const ctx3 = buildContext([makeAtkDoc("atk/fm.atk", 100, "hash-x")]);
  const result3 = importToSqlite({ dbPath: tmpDb }, ctx3.docs, ctx3.parsed, ctx3.validation);
  assert.equal(result3.filesUpserted, 1, `H14-14: default mode behaves like full (upserted=${result3.filesUpserted})`);
  assert.equal(result3.filesSkipped, 0, `H14-14: default mode skipped=0 (got ${result3.filesSkipped})`);

  await fs.rm(tmpDb, { force: true });
  console.log("[OK] H14-14: full / default mode does NOT skip same-hash");
}

// ───────────────────────────────────────────────────────────────────────────
// H14-15: extraction_runs accumulates one row per import call; run_uid
//         distinct values are preserved (carried from validation.meta.runId).
// ───────────────────────────────────────────────────────────────────────────
{
  const tmpDb = ".tmp/h14-runs-accum.db";
  const fs = await import("node:fs/promises");
  try { await fs.rm(tmpDb, { force: true }); } catch { /* ignore */ }

  for (let i = 1; i <= 3; i++) {
    const parsed = [parsePvfDocument(makeAtkDoc(`atk/run${i}.atk`, i * 10))];
    const validation = validateParsedDocuments(parsed, {
      runId: `h14-accum-${i}`,
      startedAt: `2026-05-24T0${i}:00:00Z`,
      finishedAt: `2026-05-24T0${i}:00:01Z`,
      pvfHash: "h14-accum",
      extractorVersion: "v2.0.0",
    });
    importToSqlite({ dbPath: tmpDb }, [makeAtkDoc(`atk/run${i}.atk`, i * 10)], parsed, validation);
  }

  const db = new DatabaseSync(tmpDb);
  const count = db.prepare("SELECT COUNT(*) AS n FROM extraction_runs").get() as { n: number };
  assert.equal(count.n, 3, `H14-15: 3 extraction_runs rows (got ${count.n})`);

  const uids = db.prepare("SELECT run_uid FROM extraction_runs ORDER BY id").all() as Array<{ run_uid: string }>;
  const uidSet = new Set(uids.map(r => r.run_uid));
  assert.equal(uidSet.size, 3, `H14-15: 3 distinct run_uid values (got ${uidSet.size}: ${[...uidSet].join(",")})`);
  assert.ok(uidSet.has("h14-accum-1") && uidSet.has("h14-accum-2") && uidSet.has("h14-accum-3"),
            `H14-15: all expected run_uids present (got ${[...uidSet].join(",")})`);

  db.close();
  await fs.rm(tmpDb, { force: true });
  console.log("[OK] H14-15: extraction_runs accumulates, run_uid distinct");
}

// ───────────────────────────────────────────────────────────────────────────
// H14-16: filesFailed propagates from validation.stats → extraction_runs row.
//         Inject parse errors via validateParsedDocuments({parseErrors:[…]}).
// ───────────────────────────────────────────────────────────────────────────
{
  const tmpDb = ".tmp/h14-failed.db";
  const fs = await import("node:fs/promises");
  try { await fs.rm(tmpDb, { force: true }); } catch { /* ignore */ }

  const goodDoc = makeAtkDoc("atk/good.atk", 100);
  const parsed = [parsePvfDocument(goodDoc)];
  const validation = validateParsedDocuments(parsed, {
    runId: "h14-failed-001",
    startedAt: "2026-05-24T05:00:00Z",
    finishedAt: "2026-05-24T05:00:01Z",
    pvfHash: "h14-failed",
    extractorVersion: "v2.0.0",
    parseErrors: [
      { path: "atk/broken1.atk", message: "synthetic-parse-failure-1" },
      { path: "atk/broken2.atk", message: "synthetic-parse-failure-2" },
    ],
  });
  // Sanity check the validator picked up the errors before LOAD.
  assert.equal(validation.stats.filesFailed, 2, `H14-16 (precondition): validator filesFailed=2 (got ${validation.stats.filesFailed})`);

  importToSqlite({ dbPath: tmpDb }, [goodDoc], parsed, validation);

  const db = new DatabaseSync(tmpDb);
  const row = db.prepare("SELECT files_total, files_extracted, files_failed FROM extraction_runs WHERE run_uid = ?").get("h14-failed-001") as { files_total: number; files_extracted: number; files_failed: number };
  assert.equal(row.files_total, 3, `H14-16: files_total=parsed+failed=3 (got ${row.files_total})`);
  assert.equal(row.files_extracted, 1, `H14-16: files_extracted=1 (got ${row.files_extracted})`);
  assert.equal(row.files_failed, 2, `H14-16: files_failed=2 (got ${row.files_failed})`);

  db.close();
  await fs.rm(tmpDb, { force: true });
  console.log("[OK] H14-16: validation.stats.filesFailed propagates to extraction_runs");
}

// ───────────────────────────────────────────────────────────────────────────
// H14-17: Schema is idempotent — importing twice into the same DB does NOT
//         throw on duplicate CREATE TABLE / CREATE VIEW. View count stays 10.
// ───────────────────────────────────────────────────────────────────────────
{
  const tmpDb = ".tmp/h14-idem.db";
  const fs = await import("node:fs/promises");
  try { await fs.rm(tmpDb, { force: true }); } catch { /* ignore */ }

  const ctx1 = buildContext([makeAtkDoc("atk/i1.atk", 100)]);
  importToSqlite({ dbPath: tmpDb }, ctx1.docs, ctx1.parsed, ctx1.validation);

  // Second import on the same DB should re-run all CREATE IF NOT EXISTS without throwing.
  const ctx2 = buildContext([makeAtkDoc("atk/i2.atk", 200)]);
  importToSqlite({ dbPath: tmpDb }, ctx2.docs, ctx2.parsed, ctx2.validation);

  const db = new DatabaseSync(tmpDb);
  const tableCount = db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('pvf_files','extraction_runs','refs')").get() as { n: number };
  assert.equal(tableCount.n, 3, `H14-17: still 3 core tables (got ${tableCount.n})`);
  const viewCount = db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='view'").get() as { n: number };
  assert.equal(viewCount.n, 10, `H14-17: still 10 views (got ${viewCount.n})`);
  // Both rows present.
  const totalFiles = db.prepare("SELECT COUNT(*) AS n FROM pvf_files").get() as { n: number };
  assert.equal(totalFiles.n, 2, `H14-17: 2 distinct pvf_files rows (got ${totalFiles.n})`);

  db.close();
  await fs.rm(tmpDb, { force: true });
  console.log("[OK] H14-17: schema bootstrap is idempotent on re-import");
}

// ───────────────────────────────────────────────────────────────────────────
// H14-18: pvf_files.parsed_json has `raw` and `sections` stripped.
//         (Both fields exist on ParsedPvfDocument but are removed in
//         stripRawAndSections() to keep parsed_json small.)
// ───────────────────────────────────────────────────────────────────────────
{
  const tmpDb = ".tmp/h14-strip.db";
  const fs = await import("node:fs/promises");
  try { await fs.rm(tmpDb, { force: true }); } catch { /* ignore */ }

  const ctx = buildContext([makeAtkDoc("atk/strip.atk", 100)]);
  importToSqlite({ dbPath: tmpDb }, ctx.docs, ctx.parsed, ctx.validation);

  const db = new DatabaseSync(tmpDb);
  const row = db.prepare("SELECT json_extract(parsed_json, '$.raw') AS raw_field, json_extract(parsed_json, '$.sections') AS sections_field, json_extract(parsed_json, '$.kind') AS kind FROM pvf_files WHERE pvf_path = ?").get("atk/strip.atk") as { raw_field: unknown; sections_field: unknown; kind: string };
  assert.equal(row.raw_field, null, `H14-18: parsed_json.raw was stripped (got ${JSON.stringify(row.raw_field)})`);
  assert.equal(row.sections_field, null, `H14-18: parsed_json.sections was stripped (got ${JSON.stringify(row.sections_field)})`);
  // Sanity — non-stripped fields still present.
  assert.equal(row.kind, "atk", `H14-18: parsed_json.kind survives (got "${row.kind}")`);

  // raw_json (original PvfDocument) is untouched — should still carry sections.
  const rawRow = db.prepare("SELECT json_extract(raw_json, '$.sections') AS sections FROM pvf_files WHERE pvf_path = ?").get("atk/strip.atk") as { sections: string };
  assert.ok(rawRow.sections !== null && rawRow.sections !== undefined,
            `H14-18: raw_json.sections preserved (got ${JSON.stringify(rawRow.sections)})`);

  db.close();
  await fs.rm(tmpDb, { force: true });
  console.log("[OK] H14-18: parsed_json stripped of raw+sections, raw_json intact");
}

// ───────────────────────────────────────────────────────────────────────────
// Summary
// ───────────────────────────────────────────────────────────────────────────
console.log("");
console.log("H14 SQLite LOAD probes: all assertions passed (18 cases)");
