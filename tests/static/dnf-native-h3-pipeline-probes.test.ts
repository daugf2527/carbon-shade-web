/**
 * Head 3 pipeline orchestration probes.
 *
 * Scope: parseStage routing, pipelineRunner orchestration, scripts/pipeline.mjs CLI.
 *
 * Strategy: try/catch every behavior we suspect is suspicious, log
 * "BUG EXPOSED: ..." when expectation diverges, "OK: ..." when nominal.
 * Exit policy:
 *   - exits 1 if bugCount > BASELINE_BUGS (regression — new bugs introduced)
 *   - exits 1 if PROBE_STRICT=1 and any bugs are exposed
 *   - exits 0 otherwise (baseline known-bug count tolerated for CI staging)
 */

export const BASELINE_BUGS = 0;

import { mkdir, mkdtemp, rm, readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

import { parsePvfDocument } from "../../src/dnf-native-combat/data/pipeline/parseStage.js";
import { runExtractParsePipeline } from "../../src/dnf-native-combat/data/pipeline/pipelineRunner.js";
import type { PvfDocument } from "../../src/dnf-native-combat/data/types/PvfDocument.js";

const ROOT = process.cwd();
const PROBE_TMP = path.join(ROOT, ".tmp", "h3-probe");
let bugCount = 0;
let okCount = 0;

function bug(label: string, detail: string): void {
  bugCount += 1;
  console.log(`BUG EXPOSED [${label}] ${detail}`);
}
function ok(label: string, detail: string): void {
  okCount += 1;
  console.log(`OK [${label}] ${detail}`);
}

/** Synthesize a minimal PvfDocument with arbitrary path + (optionally) sections. */
function makeDocument(filePath: string, sections: PvfDocument["sections"] = []): PvfDocument {
  return {
    extractor_version: "h3-probe",
    extract_timestamp: "2026-05-22T00:00:00Z",
    source_pvf_hash: "h3-fake",
    path: filePath,
    type: "document",
    sections,
  };
}

/** Minimal chr doc with the two required sections so ChrParser does not throw on missing fields. */
function makeChrDoc(filePath: string): PvfDocument {
  return makeDocument(filePath, [
    { name: "job", attributes: [{ t: "str", v: "[swordman]" }] },
    { name: "jump power", attributes: [{ t: "int", v: 530 }] },
    { name: "jump speed", attributes: [{ t: "int", v: 600 }] },
    { name: "weight", attributes: [{ t: "int", v: 100 }] },
    {
      name: "hp max",
      attributes: [{ t: "vec", length: 1, item_type: "int", items: [100] }],
    },
    {
      name: "physical attack",
      attributes: [{ t: "vec", length: 1, item_type: "int", items: [10] }],
    },
  ]);
}

/* ---------------------------------------------------------------------------
 * Section 1 — parsePvfDocument routing
 * ------------------------------------------------------------------------ */

// 1a. lowercase .atk path → routes to AtkParser → kind "atk"
try {
  const parsed = parsePvfDocument(makeDocument("character/swordman/attackinfo/x.atk"));
  if (parsed.kind === "atk") ok("parse-atk-lowercase", "routed to AtkParser");
  else bug("parse-atk-lowercase", `expected kind=atk, got ${parsed.kind}`);
} catch (e) {
  bug("parse-atk-lowercase", `threw unexpectedly: ${(e as Error).message}`);
}

// 1b. UPPERCASE .ATK path → extname is .ATK, lowercased to .atk → routes to
//     AtkParser, but AtkParser's `path.endsWith(".atk")` is case-sensitive →
//     throws "AtkParser expected .atk document".
try {
  parsePvfDocument(makeDocument("character/swordman/attackinfo/x.ATK"));
  ok("parse-atk-UPPERCASE", "did not throw — case-insensitive end-to-end");
} catch (e) {
  const msg = (e as Error).message;
  if (msg.includes("AtkParser expected .atk")) {
    bug(
      "parse-atk-UPPERCASE",
      "routing accepts .ATK (extname().toLowerCase()) but AtkParser " +
        "uses case-sensitive path.endsWith('.atk') → mismatch causes throw: " +
        msg,
    );
  } else {
    bug("parse-atk-UPPERCASE", `unexpected throw: ${msg}`);
  }
}

// 1c. UPPERCASE .CHR — same routing/parser case mismatch.
try {
  parsePvfDocument(makeChrDoc("character/swordman/swordman.CHR"));
  ok("parse-chr-UPPERCASE", "did not throw");
} catch (e) {
  const msg = (e as Error).message;
  if (msg.includes("ChrParser expected .chr")) {
    bug(
      "parse-chr-UPPERCASE",
      "routing accepts .CHR but ChrParser case-sensitively requires .chr → " +
        msg,
    );
  } else {
    bug("parse-chr-UPPERCASE", `unexpected throw: ${msg}`);
  }
}

// 1d. UPPERCASE .MOB
try {
  parsePvfDocument(makeDocument("monster/x.MOB"));
  ok("parse-mob-UPPERCASE", "did not throw");
} catch (e) {
  const msg = (e as Error).message;
  if (msg.includes("MobParser expected .mob")) {
    bug(
      "parse-mob-UPPERCASE",
      "routing accepts .MOB but MobParser case-sensitively requires .mob → " +
        msg,
    );
  } else {
    bug("parse-mob-UPPERCASE", `unexpected throw: ${msg}`);
  }
}

// 1e. Mixed case .Atk
try {
  parsePvfDocument(makeDocument("x.Atk"));
  ok("parse-atk-MixedCase", "did not throw");
} catch (e) {
  const msg = (e as Error).message;
  if (msg.includes("AtkParser expected .atk")) {
    bug("parse-atk-MixedCase", `routing/parser case mismatch: ${msg}`);
  } else {
    bug("parse-atk-MixedCase", `unexpected throw: ${msg}`);
  }
}

// 1f. Path with no extension → default branch → "No parser registered for ..."
try {
  parsePvfDocument(makeDocument("swordman"));
  bug("parse-no-extension", "expected throw, got success");
} catch (e) {
  const msg = (e as Error).message;
  if (msg === "No parser registered for swordman") {
    ok("parse-no-extension", "got expected unregistered-parser error");
  } else {
    bug("parse-no-extension", `wrong error message: ${msg}`);
  }
}

// 1g. Empty path → default branch, error message has empty path
try {
  parsePvfDocument(makeDocument(""));
  bug("parse-empty-path", "expected throw, got success");
} catch (e) {
  const msg = (e as Error).message;
  if (msg === "No parser registered for ") {
    ok("parse-empty-path", "error message includes empty path (cosmetic — trailing space)");
  } else {
    bug("parse-empty-path", `wrong error message: ${msg}`);
  }
}

// 1h. Multi-dot path — extname returns last segment only.
try {
  const parsed = parsePvfDocument(makeDocument("swordman.v2.atk"));
  if (parsed.kind === "atk" && parsed.path === "swordman.v2.atk") {
    ok("parse-multi-dot", "extname returns last .atk, routes correctly");
  } else {
    bug("parse-multi-dot", `unexpected kind/path: ${parsed.kind}/${parsed.path}`);
  }
} catch (e) {
  bug("parse-multi-dot", `threw: ${(e as Error).message}`);
}

// 1i. Hidden-file-style path ".chr" — after fix, parseStage's routing checks
//     basename for ".chr"/".mob"/".atk" when extname returns "". This handles
//     the surprising hidden-file convention that path.extname applies to dot-
//     prefixed bare basenames.
try {
  parsePvfDocument(makeChrDoc(".chr"));
  ok("parse-dotfile-ext-only", "basename-fallback routes .chr to ChrParser");
} catch (e) {
  const msg = (e as Error).message;
  bug(
    "parse-dotfile-ext-only",
    `expected ChrParser to accept basename '.chr' via dotfile fallback; threw: ${msg}`,
  );
}

// 1j. Unsupported extension .ani — error includes path? Verify.
try {
  parsePvfDocument(makeDocument("anim/x.ani"));
  bug("parse-ani-unsupported", "expected throw");
} catch (e) {
  const msg = (e as Error).message;
  if (msg.includes("anim/x.ani")) {
    ok("parse-ani-unsupported", "error includes path as required");
  } else {
    bug(
      "parse-ani-unsupported",
      `error missing path context, only says: ${msg}`,
    );
  }
}

// 1k. SklParser dispatch — .skl is now wired into parseStage (2026-05-23).
// A minimal synthetic .skl Document should route to parseSklDocument without
// throwing. SklParser only requires presence of standard sections; an empty
// sections array yields a SkillDef with all optional fields null. The probe
// verifies the dispatch path, not deep .skl semantics (those live in h6).
try {
  const result = parsePvfDocument(makeDocument("character/swordman/swordman.skl"));
  if (result && (result as { kind?: string }).kind === "skl") {
    ok("parse-skl-supported", "routed to SklParser (kind=skl)");
  } else {
    bug("parse-skl-supported", `expected kind=skl, got ${JSON.stringify(result).slice(0, 80)}`);
  }
} catch (e) {
  bug("parse-skl-supported", `unexpected throw: ${(e as Error).message}`);
}

// 1l. Trailing dot path "foo." → extname returns "." → not a registered ext
try {
  parsePvfDocument(makeDocument("foo."));
  bug("parse-trailing-dot", "expected throw");
} catch (e) {
  const msg = (e as Error).message;
  if (msg === "No parser registered for foo.") {
    ok("parse-trailing-dot", "trailing dot rejected with path-included error");
  } else {
    bug("parse-trailing-dot", `unexpected error: ${msg}`);
  }
}

/* ---------------------------------------------------------------------------
 * Section 2 — runExtractParsePipeline orchestration
 * ------------------------------------------------------------------------ */

await rm(PROBE_TMP, { recursive: true, force: true }).catch(() => undefined);
await mkdir(PROBE_TMP, { recursive: true });

// 2a. Empty files array → result {0,0}; two empty files still written.
try {
  const debugOut = path.join(PROBE_TMP, "empty");
  const result = await runExtractParsePipeline({
    pvfPath: "fixture.pvf",
    files: [],
    debugOut,
    loadDocuments: async () => [],
  });
  if (result.filesExtracted !== 0 || result.filesParsed !== 0) {
    bug("runner-empty-array", `expected 0/0, got ${result.filesExtracted}/${result.filesParsed}`);
  } else {
    // Check that empty-array writes still wrote a file containing only "\n"
    const extract = await readFile(path.join(debugOut, "extract.jsonl"), "utf8");
    const parse = await readFile(path.join(debugOut, "parse.jsonl"), "utf8");
    if (extract === "\n" && parse === "\n") {
      bug(
        "runner-empty-array",
        "with files=[] runner still writes two .jsonl files containing only a newline. " +
          "Wasted I/O — guard with `if (documents.length)` or skip the write entirely.",
      );
    } else {
      ok(
        "runner-empty-array",
        `empty-array writes produced extract="${JSON.stringify(extract)}" parse="${JSON.stringify(parse)}"`,
      );
    }
  }
} catch (e) {
  bug("runner-empty-array", `threw: ${(e as Error).message}`);
}

// 2b. Mixed-kind documents (chr+mob+atk) → parsed[i].kind matches per index.
try {
  const docs: PvfDocument[] = [
    makeChrDoc("character/swordman/swordman.chr"),
    makeDocument("monster/foo.mob", [
      { name: "hp max", attributes: [{ t: "vec", length: 1, item_type: "int", items: [100] }] },
    ]),
    makeDocument("character/swordman/attackinfo/x.atk", [
      { name: "lift up", attributes: [{ t: "int", v: 300 }] },
    ]),
  ];
  const debugOut = path.join(PROBE_TMP, "mixed");
  const result = await runExtractParsePipeline({
    pvfPath: "fixture.pvf",
    files: docs.map(d => d.path),
    debugOut,
    loadDocuments: async () => docs,
  });
  const kinds = result.parsed.map(p => p.kind).join(",");
  if (kinds === "chr,mob,atk") {
    ok("runner-mixed-kinds", `parsed kinds = ${kinds}`);
  } else {
    bug("runner-mixed-kinds", `expected chr,mob,atk; got ${kinds}`);
  }
} catch (e) {
  bug("runner-mixed-kinds", `threw: ${(e as Error).message}`);
}

// 2c. Partial-failure semantics: middle document has unsupported extension →
//     pipelineRunner catches per-document parse errors instead of aborting
//     the whole batch (B9 fix). Result: filesExtracted=3, filesParsed=2,
//     parseErrors[0] = unsupported-ani entry. Caller can see exactly which
//     file failed without retrying one-by-one.
try {
  const docs: PvfDocument[] = [
    makeDocument("character/swordman/attackinfo/ok1.atk", []),
    makeDocument("anim/bad.ani", []), // unsupported ext → captured, not thrown
    makeDocument("character/swordman/attackinfo/ok2.atk", []),
  ];
  const debugOut = path.join(PROBE_TMP, "partial");
  const result = await runExtractParsePipeline({
    pvfPath: "fixture.pvf",
    files: docs.map(d => d.path),
    debugOut,
    loadDocuments: async () => docs,
  });
  const aniError = result.parseErrors.find(e => e.path === "anim/bad.ani");
  if (
    result.filesExtracted === 3 &&
    result.filesParsed === 2 &&
    result.parseErrors.length === 1 &&
    aniError !== undefined &&
    /No parser registered/.test(aniError.message)
  ) {
    ok(
      "runner-partial-failure",
      `per-doc try/catch captured anim/bad.ani as parseErrors[0]; extracted=${result.filesExtracted} parsed=${result.filesParsed}`,
    );
  } else {
    bug(
      "runner-partial-failure",
      `expected partial success (2 parsed + 1 error), got extracted=${result.filesExtracted} parsed=${result.filesParsed} errors=${JSON.stringify(result.parseErrors)}`,
    );
  }
  // Side-effect probe: debug-out files SHOULD now exist (runner writes all
  // three jsonl files after the per-doc capture loop).
  try {
    const probeStat = await stat(path.join(PROBE_TMP, "partial", "extract.jsonl"));
    ok(
      "runner-partial-side-effect",
      `extract.jsonl written (size=${probeStat.size}) — partial-failure path no longer leaks "phantom dir without files"`,
    );
  } catch (statErr) {
    bug(
      "runner-partial-side-effect",
      `expected debug-out files to exist after partial-failure run; stat threw: ${(statErr as Error).message}`,
    );
  }
} catch (e) {
  bug(
    "runner-partial-failure",
    `expected no throw (per-doc errors captured into parseErrors); got: ${(e as Error).message}`,
  );
}

// 2d. debugOut with non-ASCII path (Chinese chars in directory name).
try {
  const debugOut = path.join(PROBE_TMP, "中文测试");
  const docs: PvfDocument[] = [
    makeDocument("character/swordman/attackinfo/x.atk", []),
  ];
  const result = await runExtractParsePipeline({
    pvfPath: "fixture.pvf",
    files: docs.map(d => d.path),
    debugOut,
    loadDocuments: async () => docs,
  });
  if (result.debugOut === debugOut) {
    ok("runner-utf8-path", `wrote to ${debugOut}`);
  } else {
    bug("runner-utf8-path", `result.debugOut=${result.debugOut} expected ${debugOut}`);
  }
} catch (e) {
  bug("runner-utf8-path", `UTF-8 path failed: ${(e as Error).message}`);
}

// 2e. loadDocuments throws → uncaught propagation (no wrapping, no debug-out write).
try {
  const debugOut = path.join(PROBE_TMP, "loader-throws");
  await runExtractParsePipeline({
    pvfPath: "fixture.pvf",
    files: ["any"],
    debugOut,
    loadDocuments: async () => {
      throw new Error("synthetic loader failure");
    },
  });
  bug("runner-loader-throws", "expected throw");
} catch (e) {
  const msg = (e as Error).message;
  if (msg.includes("synthetic loader failure")) {
    ok("runner-loader-throws", "loader error propagates verbatim (no extra context added)");
  } else {
    bug("runner-loader-throws", `wrong error: ${msg}`);
  }
  // Check: was debugOut directory created? It shouldn't be — error was before mkdir.
  try {
    await stat(path.join(PROBE_TMP, "loader-throws"));
    bug(
      "runner-loader-side-effect",
      "debug-out directory was created even though loader failed",
    );
  } catch {
    ok("runner-loader-side-effect", "no debug-out directory left behind");
  }
}

// 2f. Parser-only failure during for-loop: per-doc try/catch captures the
//     unsupported-extension error and the pipeline still completes with
//     parseErrors[0] populated and debug-out files written.
try {
  const debugOut = path.join(PROBE_TMP, "parse-fail-no-mkdir");
  const docs: PvfDocument[] = [makeDocument("foo.ani", [])];
  const result = await runExtractParsePipeline({
    pvfPath: "fixture.pvf",
    files: ["foo.ani"],
    debugOut,
    loadDocuments: async () => docs,
  });
  if (
    result.filesExtracted === 1 &&
    result.filesParsed === 0 &&
    result.parseErrors.length === 1 &&
    result.parseErrors[0].path === "foo.ani"
  ) {
    ok(
      "runner-parse-fail-order",
      `single-doc parse failure captured as parseErrors[0]; debug-out at ${debugOut}`,
    );
  } else {
    bug(
      "runner-parse-fail-order",
      `expected 1 extracted + 0 parsed + 1 error; got ${JSON.stringify(result)}`,
    );
  }
} catch (e) {
  bug(
    "runner-parse-fail-order",
    `expected no throw (per-doc errors captured); got: ${(e as Error).message}`,
  );
}

// 2g. Large-array memory concern: documents.map(JSON.stringify).join("\n") builds
//     one huge string in RAM before writing. Probe with 5000 small docs to verify
//     it doesn't fail but note the design concern.
try {
  const N = 5000;
  const docs: PvfDocument[] = Array.from({ length: N }, (_, i) =>
    makeDocument(`character/swordman/attackinfo/x${i}.atk`, []),
  );
  const debugOut = path.join(PROBE_TMP, "large");
  const result = await runExtractParsePipeline({
    pvfPath: "fixture.pvf",
    files: docs.map(d => d.path),
    debugOut,
    loadDocuments: async () => docs,
  });
  if (result.filesParsed === N) {
    ok(
      "runner-large-array",
      `${N} docs joined into single string and written; works but " +
        "scaled-up extracts (370k PVF files) would blow memory. Recommend " +
        "stream-write per-document.`,
    );
  } else {
    bug("runner-large-array", `expected ${N} parsed, got ${result.filesParsed}`);
  }
} catch (e) {
  bug("runner-large-array", `threw: ${(e as Error).message}`);
}

/* ---------------------------------------------------------------------------
 * Section 3 — scripts/pipeline.mjs CLI surface
 *
 * IMPORTANT: never pass a real --pvf path (Head 5 owns that). All probes
 * here exit BEFORE the compile/import step on line 36 of pipeline.mjs.
 * ------------------------------------------------------------------------ */

const CLI = path.join(ROOT, "scripts", "pipeline.mjs");

function runCli(argv: string[]): { code: number; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [CLI, ...argv], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 15000,
  });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

