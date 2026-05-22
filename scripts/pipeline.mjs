import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const EXTRACT = path.join(ROOT, "tools", process.platform === "win32" ? "dnf-extract.exe" : "dnf-extract");

function parseArgs(argv) {
  const args = { files: [], errors: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--pvf") args.pvf = argv[++i];
    else if (arg === "--file") {
      const value = argv[++i];
      if (!value || value.startsWith("--")) {
        args.errors.push(`--file requires a non-empty PVF path (got ${JSON.stringify(value ?? null)})`);
      } else {
        args.files.push(value);
      }
    }
    else if (arg === "--stop-at") args.stopAt = argv[++i];
    else if (arg === "--debug-out") args.debugOut = argv[++i];
    else if (arg === "--domain" || arg === "--job" || arg === "--pattern") i++;
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
