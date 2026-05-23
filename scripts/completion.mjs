#!/usr/bin/env node
// scripts/completion.mjs — Day 1-17 stage1 deliverable presence audit
//
// What this is NOT: a correctness test. It only checks PRESENCE.
// What this IS: a fast "did we actually build it?" gate that answers
//   "我们 Day N 真的完成了吗？" in O(seconds) instead of O(human-grep).
//
// Each deliverable check returns { passed: bool, evidence: string }.
// Checks are deliberately cheap (grep / file exists / small CLI invoke).
// For deep correctness, use static:test + npm run audit (agent audits).

import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = process.cwd();
const PVF = process.env.SCRIPT_PVF || "D:/BaiduNetdiskDownload/DNF客户端（2018年2月更新）/地下城与勇士/Script.pvf";
const DNF_EXTRACT = process.platform === "win32"
  ? join(ROOT, "tools", "dnf-extract.exe")
  : join(ROOT, "tools", "dnf-extract");

// ── Check helpers ──────────────────────────────────────────────────────────

function exists(rel) {
  return existsSync(join(ROOT, rel));
}

function grepInFile(rel, pattern, opts = {}) {
  const fullPath = join(ROOT, rel);
  if (!existsSync(fullPath)) return { passed: false, evidence: `file ${rel} not found` };
  const content = readFileSync(fullPath, "utf-8");
  const re = typeof pattern === "string" ? new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) : pattern;
  const found = re.test(content);
  return {
    passed: found,
    evidence: found ? `${rel}: matched /${re.source}/` : `${rel}: NO match for /${re.source}/`,
  };
}

function grepInDir(dir, pattern) {
  const fullDir = join(ROOT, dir);
  if (!existsSync(fullDir)) return { passed: false, evidence: `dir ${dir} not found` };
  const re = typeof pattern === "string" ? new RegExp(pattern) : pattern;
  const matches = [];

  function walk(d) {
    const entries = readdirSync(d, { withFileTypes: true });
    for (const e of entries) {
      const full = join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".tmp" || e.name === "dist" || e.name === ".git") continue;
        walk(full);
      } else if (e.isFile()) {
        // Skip binary-likely files
        if (/\.(png|jpg|exe|dll|so|dylib|wasm|bin)$/i.test(e.name)) continue;
        try {
          const content = readFileSync(full, "utf-8");
          if (re.test(content)) matches.push(full.replace(ROOT, "").replace(/\\/g, "/"));
        } catch {}
      }
    }
  }
  walk(fullDir);

  return {
    passed: matches.length > 0,
    evidence: matches.length > 0
      ? `${matches.length} file(s) match: ${matches.slice(0, 3).join(", ")}${matches.length > 3 ? "..." : ""}`
      : `0 matches for /${re.source}/ in ${dir}/`,
  };
}

function dnfExtractHelpContains(flag) {
  if (!existsSync(DNF_EXTRACT)) return { passed: false, evidence: "dnf-extract binary missing" };
  try {
    const r = spawnSync(DNF_EXTRACT, ["--help"], { encoding: "utf-8" });
    const text = (r.stdout || "") + (r.stderr || "");
    return {
      passed: text.includes(flag),
      evidence: text.includes(flag) ? `--help contains ${flag}` : `--help missing ${flag}`,
    };
  } catch (e) {
    return { passed: false, evidence: `dnf-extract --help failed: ${e.message}` };
  }
}

function dnfExtractEmitsField(samplePath, field) {
  if (!existsSync(DNF_EXTRACT) || !existsSync(PVF)) {
    return { passed: false, evidence: `dnf-extract or PVF missing (skipped)` };
  }
  try {
    const r = spawnSync(DNF_EXTRACT, ["--pvf", PVF, "--file", samplePath], { encoding: "utf-8", timeout: 20000 });
    if (r.status !== 0) return { passed: false, evidence: `extract exited ${r.status}` };
    const json = JSON.parse(r.stdout);
    const has = typeof json[field] !== "undefined";
    return { passed: has, evidence: has ? `emits ${field}=${JSON.stringify(json[field]).slice(0,50)}` : `missing ${field}` };
  } catch (e) {
    return { passed: false, evidence: `extract failed: ${e.message}` };
  }
}

function countFiles(globPattern, dir) {
  const r = spawnSync("node", ["-e", `
    import("node:fs/promises").then(async fs => {
      const dirents = await fs.readdir("${join(ROOT, dir).replace(/\\/g, "/")}", { withFileTypes: true });
      console.log(dirents.filter(d => d.isFile() && d.name.match(${globPattern})).length);
    });
  `.replace(/\n/g, "")], { encoding: "utf-8" });
  return parseInt(r.stdout.trim(), 10) || 0;
}