// 3a. No args → exits 2 with usage.
{
  const r = runCli([]);
  if (r.code === 2 && r.stderr.includes("Usage:")) {
    ok("cli-no-args", "exits 2 with Usage:");
  } else {
    bug("cli-no-args", `exit=${r.code} stderr=${JSON.stringify(r.stderr)}`);
  }
}

// 3b. Only --pvf, no --file → exits 2.
{
  const r = runCli(["--pvf", "foo.pvf"]);
  if (r.code === 2 && r.stderr.includes("Usage:")) {
    ok("cli-pvf-no-files", "exits 2 when --file is missing");
  } else {
    bug("cli-pvf-no-files", `exit=${r.code} stderr=${JSON.stringify(r.stderr)}`);
  }
}

// 3c. Bad --stop-at value 'extract' → exits 2 with explicit message.
{
  const r = runCli(["--pvf", "foo.pvf", "--file", "x.atk", "--stop-at", "extract"]);
  if (r.code === 2 && r.stderr.includes("Unsupported --stop-at extract")) {
    ok("cli-stopAt-extract", "exits 2 with named-stage rejection");
  } else {
    bug(
      "cli-stopAt-extract",
      `exit=${r.code} stderr=${JSON.stringify(r.stderr)} — message doesn't tell user which stages are valid`,
    );
  }
}

