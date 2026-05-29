#!/usr/bin/env node
/**
 * compile-schema.mjs — Compile FlatBuffers .fbs → typed TypeScript
 *
 * Stage 2 Day 1 骨架。当前仅检测 flatc CLI 是否安装：
 *   - 已装 → 编译 src/engine/schema/*.fbs → src/engine/schema/*_generated.ts
 *   - 未装 → 打印 Windows 安装步骤，exit 1
 *
 * 用法:
 *   node scripts/compile-schema.mjs              # 编译所有 .fbs
 *   node scripts/compile-schema.mjs <file.fbs>   # 编译单个 .fbs
 *
 * 2026-05-27 创建（用户决策 Q3 FlatBuffers Phase 2 Day 1）。
 */

import { spawnSync } from "node:child_process";
import { readdirSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// __dirname-equivalent: scripts/ → repo root
const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");
const SCHEMA_DIR = path.join(ROOT, "src", "engine", "schema");
const OUT_DIR = SCHEMA_DIR; // co-locate _generated.ts with .fbs

// === Step 1: detect flatc ===
const probe = spawnSync("flatc", ["--version"], { encoding: "utf8" });
if (probe.error || probe.status !== 0) {
  console.error(`[compile-schema] flatc CLI not found in PATH.`);
  console.error("");
  console.error("Install on Windows:");
  console.error("  1. Download https://github.com/google/flatbuffers/releases");
  console.error("     → Windows.flatc.binary.zip (~3MB)");
  console.error("  2. Unzip flatc.exe to a directory in PATH");
  console.error("     (e.g. C:/Users/<you>/bin/)");
  console.error("  3. Verify: flatc --version");
  console.error("");
  console.error("Alt (package managers):");
  console.error("  scoop install flatbuffers");
  console.error("  choco install flatbuffers");
  console.error("");
  console.error("See src/engine/schema/README.md for details.");
  process.exit(1);
}
console.log(`[compile-schema] flatc detected: ${probe.stdout.trim()}`);

// === Step 2: find .fbs files ===
const args = process.argv.slice(2);
let fbsFiles;
if (args.length > 0) {
  fbsFiles = args.map(a => path.resolve(a));
} else {
  fbsFiles = readdirSync(SCHEMA_DIR)
    .filter(n => n.endsWith(".fbs"))
    .map(n => path.join(SCHEMA_DIR, n));
}

if (fbsFiles.length === 0) {
  console.log("[compile-schema] no .fbs files to compile.");
  process.exit(0);
}

console.log(`[compile-schema] compiling ${fbsFiles.length} .fbs files...`);

// === Step 3: invoke flatc ===
// --ts: generate TypeScript
// --gen-object-api: emit unpack/pack helpers
// --gen-all: include dependent schemas
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

let failCount = 0;
for (const fbs of fbsFiles) {
  const result = spawnSync(
    "flatc",
    ["--ts", "--gen-object-api", "-o", OUT_DIR, fbs],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    console.error(`[compile-schema] FAIL ${path.basename(fbs)}: ${result.stderr.trim()}`);
    failCount++;
  } else {
    console.log(`[compile-schema] OK ${path.basename(fbs)}`);
  }
}

if (failCount > 0) {
  console.error(`[compile-schema] ${failCount}/${fbsFiles.length} failed.`);
  process.exit(1);
}
console.log(`[compile-schema] all ${fbsFiles.length} compiled successfully.`);

// === Step 4: compile generated .ts → .js ===
console.log(`[compile-schema] compiling generated .ts → .js...`);
const GEN_DIR = path.join(SCHEMA_DIR, "carbon-shade", "engine", "schema");
if (existsSync(GEN_DIR)) {
  const tsFiles = readdirSync(GEN_DIR).filter(f => f.endsWith('.ts'));
  if (tsFiles.length === 0) {
    console.warn(`[compile-schema] no .ts files found in ${GEN_DIR}`);
  } else {
    // Compile all .ts files in one tsc invocation
    // Use node_modules/.bin/tsc directly to avoid npx PATH issues
    const tscPath = path.join(ROOT, "node_modules", ".bin", "tsc");
    const tscArgs = [
      "--module", "esnext",
      "--target", "es2022",
      "--moduleResolution", "bundler",
      "--skipLibCheck",
      "--outDir", GEN_DIR,
      ...tsFiles.map(f => path.join(GEN_DIR, f))
    ];

    const tscResult = spawnSync(tscPath, tscArgs, {
      encoding: "utf8",
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true  // Windows needs shell for .bin scripts
    });

    if (tscResult.status !== 0) {
      console.error(`[compile-schema] tsc failed (exit ${tscResult.status}):`);
      if (tscResult.stdout) console.error(tscResult.stdout);
      if (tscResult.stderr) console.error(tscResult.stderr);
      if (tscResult.error) console.error(tscResult.error);
      process.exit(1);
    }
    console.log(`[compile-schema] generated ${tsFiles.length} .ts files compiled to .js`);
  }
} else {
  console.warn(`[compile-schema] generated dir not found: ${GEN_DIR}`);
}
