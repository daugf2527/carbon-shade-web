/**
 * Stage 1 LOAD CLI — import VALIDATE-stage output into SQLite Mirror DB.
 *
 * Usage:
 *   node scripts/import-to-sqlite.mjs --pvf <Script.pvf> --file <p1> [--file <p2> ...] [--db <path>] [--mode full|incremental]
 *
 * Internally:
 *   1. Runs EXTRACT → PARSE → VALIDATE via pipelineRunner.
 *   2. Calls SqliteImporter.importToSqlite() to upsert into the Mirror DB.
 *   3. Prints a JSON summary on stdout.
 *
 * Default DB path: `.tmp/pipeline.db`. Pass `:memory:` to skip persisting
 * (useful for verifying the import contract without leaving artifacts).
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const EXTRACT = path.join(ROOT, "tools", process.platform === "win32" ? "dnf-extract.exe" : "dnf-extract");

function parseArgs(argv) {
  const args = { files: [], errors: [], mode: "full" };
  const consumeValue = (flag, i) => {
    const value = argv[i + 1];
    if (value === undefined) { args.errors.push(`${flag} requires a value`); return null; }
    if (value.startsWith("--")) { args.errors.push(`${flag} requires a value, got next flag ${value}`); return null; }
    return value;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--pvf") { const v = consumeValue(arg, i); if (v !== null) args.pvf = v; i++; }
    else if (arg === "--file") {
      const value = argv[++i];
      if (!value || value.startsWith("--")) args.errors.push(`--file requires non-empty value`);
      else args.files.push(value);
    }
    else if (arg === "--db") { const v = consumeValue(arg, i); if (v !== null) args.db = v; i++; }
    else if (arg === "--mode") { const v = consumeValue(arg, i); if (v !== null) args.mode = v; i++; }
    else if (arg === "--run-id") { const v = consumeValue(arg, i); if (v !== null) args.runId = v; i++; }
    else if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg.startsWith("--")) args.errors.push(`Unknown flag: ${arg}`);
  }
  return args;
}

function usage() {
  console.error("Usage: node scripts/import-to-sqlite.mjs --pvf <Script.pvf> --file <p1> [--file <p2> ...] [--db <path>] [--mode full|incremental]");
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("Usage: node scripts/import-to-sqlite.mjs --pvf <Script.pvf> --file <pvf-path> [--file ...] [--db <path>] [--mode full|incremental] [--run-id <id>]");
  console.log("");
  console.log("Stage 1 LOAD: imports EXTRACT + PARSE + VALIDATE output into a SQLite mirror DB");
  console.log("with 3 tables (pvf_files / extraction_runs / refs) and 10 per-domain VIEWs.");
  console.log("Default DB: .tmp/pipeline.db. Use ':memory:' for ephemeral runs.");
  process.exit(0);
}
if (args.errors.length > 0) {
  for (const err of args.errors) console.error(err);
  usage();
  process.exit(2);
}
if (!args.pvf || args.files.length === 0) { usage(); process.exit(2); }
if (args.mode !== "full" && args.mode !== "incremental" && args.mode !== "partial") {
  console.error(`Unsupported --mode ${args.mode}; expected full|incremental|partial.`);
  process.exit(2);
}

const compile = spawnSync(process.execPath, [
  path.join(ROOT, "scripts", "run-tsc.mjs"),
  "-p", path.join(ROOT, "tsconfig.test.json"),
], { cwd: ROOT, encoding: "utf8" });
if (compile.status !== 0) {
  if (compile.stdout) process.stdout.write(compile.stdout);
  if (compile.stderr) process.stderr.write(compile.stderr);
  process.exit(compile.status ?? 1);
}

const runnerUrl = pathToFileURL(path.join(
  ROOT, ".tmp", "test-js", "src", "dnf-native-combat", "data", "pipeline", "pipelineRunner.js",
)).href;
const { runExtractParsePipeline } = await import(runnerUrl);

const debugOut = path.join(ROOT, ".tmp", "pipeline-debug");
const dbPath = args.db ?? path.join(ROOT, ".tmp", "pipeline.db");

try {
  const result = await runExtractParsePipeline({
    pvfPath: args.pvf,
    files: args.files,
    debugOut,
    executablePath: EXTRACT,
    runId: args.runId,
    sqliteDbPath: dbPath,
    sqliteMode: args.mode,
  });

  console.log(JSON.stringify({
    stage: result.stage,
    filesExtracted: result.filesExtracted,
    filesParsed: result.filesParsed,
    parseErrors: result.parseErrors,
    validation: {
      runId: result.validation.meta.runId,
      stats: result.validation.stats,
      tier3Count: result.validation.tier3Fields.length,
      pvpFieldCount: result.validation.pvpFields.length,
      refResolvedCount: result.validation.refIntegrity.filter(r => r.status === "resolved").length,
      refMissingCount: result.validation.refIntegrity.filter(r => r.status === "missing").length,
    },
    sqliteImport: result.sqliteImport,
    reportPaths: result.reportPaths,
  }, null, 2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Import failed: ${message}`);
  process.exit(1);
}
