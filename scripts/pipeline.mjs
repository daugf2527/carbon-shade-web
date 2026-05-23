import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const EXTRACT = path.join(ROOT, "tools", process.platform === "win32" ? "dnf-extract.exe" : "dnf-extract");

function parseArgs(argv) {
  const args = { files: [], errors: [] };
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
    else if (arg === "--stop-at") {
      const v = consumeValue(arg, i); if (v !== null) args.stopAt = v; i++;
    }
    else if (arg === "--debug-out") {
      const v = consumeValue(arg, i); if (v !== null) args.debugOut = v; i++;
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
  console.error("Usage: node scripts/pipeline.mjs --pvf <Script.pvf> --file <pvf-path> [--file <pvf-path>] [--debug-out <dir>] [--stop-at parse]");
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log("Usage: node scripts/pipeline.mjs --pvf <Script.pvf> --file <pvf-path> [--file ...] [--debug-out <dir>] [--stop-at parse]");
  console.log("");
  console.log("Stage 1 pipeline runner (Day 8-10 skeleton: EXTRACT -> PARSE).");
  console.log("Outputs extract.jsonl, parse.jsonl, parse-errors.jsonl to --debug-out (default .tmp/pipeline-debug).");
  process.exit(0);
}
if (args.errors.length > 0) {
  for (const err of args.errors) console.error(err);
  usage();
  process.exit(2);
}
if (!args.pvf || args.files.length === 0) {
  usage();
  process.exit(2);
}
if (args.stopAt && args.stopAt !== "parse") {
  console.error(`Unsupported --stop-at ${args.stopAt}; Day 8-10 skeleton only supports EXTRACT -> PARSE.`);
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

const debugOut = args.debugOut ?? path.join(ROOT, ".tmp", "pipeline-debug");

try {
  const result = await runExtractParsePipeline({
    pvfPath: args.pvf,
    files: args.files,
    debugOut,
    executablePath: EXTRACT,
  });

  console.log(JSON.stringify({
    stage: result.stage,
    filesExtracted: result.filesExtracted,
    filesParsed: result.filesParsed,
    parseErrors: result.parseErrors,
    debugOut: result.debugOut,
  }, null, 2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Pipeline failed: ${message}`);
  process.exit(1);
}