function runGate(cmd) {
  try {
    const r = spawnSync("npm", ["run", cmd, "--silent"], { cwd: ROOT, encoding: "utf-8", timeout: 300000, shell: true });
    return { passed: r.status === 0, evidence: r.status === 0 ? `${cmd} pass` : `${cmd} exit ${r.status}` };
  } catch (e) {
    return { passed: false, evidence: `${cmd} threw: ${e.message}` };
  }
}

// ── Day-by-Day deliverable map ─────────────────────────────────────────────

const DAYS = [
  {
    range: "Day 1-3", name: "工具 Lite",
    items: [
      { id: "defect-1-isFloat-marker", desc: "Document attr type tagged (isFloat in PvfDocument.h)",
        check: () => grepInFile("tools/dnf-porting-src/PvfDocument.h", "isFloat") },
      { id: "defect-1-typed-json-output", desc: "extract output emits typed {t,v} attrs",
        check: () => grepInFile("tools/dnf-porting-src/main.cpp", '\\"t\\":\\"int\\"') },
      { id: "cancel-dual-semantics", desc: "applyCancelDualSemantics() in PvfDocument.cpp",
        check: () => grepInFile("tools/dnf-porting-src/PvfDocument.cpp", "applyCancelDualSemantics") },
      { id: "cli-filter-ext", desc: "--filter-ext CLI flag",
        check: () => dnfExtractHelpContains("--filter-ext") },
      { id: "cli-manifest", desc: "--manifest CLI flag",
        check: () => dnfExtractHelpContains("--manifest") },
      { id: "cli-only-changed", desc: "--only-changed CLI flag",
        check: () => dnfExtractHelpContains("--only-changed") },
      { id: "cli-progress-stderr", desc: "[PROGRESS] stderr emission",
        check: () => grepInFile("tools/dnf-porting-src/main.cpp", "[PROGRESS]") },
    ],
  },
  {
    range: "Day 4-5", name: "Mid (Ref + Enum)",
    items: [
      { id: "m1-ref-target-kind", desc: "M1: ref attrs emit target_kind",
        check: () => grepInFile("tools/dnf-porting-src/main.cpp", "target_kind") },
      { id: "m2-enum-tables", desc: "M2: EnumTables.h ≥100 lines",
        check: () => {
          if (!exists("tools/dnf-porting-src/EnumTables.h")) return { passed: false, evidence: "missing" };
          const lines = readFileSync(join(ROOT, "tools/dnf-porting-src/EnumTables.h"), "utf-8").split("\n").length;
          return { passed: lines >= 100, evidence: `${lines} lines` };
        }},
    ],
  },
  {
    range: "Day 6-7", name: "Deep (Vec/Mat + Provenance)",
    items: [
      { id: "d1-vec-mat-collapse", desc: 'D1: vec/mat collapsed in printDocumentJson ("t":"vec" / "t":"mat")',
        check: () => grepInFile("tools/dnf-porting-src/main.cpp", '\\"t\\":\\"vec\\"') },
      { id: "d3-provenance-extractor-version", desc: "D3: extractor_version in output preamble",
        check: () => grepInFile("tools/dnf-porting-src/main.cpp", "extractor_version") },
      { id: "d3-provenance-symmetry", desc: "D3: provenance symmetric across Document/Animation/Text (Binary deferred)",
        check: () => {
          const txt = readFileSync(join(ROOT, "tools/dnf-porting-src/main.cpp"), "utf-8");
          // Each print function should contain `extractor_version` somewhere in its body.
          // Slice out each function body and check.
          function functionBodyContains(funcName, needle) {
            const startIdx = txt.indexOf(`static void ${funcName}`);
            if (startIdx < 0) return false;
            // Walk braces to find body end
            const openIdx = txt.indexOf("{", startIdx);
            if (openIdx < 0) return false;
            let depth = 1, i = openIdx + 1;
            while (i < txt.length && depth > 0) {
              if (txt[i] === "{") depth++;
              else if (txt[i] === "}") depth--;
              i++;
            }
            const body = txt.slice(openIdx, i);
            return body.includes(needle);
          }
          const inDoc = functionBodyContains("printDocumentJson", "extractor_version");
          const inAni = functionBodyContains("printAnimationJson", "extractor_version");
          const inText = functionBodyContains("printTextJson", "extractor_version");
          const inBinary = functionBodyContains("printBinaryJson", "extractor_version");
          return {
            passed: inDoc && inAni && inText,
            evidence: `Document:${inDoc} Animation:${inAni} Text:${inText} Binary:${inBinary} (binary deferred)`,
          };
        }},
    ],
  },
  {
    range: "Day 8-10", name: "Pipeline + 7 parser (target)",
    items: [
      { id: "pipeline-cli", desc: "scripts/pipeline.mjs",
        check: () => ({ passed: exists("scripts/pipeline.mjs"), evidence: exists("scripts/pipeline.mjs") ? "exists" : "missing" }) },
      { id: "pipeline-runner", desc: "pipelineRunner.ts",
        check: () => ({ passed: exists("src/dnf-native-combat/data/pipeline/pipelineRunner.ts"), evidence: "exists" }) },
      { id: "pipeline-loader", desc: "PvfDocumentLoader.ts (--pipe bridge)",
        check: () => grepInFile("src/dnf-native-combat/data/parsers/PvfDocumentLoader.ts", "loadPvfDocumentsViaPipe") },
      { id: "pipeline-dispatch", desc: "parseStage.ts dispatch",
        check: () => grepInFile("src/dnf-native-combat/data/pipeline/parseStage.ts", "parsePvfDocument") },
      { id: "parsers-target-7", desc: "7 named parsers per design §7 (Chr/Skl/Atk/Ani/Mob/Dgn/Map)",
        check: () => {
          const parserDir = join(ROOT, "src/dnf-native-combat/data/parsers");
          if (!existsSync(parserDir)) return { passed: false, evidence: "parsers dir missing" };
          // design §7 names exactly these 7 parsers. We verify presence by name,
          // not by count, so adding extras (Nut/Etc/Img) does not mask a missing
          // canonical parser (regression caught Day 11 prep: MapParser was absent).
          const required = ["ChrParser.ts", "SklParser.ts", "AtkParser.ts",
                            "AniParser.ts", "MobParser.ts", "DgnParser.ts", "MapParser.ts"];
          const allFiles = readdirSync(parserDir);
          const present = required.filter(name => allFiles.includes(name));
          const missing = required.filter(name => !allFiles.includes(name));
          return {
            passed: missing.length === 0,
            evidence: missing.length === 0
              ? `7/7 named: ${present.join(", ")}`
              : `${present.length}/7 named; missing: ${missing.join(", ")}`,
          };
        }},
      { id: "parsers-wired-in-dispatch", desc: "≥4 parsers wired into parseStage.ts (chr/mob/atk minimum + more)",
        check: () => {
          const txt = readFileSync(join(ROOT, "src/dnf-native-combat/data/pipeline/parseStage.ts"), "utf-8");
          const cases = (txt.match(/case "\.[a-z]+":/g) || []).length;
          return { passed: cases >= 4, evidence: `${cases} dispatch cases` };
        }},
      { id: "probes-h1-h5", desc: "H1-H5 probe suites",
        check: () => {
          const testDir = join(ROOT, "tests/static");
          if (!existsSync(testDir)) return { passed: false, evidence: "tests/static missing" };
          const all = readdirSync(testDir);
          const found = [1, 2, 3, 4, 5].filter(n => all.some(f => f.startsWith(`dnf-native-h${n}-`))).length;
          return { passed: found === 5, evidence: `${found}/5 H probes present` };
        }},
      { id: "gate-typecheck", desc: "npm run typecheck pass",
        check: () => runGate("typecheck") },
    ],
  },
  {
    range: "Day 11-12", name: "VALIDATE L2 + SQLite LOAD",
    items: [
      { id: "validator-l2", desc: "validator.ts with schema + ref + provenance + PvP audit, wired into pipelineRunner",
        check: () => {
          const validatorPath = "src/dnf-native-combat/data/validator.ts";
          const runnerPath = "src/dnf-native-combat/data/pipeline/pipelineRunner.ts";
          if (!exists(validatorPath)) return { passed: false, evidence: "validator.ts missing" };
          const v = readFileSync(join(ROOT, validatorPath), "utf-8");
          const required = [
            "validateParsedDocuments",
            "buildProvenanceAudit",
            "VerificationReport",
            "Tier3FieldEntry",
            "PvpFieldEntry",
            "RefEntry",
          ];
          const missing = required.filter(sym => !v.includes(sym));
          if (missing.length > 0) {
            return { passed: false, evidence: `validator.ts missing exports: ${missing.join(", ")}` };
          }
          if (!exists(runnerPath)) return { passed: false, evidence: "pipelineRunner.ts missing" };
          const r = readFileSync(join(ROOT, runnerPath), "utf-8");
          if (!r.includes("validateParsedDocuments")) {
            return { passed: false, evidence: "pipelineRunner.ts does not import validateParsedDocuments" };
          }
          if (!r.includes("buildProvenanceAudit")) {
            return { passed: false, evidence: "pipelineRunner.ts does not import buildProvenanceAudit" };
          }
          return { passed: true, evidence: "validator.ts has 6 exports + integrated in pipelineRunner.ts" };
        }},
      { id: "sqlite-import-script", desc: "scripts/import-to-sqlite.mjs",
        check: () => ({ passed: exists("scripts/import-to-sqlite.mjs"),
                        evidence: exists("scripts/import-to-sqlite.mjs") ? "exists" : "missing" }) },
      { id: "sqlite-usage", desc: "node:sqlite used somewhere in src/ or scripts/",
        check: () => grepInDir("src", "node:sqlite|DatabaseSync") },
    ],
  },
  {
    range: "Day 13-14", name: "EXPORT + manifest + smoke",
    items: [
      { id: "export-script", desc: "scripts/export-runtime-json.mjs",
        check: () => ({ passed: exists("scripts/export-runtime-json.mjs"),
                        evidence: exists("scripts/export-runtime-json.mjs") ? "exists" : "missing" }) },
      { id: "runtime-manifest", desc: "dist/data/manifest.json or src manifest schema",
        check: () => ({ passed: exists("dist/data/manifest.json"),
                        evidence: exists("dist/data/manifest.json") ? "exists" : "missing (build hasn't emitted)" }) },
    ],
  },
  {
    range: "Day 15-17", name: "Integration + verification + docs",
    items: [
      { id: "verification-artifacts", desc: "verification/ has stage1 reports",
        check: () => {
          const dir = join(ROOT, "verification");
          if (!existsSync(dir)) return { passed: false, evidence: "verification/ missing" };
          const entries = readdirSync(dir);
          return { passed: entries.length > 0, evidence: `${entries.length} entries in verification/` };
        }},
      { id: "stage1-changelog", desc: "docs/changelog has stage1 entry",
        check: () => grepInDir("docs/changelog", "stage1") },
    ],
  },
];

