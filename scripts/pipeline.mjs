import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const EXTRACT = path.join(ROOT, "tools", process.platform === "win32" ? "dnf-extract.exe" : "dnf-extract");

function parseArgs(argv) {
  const args = { files: [], aniFiles: [], errors: [] };
  // Helper: consume the next argv element as the value for `flag`, but reject
  // when the next element starts with `--` (a sibling flag) — otherwise a
  // bare placeholder like `--pattern --pvf foo.pvf` would silently eat `--pvf`.
  const consumeValue = (flag, i) => {
    const value = argv[i + 1];
    if (value === undefined) {
      args.errors.push(`${flag} requires a value (got end of argv)`);
      return null;
    }
    if (value.startsWith("--")) {
      args.errors.push(`${flag} requires a value, got next flag ${value}`);
      return null;
    }
    return value;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--pvf") {
      const v = consumeValue(arg, i); if (v !== null) args.pvf = v; i++;
    }
    else if (arg === "--file") {
      const value = argv[++i];
      if (!value || value.startsWith("--")) {
        args.errors.push(`--file requires a non-empty PVF path (got ${JSON.stringify(value ?? null)})`);
      } else {
        args.files.push(value);
      }
    }
    else if (arg === "--ani-file") {
      // Audit pipeline-closure F2 (2026-05-24): .ani files are parsed by the
      // standalone AniParser (per design §2.2.1); they do NOT flow through
      // parseStage dispatch like .chr/.atk/.skl/.mob/etc. Listing them via
      // --ani-file routes them to loadAniDocumentsViaPipe + parseAniDocument,
      // and the resulting AniDef[] is plumbed to RuntimeExporter via the
      // `aniDefs` option so player/monster shard `animations` fields populate.
      const value = argv[++i];
      if (!value || value.startsWith("--")) {
        args.errors.push(`--ani-file requires a non-empty PVF path (got ${JSON.stringify(value ?? null)})`);
      } else {
        args.aniFiles.push(value);
      }
    }
    else if (arg === "--stop-at") {
      const v = consumeValue(arg, i); if (v !== null) args.stopAt = v; i++;
    }
    else if (arg === "--debug-out") {
      const v = consumeValue(arg, i); if (v !== null) args.debugOut = v; i++;
    }
    else if (arg === "--verification-out") {
      const v = consumeValue(arg, i); if (v !== null) args.verificationOut = v; i++;
    }
    else if (arg === "--no-verification") {
      args.noVerification = true;
    }
    else if (arg === "--run-id") {
      const v = consumeValue(arg, i); if (v !== null) args.runId = v; i++;
    }
    else if (arg === "--sqlite-db") {
      const v = consumeValue(arg, i); if (v !== null) args.sqliteDb = v; i++;
    }
    else if (arg === "--sqlite-mode") {
      const v = consumeValue(arg, i); if (v !== null) args.sqliteMode = v; i++;
    }
    else if (arg === "--export-out") {
      const v = consumeValue(arg, i); if (v !== null) args.exportOut = v; i++;
    }
    // Audit pipeline-closure F9 (2026-05-24): expose EXPORT contentFingerprint
    // skip-mode so callers can run incremental EXPORT across re-extractions
    // (where `extractTimestamp` differs but content is the same).
    else if (arg === "--use-content-fingerprint") {
      args.useContentFingerprint = true;
    }
    else if (arg === "--domain" || arg === "--job" || arg === "--pattern") {
      // No-op placeholders, but still validate that they don't eat a sibling flag.
      const v = consumeValue(arg, i); if (v !== null) { /* discard */ } i++;
    }
    else if (arg === "--full" || arg === "--incremental") args.mode = arg.slice(2);
    else if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg.startsWith("--")) args.errors.push(`Unknown flag: ${arg}`);
  }
  return args;
}

