/**
 * Stage 1 EXPORT CLI — entity-centric JSON shards + manifest.
 *
 * Usage:
 *   node scripts/export-runtime-json.mjs --pvf <Script.pvf> --file <p1> [--file <p2> ...] [--out <dir>]
 *
 * Runs EXTRACT → PARSE → VALIDATE → EXPORT. Optionally also LOAD
 * (--sqlite-db <path>). Outputs dist/data/{players,monsters,dungeons,shared}/
 * plus manifest.json with sha256 + sizeBytes.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const EXTRACT = path.join(ROOT, "tools", process.platform === "win32" ? "dnf-extract.exe" : "dnf-extract");

function parseArgs(argv) {
  const args = { files: [], errors: [] };
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
    else if (arg === "--out") { const v = consumeValue(arg, i); if (v !== null) args.out = v; i++; }
    else if (arg === "--sqlite-db") { const v = consumeValue(arg, i); if (v !== null) args.sqliteDb = v; i++; }
    else if (arg === "--run-id") { const v = consumeValue(arg, i); if (v !== null) args.runId = v; i++; }
    else if (arg === "--no-shared") args.noShared = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg.startsWith("--")) args.errors.push(`Unknown flag: ${arg}`);
  }
  return args;
}

function usage() {
  console.error("Usage: node scripts/export-runtime-json.mjs --pvf <Script.pvf> --file <p1> [--file <p2> ...] [--out <dir>] [--sqlite-db <path>] [--no-shared]");
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("Usage: node scripts/export-runtime-json.mjs --pvf <Script.pvf> --file <pvf-path> [--file ...] [--out <dir>] [--sqlite-db <path>] [--no-shared] [--run-id <id>]");
  console.log("");
  console.log("Stage 1 EXPORT: writes entity-centric JSON to dist/data/{players,monsters,dungeons,shared}/");
  console.log("Default --out: dist/data");
  console.log("Default writes shared/physics.json + shared/enums.json (suppress with --no-shared)");
  process.exit(0);
}
if (args.errors.length > 0) {
  for (const err of args.errors) console.error(err);
  usage();
  process.exit(2);
}
if (!args.pvf || args.files.length === 0) { usage(); process.exit(2); }

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
const physicsUrl = pathToFileURL(path.join(
  ROOT, ".tmp", "test-js", "src", "data", "official", "dnfPhysicsConstants.js",
)).href;
const enumsUrl = pathToFileURL(path.join(
  ROOT, ".tmp", "test-js", "src", "data", "official", "dnfEnumTables.js",
)).href;

const { runExtractParsePipeline } = await import(runnerUrl);
const physicsMod = await import(physicsUrl);
const enumsMod = await import(enumsUrl);

const debugOut = path.join(ROOT, ".tmp", "pipeline-debug");
const outDir = args.out ?? path.join(ROOT, "dist", "data");

const sharedPhysics = args.noShared ? undefined : physicsMod.DNF_PHYSICS_CONSTANTS;
const sharedEnums = args.noShared ? undefined : {
  tables: {
    ATTACKTYPE: stringifyKeys(enumsMod.ATTACKTYPE),
    ELEMENT: stringifyKeys(enumsMod.ELEMENT),
    DAMAGEACT: stringifyKeys(enumsMod.DAMAGEACT),
    KNOCK_BACK_TYPE: stringifyKeys(enumsMod.KNOCK_BACK_TYPE),
    DOWN_PARAM_TYPE: stringifyKeys(enumsMod.DOWN_PARAM_TYPE),
    CUSTOM_ATTACKINFO: stringifyKeys(enumsMod.CUSTOM_ATTACKINFO),
  },
  field_to_enum: enumsMod.FIELD_TO_ENUM,
};

// JSON object keys are always strings; convert {0:"x"} → {"0":"x"} explicitly.
function stringifyKeys(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[String(k)] = v;
  return out;
}

try {
  const result = await runExtractParsePipeline({
    pvfPath: args.pvf,
    files: args.files,
    debugOut,
    executablePath: EXTRACT,
    runId: args.runId,
    sqliteDbPath: args.sqliteDb,
    exportOutDir: outDir,
    sharedPhysics,
    sharedEnums,
  });

  console.log(JSON.stringify({
    stage: result.stage,
    filesExtracted: result.filesExtracted,
    filesParsed: result.filesParsed,
    parseErrors: result.parseErrors,
    validation: {
      runId: result.validation.meta.runId,
      stats: result.validation.stats,
    },
    sqliteImport: result.sqliteImport,
    exportResult: result.exportResult ? {
      outDir: result.exportResult.outDir,
      manifestPath: result.exportResult.manifestPath,
      filesWritten: result.exportResult.filesWritten,
      durationMs: result.exportResult.durationMs,
      manifestEntries: result.exportResult.manifest.files.map(f => ({
        path: f.path,
        kind: f.kind,
        sizeBytes: f.sizeBytes,
        sha256Prefix: f.sha256.slice(0, 12),
      })),
    } : null,
  }, null, 2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Export failed: ${message}`);
  process.exit(1);
}