// ── Run + render ───────────────────────────────────────────────────────────

const results = DAYS.map(day => ({
  ...day,
  items: day.items.map(item => ({ ...item, result: item.check() })),
}));

let totalItems = 0;
let totalPassed = 0;
let lines = [];
lines.push(`# Stage 1 Completion Dashboard — ${new Date().toISOString().slice(0, 10)}`);
lines.push("");

for (const day of results) {
  const dayPassed = day.items.filter(i => i.result.passed).length;
  const dayTotal = day.items.length;
  totalItems += dayTotal;
  totalPassed += dayPassed;
  const dayBadge = dayPassed === dayTotal ? "✅" : dayPassed === 0 ? "❌" : "⚠️";
  lines.push(`## ${dayBadge} ${day.range}: ${day.name} — ${dayPassed}/${dayTotal}`);
  lines.push("");
  for (const item of day.items) {
    const badge = item.result.passed ? "✅" : "❌";
    lines.push(`- ${badge} **${item.id}** — ${item.desc}`);
    lines.push(`    \`${item.result.evidence}\``);
  }
  lines.push("");
}

lines.push("---");
lines.push("");
lines.push(`**Overall: ${totalPassed}/${totalItems} (${Math.round(100*totalPassed/totalItems)}%) deliverables present**`);
lines.push("");
lines.push("> This dashboard only checks PRESENCE, not correctness. For correctness use `npm run static:test` + `npm run audit`.");

const output = lines.join("\n");
console.log(output);

// Write JSON sidecar for CI consumption
const jsonPath = join(ROOT, ".tmp", "completion.json");
try {
  mkdirSync(join(ROOT, ".tmp"), { recursive: true });
  writeFileSync(jsonPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalItems, totalPassed,
    days: results.map(d => ({
      range: d.range, name: d.name,
      items: d.items.map(i => ({ id: i.id, desc: i.desc, passed: i.result.passed, evidence: i.result.evidence })),
    })),
  }, null, 2));
} catch {}

// Exit code: 0 if all done up through "current target day", 1 otherwise.
// For now, exit 0 unconditionally — dashboard is informational, not a gate.
process.exit(0);