function usage() {
  console.error("Usage: node scripts/pipeline.mjs --pvf <Script.pvf> --file <pvf-path> [--file <pvf-path>] [--ani-file <pvf-path>] [--debug-out <dir>] [--stop-at parse]");
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log("Usage: node scripts/pipeline.mjs --pvf <Script.pvf> --file <pvf-path> [--file ...] [--ani-file <pvf-path>] [--debug-out <dir>] [--stop-at parse]");
  console.log("");
  console.log("Stage 1 pipeline runner (Day 8-10 skeleton: EXTRACT -> PARSE).");
  console.log("");
  console.log("Flags:");
  console.log("  --file       PVF path for .chr/.atk/.skl/.mob/.dgn/.map/.etc — routed via parseStage dispatch.");
  console.log("  --ani-file   PVF path for .ani — routed via standalone AniParser (design §2.2.1).");
  console.log("               .ani files DO NOT flow through --file; they need this separate flag so");
  console.log("               their AniDef[] is plumbed to RuntimeExporter's `aniDefs` option, which");
  console.log("               populates the per-entity `animations` field in dist/data shards.");
  console.log("");
  console.log("Outputs extract.jsonl, parse.jsonl, parse-errors.jsonl to --debug-out (default .tmp/pipeline-debug).");
  process.exit(0);
}
if (args.errors.length > 0) {
  for (const err of args.errors) console.error(err);
  usage();
  process.exit(2);
}
if (!args.pvf || (args.files.length === 0 && args.aniFiles.length === 0)) {
  usage();
  process.exit(2);
}
if (args.stopAt && args.stopAt !== "extract" && args.stopAt !== "parse" && args.stopAt !== "validate" && args.stopAt !== "load" && args.stopAt !== "export") {
  console.error(`Unsupported --stop-at ${args.stopAt}; supports extract | parse | validate | load | export.`);
  process.exit(2);
}
if (args.sqliteMode && args.sqliteMode !== "full" && args.sqliteMode !== "incremental" && args.sqliteMode !== "partial") {
  console.error(`Unsupported --sqlite-mode ${args.sqliteMode}; expected full | incremental | partial.`);
  process.exit(2);
}
// Audit pipeline-closure F7 (2026-05-24): SqliteImporter does NOT distinguish
// "partial" from "full" — the option silently fell through to full behaviour,
// hiding the fact that `partial` is not implemented. Until the importer grows
// partial-aware semantics, reject the flag at the CLI rather than mislead.
if (args.sqliteMode === "partial") {
  console.error(
    "--sqlite-mode partial is not implemented in SqliteImporter " +
    "(BACKLOG.md: pipeline-closure F7). Use 'full' or 'incremental'."
  );
  process.exit(2);
}

const compile = spawnSync(process.execPath, [
  path.join(ROOT, "scripts", "run-tsc.mjs"),
  "-p",
  path.join(ROOT, "tsconfig.test.json"),
], { cwd: ROOT, encoding: "utf8" });
if (compile.status !== 0) {
  if (compile.stdout) process.stdout.write(compile.stdout);
  if (compile.stderr) process.stderr.write(compile.stderr);
  process.exit(compile.status ?? 1);
}

const runnerUrl = pathToFileURL(path.join(
  ROOT,
  ".tmp",
  "test-js",
  "src",
  "dnf-native-combat",
  "data",
  "pipeline",
  "pipelineRunner.js",
)).href;
const { runExtractParsePipeline } = await import(runnerUrl);

// Audit pipeline-closure F2 (2026-05-24): when --ani-file flags were provided,
// extract those paths separately via dnf-extract --pipe and route them through
// the standalone AniParser (design §2.2.1 — .ani does NOT flow through
// parseStage dispatch). The resulting AniDef[] is passed to
// runExtractParsePipeline via the `aniDefs` option, which RuntimeExporter
// inlines into per-entity (player/monster) shard `animations` maps. Without
// this plumb the `animations` field was permanently empty regardless of how
// many .ani files the user listed.
let aniDefs;
if (args.aniFiles.length > 0) {
  const loaderUrl = pathToFileURL(path.join(
    ROOT, ".tmp", "test-js", "src", "dnf-native-combat", "data", "parsers", "PvfDocumentLoader.js",
  )).href;
  const aniParserUrl = pathToFileURL(path.join(
    ROOT, ".tmp", "test-js", "src", "dnf-native-combat", "data", "parsers", "AniParser.js",
  )).href;
  const { loadAniDocumentsViaPipe } = await import(loaderUrl);
  const { parseAniDocument } = await import(aniParserUrl);
  const aniDocs = await loadAniDocumentsViaPipe(args.aniFiles, {
    pvfPath: args.pvf,
    executablePath: EXTRACT,
  });
  aniDefs = aniDocs.map(parseAniDocument);
}

