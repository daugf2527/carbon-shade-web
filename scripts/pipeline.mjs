import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const EXTRACT = path.join(ROOT, "tools", process.platform === "win32" ? "dnf-extract.exe" : "dnf-extract");

function parseArgs(argv) {
  const args = { files: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--pvf") args.pvf = argv[++i];
    else if (arg === "--file") args.files.push(argv[++i]);
    else if (arg === "--stop-at") args.stopAt = argv[++i];
    else if (arg === "--debug-out") args.debugOut = argv[++i];
    else if (arg === "--domain" || arg === "--job" || arg === "--pattern") i++;
    else if (arg === "--full" || arg === "--incremental") args.mode = arg.slice(2);
  }
  return args;
}

function usage() {
  console.error("Usage: node scripts/pipeline.mjs --pvf <Script.pvf> --file <pvf-path> [--file <pvf-path>] [--stop-at parse]");
}

const args = parseArgs(process.argv.slice(2));
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
  debugOut: result.debugOut,
}, null, 2));