// 3d. --stop-at load → exits 2.
{
  const r = runCli(["--pvf", "foo.pvf", "--file", "x.atk", "--stop-at", "load"]);
  if (r.code === 2 && r.stderr.includes("Unsupported --stop-at load")) {
    ok("cli-stopAt-load", "exits 2 (correct)");
  } else {
    bug("cli-stopAt-load", `exit=${r.code} stderr=${JSON.stringify(r.stderr)}`);
  }
}

// 3e. --help flag — after fix the CLI prints help to stdout and exits 0.
{
  const r = runCli(["--help"]);
  if (r.code === 0 && r.stdout.includes("Usage:")) {
    ok("cli-help", "exits 0 with help on stdout");
  } else if (r.code === 2 && r.stderr.includes("Usage:")) {
    bug(
      "cli-help",
      "no dedicated --help handler; --help silently falls through to the " +
        "missing-args branch and prints Usage with exit code 2. Should " +
        "print help to stdout and exit 0.",
    );
  } else {
    bug("cli-help", `unexpected: exit=${r.code} stdout=${JSON.stringify(r.stdout.slice(0, 80))} stderr=${JSON.stringify(r.stderr.slice(0, 80))}`);
  }
}

// 3f. Unknown flag — after fix parseArgs collects "Unknown flag: ..." into
//     args.errors and the script exits 2 with that message in stderr.
{
  const r = runCli([
    "--pvf",
    "foo.pvf",
    "--file",
    "x.atk",
    "--debugout",
    "/tmp/typo",
    "--stop-at",
    "extract",
  ]);
  if (r.code === 2 && r.stderr.includes("Unknown flag: --debugout")) {
    ok("cli-unknown-flag", "typo'd --debugout rejected with Unknown flag error");
  } else if (r.code === 2 && r.stderr.includes("Unsupported --stop-at extract")) {
    bug(
      "cli-unknown-flag",
      "typo'd --debugout (vs --debug-out) is silently swallowed by parseArgs; " +
        "no warning. Same for any unrecognised flag. Add an else branch that " +
        "warns or rejects unknown options.",
    );
  } else {
    bug("cli-unknown-flag", `exit=${r.code} stderr=${JSON.stringify(r.stderr.slice(0, 120))}`);
  }
}