const debugOut = args.debugOut ?? path.join(ROOT, ".tmp", "pipeline-debug");
// Project-level verification/ by convention (design §2.4). Tests should
// override via --verification-out to keep PROBE_TMP isolated; CLI default
// targets repo root verification/ so reports survive between runs.
const verificationOut = args.noVerification
  ? null
  : (args.verificationOut ?? path.join(ROOT, "verification"));

// --full / --incremental modes auto-enable LOAD + EXPORT with default paths
// (so the user does not have to spell out 4 flags every run).
// Audit pipeline-closure F8 (2026-05-24): when --stop-at is set to an
// earlier stage, the auto-defaults silently materialized then silently
// ignored — making the CLI look like LOAD/EXPORT ran. Gate defaults so
// they only kick in when the pipeline will actually reach that stage.
const stopsBeforeLoad = args.stopAt === "extract" || args.stopAt === "parse" || args.stopAt === "validate";
const stopsBeforeExport = stopsBeforeLoad || args.stopAt === "load";
let sqliteDb = args.sqliteDb;
let exportOut = args.exportOut;
let sqliteMode = args.sqliteMode;
let exportBaseManifest;
if (args.mode === "full" || args.mode === "incremental") {
  if (!stopsBeforeLoad) {
    sqliteDb = sqliteDb ?? path.join(ROOT, ".tmp", "pipeline.db");
  } else if (args.sqliteDb !== undefined) {
    console.error(`--sqlite-db is ignored because --stop-at ${args.stopAt} runs before LOAD.`);
  }
  if (!stopsBeforeExport) {
    exportOut = exportOut ?? path.join(ROOT, "dist", "data");
  } else if (args.exportOut !== undefined) {
    console.error(`--export-out is ignored because --stop-at ${args.stopAt} runs before EXPORT.`);
  }
  if (args.mode === "incremental" && !stopsBeforeLoad) {
    sqliteMode = sqliteMode ?? "incremental";
    // Load prior manifest for EXPORT diff. If absent, treat as first run.
    if (!stopsBeforeExport) {
      const fs = await import("node:fs/promises");
      const manifestPath = path.join(exportOut, "manifest.json");
      try {
        const content = await fs.readFile(manifestPath, "utf-8");
        exportBaseManifest = JSON.parse(content);
      } catch (e) {
        // No prior manifest → incremental EXPORT becomes effectively "full"
        // for this run, which is intentional (first run baseline).
      }
    }
  }
}

try {
  const result = await runExtractParsePipeline({
    pvfPath: args.pvf,
    files: args.files,
    debugOut,
    executablePath: EXTRACT,
    runId: args.runId,
    verificationOutDir: verificationOut,
    sqliteDbPath: sqliteDb,
    sqliteMode,
    exportOutDir: exportOut,
    exportBaseManifest,
    exportUseContentFingerprint: args.useContentFingerprint === true,
    stopAt: args.stopAt,
    aniDefs,
  });

  console.log(JSON.stringify({
    stage: result.stage,
    filesExtracted: result.filesExtracted,
    filesParsed: result.filesParsed,
    aniDefsLoaded: aniDefs ? aniDefs.length : 0,
    parseErrors: result.parseErrors,
    debugOut: result.debugOut,
    validation: {
      runId: result.validation.meta.runId,
      stats: result.validation.stats,
      tier3Count: result.validation.tier3Fields.length,
      pvpFieldCount: result.validation.pvpFields.length,
      refResolvedCount: result.validation.refIntegrity.filter(r => r.status === "resolved").length,
      refMissingCount: result.validation.refIntegrity.filter(r => r.status === "missing").length,
    },
    sqliteImport: result.sqliteImport,
    exportResult: result.exportResult ? {
      outDir: result.exportResult.outDir,
      manifestPath: result.exportResult.manifestPath,
      filesWritten: result.exportResult.filesWritten,
      durationMs: result.exportResult.durationMs,
    } : null,
    reportPaths: result.reportPaths,
  }, null, 2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Pipeline failed: ${message}`);
  process.exit(1);
}
