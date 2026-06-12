import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = process.cwd();
const compiledRunner = path.join(root, ".tmp", "test-js", "src", "dnf-native-combat", "data", "pipeline", "pipelineRunner.js");

if (!existsSync(compiledRunner)) {
  console.log("SKIP pipeline reuse compiled test: .tmp/test-js has not been built");
  process.exit(0);
}

const tempRoot = mkdtempSync(path.join(tmpdir(), "pipeline-reuse-"));
const preload = path.join(tempRoot, "block-run-tsc.cjs");
writeFileSync(preload, `
const childProcess = require("node:child_process");
const originalSpawnSync = childProcess.spawnSync;
childProcess.spawnSync = function(command, args, options) {
  if (Array.isArray(args) && args.some(arg => String(arg).endsWith("scripts\\\\run-tsc.mjs") || String(arg).endsWith("scripts/run-tsc.mjs"))) {
    return { status: 93, stdout: "", stderr: "UNEXPECTED_RUN_TSC_INVOCATION" };
  }
  return originalSpawnSync.apply(this, arguments);
};
`);

try {
  const result = spawnSync(process.execPath, [
    path.join(root, "scripts", "pipeline.mjs"),
    "--pvf",
    "D:/does-not-exist-h5.pvf",
    "--file",
    "character/swordman/swordman.chr",
    "--stop-at",
    "extract",
  ], {
    cwd: root,
    env: {
      ...process.env,
      CARBON_SHADE_REUSE_COMPILED_TEST_JS: "1",
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require ${preload}`.trim(),
    },
    encoding: "utf8",
    timeout: 20000,
  });

  assert.notEqual(result.status, 93);
  assert.ok(!result.stderr.includes("UNEXPECTED_RUN_TSC_INVOCATION"), result.stderr);
  assert.ok(result.stderr.includes("Pipeline failed:"), result.stderr);
  console.log("pipeline reuse compiled test passed");
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