// 3g. --pattern guard: after fix, consumeValue rejects the next argv element
//     when it starts with `--`, so `--pattern --pvf foo.pvf` errors instead of
//     silently eating `--pvf`.
{
  const r = runCli([
    "--pattern",
    "--pvf",
    "foo.pvf",
    "--file",
    "x.atk",
  ]);
  if (r.code === 2 && /--pattern requires a value, got next flag --pvf/.test(r.stderr)) {
    ok("cli-pattern-guard", "--pattern refuses to swallow a sibling flag");
  } else if (r.code === 2 && r.stderr.includes("Usage:") && !r.stderr.includes("--pattern requires")) {
    bug(
      "cli-pattern-eats-next-flag",
      "--pattern still blindly consumes the next argv element including " +
        "the next flag.",
    );
  } else {
    bug(
      "cli-pattern-guard",
      `unexpected: exit=${r.code} stderr=${JSON.stringify(r.stderr.slice(0, 200))}`,
    );
  }
}

// 3h. Verify binary-name selection picks dnf-extract.exe on win32.
{
  const expectedName = process.platform === "win32" ? "dnf-extract.exe" : "dnf-extract";
  const expectedPath = path.join(ROOT, "tools", expectedName);
  try {
    await stat(expectedPath);
    ok("cli-binary-path", `tools/${expectedName} exists on platform ${process.platform}`);
  } catch {
    bug(
      "cli-binary-path",
      `tools/${expectedName} not found at ${expectedPath} — script will fail when running the real pipeline`,
    );
  }
}

/* ---------------------------------------------------------------------------
 * Cleanup
 * ------------------------------------------------------------------------ */

await rm(PROBE_TMP, { recursive: true, force: true }).catch(() => undefined);

console.log(`\ndnf-native-h3-pipeline-probes: ${bugCount} bug(s) exposed, ${okCount} OK probe(s).`);

// Baseline + strict-mode exit logic.
const STRICT = process.env.PROBE_STRICT === "1";
if (bugCount > BASELINE_BUGS) {
  console.error(`probe regression: bug count ${bugCount} > baseline ${BASELINE_BUGS}`);
  process.exit(1);
}
if (STRICT && bugCount > 0) {
  console.error(`PROBE_STRICT: ${bugCount} bugs exposed, expected 0`);
  process.exit(1);
}
