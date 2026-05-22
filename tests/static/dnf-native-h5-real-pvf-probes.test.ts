/**
 * Head 5 real-PVF end-to-end probes.
 *
 * Scope: end-to-end execution of scripts/pipeline.mjs against real
 * Script.pvf, exercising the EXTRACT (dnf-extract.exe) -> PARSE
 * (parseStage.ts) boundary that synthetic-input probes (h1-h4) cannot
 * reach.
 *
 * Strategy: each scenario is wrapped in try/catch and prints either
 *   "OK [label] ..."   when behaviour matches expectation,
 * or
 *   "BUG EXPOSED [label] ..."   when divergence is observed.
 *
 * Exit policy:
 *   - exits 1 if bugCount > BASELINE_BUGS (regression — new bugs introduced)
 *   - exits 1 if PROBE_STRICT=1 and any bugs are exposed
 *   - exits 0 otherwise (baseline 0 means we expect this suite to stay clean)
 *
 * CI / off-machine safety: if either tools/dnf-extract(.exe) or the
 * Script.pvf at the canonical local path is missing, the suite logs
 * "SKIP [reason]" and exits 0 without running anything destructive.
 */

export const BASELINE_BUGS = 0;

import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = process.cwd();
const PROBE_TMP = path.join(ROOT, ".tmp", "h5-probe-test");
const EXTRACT_BIN = path.join(
  ROOT,
  "tools",
  process.platform === "win32" ? "dnf-extract.exe" : "dnf-extract",
);
const PVF_PATH =
  "D:/BaiduNetdiskDownload/DNF客户端（2018年2月更新）/地下城与勇士/Script.pvf";
const PIPELINE_CLI = path.join(ROOT, "scripts", "pipeline.mjs");

let bugCount = 0;
let okCount = 0;
let skipCount = 0;

function bug(label: string, detail: string): void {
  bugCount += 1;
  console.log(`BUG EXPOSED [${label}] ${detail}`);
}
function ok(label: string, detail: string): void {
  okCount += 1;
  console.log(`OK [${label}] ${detail}`);
}
function skip(label: string, detail: string): void {
  skipCount += 1;
  console.log(`SKIP [${label}] ${detail}`);
}

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runCli(argv: string[], timeoutMs = 60000): CliResult {
  const r = spawnSync(process.execPath, [PIPELINE_CLI, ...argv], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 500 * 1024 * 1024,
  });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/* ---------------------------------------------------------------------------
 * Pre-flight (skip when assets unavailable)
 * ------------------------------------------------------------------------ */

if (!existsSync(EXTRACT_BIN)) {
  skip("preflight-extract-bin", `${EXTRACT_BIN} missing — CI machine cannot run real PVF probes`);
} else if (!existsSync(PVF_PATH)) {
  skip(
    "preflight-pvf",
    `${PVF_PATH} missing — real PVF probes skipped (gracefully)`,
  );
} else {
  await rm(PROBE_TMP, { recursive: true, force: true }).catch(() => undefined);
  await mkdir(PROBE_TMP, { recursive: true });

  /* -------------------------------------------------------------------------
   * Section 1 — Single-file extract -> parse for each of the 3 supported
   *             extensions. (Day-10 milestone trio: chr, mob, atk.)
   * ---------------------------------------------------------------------- */

  // 1a. swordman.chr — should produce 94 sections, jump power 430, weight 68000.
  {
    const debugOut = path.join(PROBE_TMP, "chr");
    const r = runCli([
      "--pvf",
      PVF_PATH,
      "--file",
      "character/swordman/swordman.chr",
      "--debug-out",
      debugOut,
    ]);
    if (r.code !== 0) {
      bug(
        "real-chr-exit",
        `expected exit 0; got ${r.code}. stderr=${JSON.stringify(r.stderr.slice(-200))}`,
      );
    } else {
      try {
        const extractRaw = await readFile(path.join(debugOut, "extract.jsonl"), "utf8");
        const parseRaw = await readFile(path.join(debugOut, "parse.jsonl"), "utf8");
        const extract = JSON.parse(extractRaw.trim());
        const parsed = JSON.parse(parseRaw.trim());
        const checks = [
          parsed.kind === "chr",
          parsed.path === "character/swordman/swordman.chr",
          // After B10 fix: parse.jsonl no longer carries sections/raw — verify
          // section count from extract.jsonl only.
          extract.sections?.length === 94,
          parsed.jumpPower?.value === 430,
          parsed.weight?.value === 68000,
          extract.source_pvf_hash === "crc32-head:c0779278|size:205695984",
          // After B10 fix: parse.jsonl should be SMALLER than extract.jsonl
          // (no embedded raw); enforce that to lock the fix in.
          parseRaw.length < extractRaw.length,
        ];
        if (checks.every(Boolean)) {
          ok(
            "real-chr",
            `kind=chr, extract.sections=94, jumpPower=430, weight=68000, hash matches, parse<extract (parse=${parseRaw.length}, extract=${extractRaw.length})`,
          );
        } else {
          bug(
            "real-chr",
            `field cross-check failed: kind=${parsed.kind}, extract.sections=${extract.sections?.length}, jumpPower=${parsed.jumpPower?.value}, weight=${parsed.weight?.value}, hash=${extract.source_pvf_hash}, parseSize=${parseRaw.length}, extractSize=${extractRaw.length}`,
          );
        }
      } catch (e) {
        bug("real-chr-readback", `could not read/parse output: ${(e as Error).message}`);
      }
    }
  }

  // 1b. goblin.mob — should produce 30 sections, kind=mob.
  {
    const debugOut = path.join(PROBE_TMP, "mob");
    const r = runCli([
      "--pvf",
      PVF_PATH,
      "--file",
      "monster/goblin/goblin.mob",
      "--debug-out",
      debugOut,
    ]);
    if (r.code !== 0) {
      bug(
        "real-mob-exit",
        `expected exit 0; got ${r.code}. stderr=${JSON.stringify(r.stderr.slice(-200))}`,
      );
    } else {
      try {
        const parsed = JSON.parse(
          (await readFile(path.join(debugOut, "parse.jsonl"), "utf8")).trim(),
        );
        const extract = JSON.parse(
          (await readFile(path.join(debugOut, "extract.jsonl"), "utf8")).trim(),
        );
        if (
          parsed.kind === "mob"
          && parsed.path === "monster/goblin/goblin.mob"
          && extract.sections.length === 30
        ) {
          ok("real-mob", `kind=mob, extract.sections=30, paths align (B10: parse.jsonl no longer carries sections)`);
        } else {
          bug(
            "real-mob",
            `cross-check failed: kind=${parsed.kind}, extract.sections=${extract.sections?.length}`,
          );
        }
      } catch (e) {
        bug("real-mob-readback", (e as Error).message);
      }
    }
  }

  // 1c. attack3.atk — should produce 13 sections, kind=atk.
  {
    const debugOut = path.join(PROBE_TMP, "atk");
    const r = runCli([
      "--pvf",
      PVF_PATH,
      "--file",
      "character/swordman/attackinfo/attack3.atk",
      "--debug-out",
      debugOut,
    ]);
    if (r.code !== 0) {
      bug(
        "real-atk-exit",
        `expected exit 0; got ${r.code}. stderr=${JSON.stringify(r.stderr.slice(-200))}`,
      );
    } else {
      try {
        const parsed = JSON.parse(
          (await readFile(path.join(debugOut, "parse.jsonl"), "utf8")).trim(),
        );
        const extract = JSON.parse(
          (await readFile(path.join(debugOut, "extract.jsonl"), "utf8")).trim(),
        );
        if (
          parsed.kind === "atk"
          && extract.sections.length === 13
        ) {
          ok("real-atk", `kind=atk, extract.sections=13 (B10: parse.jsonl no longer carries sections)`);
        } else {
          bug(
            "real-atk",
            `cross-check failed: kind=${parsed.kind}, extract=${extract.sections?.length}`,
          );
        }
      } catch (e) {
        bug("real-atk-readback", (e as Error).message);
      }
    }
  }

  /* -------------------------------------------------------------------------
   * Section 2 — Mixed multi-file extraction.
   * ---------------------------------------------------------------------- */

  // 2a. Three files in one invocation, order preserved across extract.jsonl
  //     and parse.jsonl.
  {
    const debugOut = path.join(PROBE_TMP, "mixed");
    const r = runCli([
      "--pvf",
      PVF_PATH,
      "--file",
      "character/swordman/swordman.chr",
      "--file",
      "monster/goblin/goblin.mob",
      "--file",
      "character/swordman/attackinfo/attack3.atk",
      "--debug-out",
      debugOut,
    ]);
    if (r.code !== 0) {
      bug(
        "real-mixed-exit",
        `mixed-files exit ${r.code}. stderr=${JSON.stringify(r.stderr.slice(-200))}`,
      );
    } else {
      try {
        const extractLines = (
          await readFile(path.join(debugOut, "extract.jsonl"), "utf8")
        )
          .trim()
          .split("\n");
        const parseLines = (
          await readFile(path.join(debugOut, "parse.jsonl"), "utf8")
        )
          .trim()
          .split("\n");
        const extractPaths = extractLines.map(l => JSON.parse(l).path);
        const parseKinds = parseLines.map(l => JSON.parse(l).kind);
        const expectedPaths = [
          "character/swordman/swordman.chr",
          "monster/goblin/goblin.mob",
          "character/swordman/attackinfo/attack3.atk",
        ];
        const expectedKinds = ["chr", "mob", "atk"];
        if (
          JSON.stringify(extractPaths) === JSON.stringify(expectedPaths)
          && JSON.stringify(parseKinds) === JSON.stringify(expectedKinds)
        ) {
          ok("real-mixed", `3 files extracted+parsed, order preserved`);
        } else {
          bug(
            "real-mixed",
            `order drift — extractPaths=${JSON.stringify(extractPaths)}; parseKinds=${JSON.stringify(parseKinds)}`,
          );
        }
      } catch (e) {
        bug("real-mixed-readback", (e as Error).message);
      }
    }
  }

  /* -------------------------------------------------------------------------
   * Section 3 — Negative paths: error visibility at EXTRACT/PARSE boundary.
   * ---------------------------------------------------------------------- */

  // 3a. Non-existent PVF file → loader throws "dnf-extract --pipe exited 1".
  // 3a. Non-existent PVF path → dnf-extract should fail to open the archive.
  //     After P1-6 fix: pipeline.mjs wraps the await in try/catch and prints
  //     a clean "Pipeline failed: ..." line on stderr, exits 1.
  {
    const r = runCli([
      "--pvf",
      "D:/does-not-exist-h5.pvf",
      "--file",
      "character/swordman/swordman.chr",
      "--debug-out",
      path.join(PROBE_TMP, "neg-no-pvf"),
    ]);
    if (r.code === 0) {
      bug("real-neg-no-pvf", "expected non-zero exit; got 0");
    } else if (r.stderr.includes("Pipeline failed:") && r.stderr.includes("dnf-extract --pipe exited")) {
      ok("real-neg-no-pvf", `P1-6 fix verified: friendly "Pipeline failed: ..." stderr line, exit ${r.code}`);
    } else {
      bug(
        "real-neg-no-pvf",
        `exit ${r.code} but stderr did not match the expected "Pipeline failed: ..." pattern. stderr=${JSON.stringify(r.stderr.slice(-200))}`,
      );
    }
  }

  // 3b. Non-existent file *inside* a real PVF → dnf-extract emits
  //     {"type":"error","path":"...","error":"not_found"}; loader throws on
  //     type=error. After P1-6 fix: pipeline.mjs catches it and prints
  //     a clean "Pipeline failed: ..." line, exits 1.
  {
    const r = runCli([
      "--pvf",
      PVF_PATH,
      "--file",
      "does/not/exist.chr",
      "--debug-out",
      path.join(PROBE_TMP, "neg-no-file"),
    ]);
    if (r.code === 0) {
      bug(
        "real-neg-missing-internal",
        "loader did not throw on a {type:error} document — silent pass-through is dangerous",
      );
    } else if (
      r.stderr.includes("Pipeline failed:")
      && r.stderr.includes("dnf-extract error for does/not/exist.chr")
      && r.stderr.includes("not_found")
    ) {
      ok("real-neg-missing-internal", `P1-6 fix verified: friendly "Pipeline failed: dnf-extract error for ... not_found", exit ${r.code}`);
    } else {
      bug(
        "real-neg-missing-internal",
        `unexpected stderr: ${JSON.stringify(r.stderr.slice(-300))}`,
      );
    }
  }

  // 3c. After B7 fix: .ani files are emitted by dnf-extract as type="animation",
  //     not "document"; loader now filters them out. Pipeline exits 0 with
  //     filesExtracted: 0 (loader swallows non-document types).
  {
    const r = runCli([
      "--pvf",
      PVF_PATH,
      "--file",
      "character/swordman/animation/stay.ani",
      "--debug-out",
      path.join(PROBE_TMP, "neg-ani"),
    ]);
    if (r.code === 0) {
      try {
        const summary = JSON.parse(r.stdout);
        if (summary.filesExtracted === 0 && summary.filesParsed === 0) {
          ok("real-neg-ani", "B7 fix verified: .ani filtered by loader (filesExtracted=0)");
        } else {
          bug("real-neg-ani", `expected filesExtracted=0; got ${JSON.stringify(summary)}`);
        }
      } catch {
        bug("real-neg-ani", `CLI stdout not JSON: ${r.stdout.slice(0, 200)}`);
      }
    } else {
      bug("real-neg-ani", `expected exit 0 after B7 fix; got ${r.code}, stderr=${r.stderr.slice(0, 200)}`);
    }
  }

  // 3d. After B9 fix: .skl is emitted as type="document"; loader passes it
  //     through; parsePvfDocument throws "No parser registered"; runner now
  //     captures per-doc errors and exits 0 with parseErrors[] populated.
  {
    const r = runCli([
      "--pvf",
      PVF_PATH,
      "--file",
      "creature/woodendoll/skill/skill1.skl",
      "--debug-out",
      path.join(PROBE_TMP, "neg-skl"),
    ]);
    if (r.code === 0) {
      try {
        const summary = JSON.parse(r.stdout);
        if (summary.filesExtracted === 1 && summary.filesParsed === 0) {
          ok("real-neg-skl", "B9 fix verified: .skl error captured per-doc (filesExtracted=1, filesParsed=0)");
        } else {
          bug("real-neg-skl", `expected filesExtracted=1, filesParsed=0; got ${JSON.stringify(summary)}`);
        }
      } catch {
        bug("real-neg-skl", `CLI stdout not JSON: ${r.stdout.slice(0, 200)}`);
      }
    } else {
      bug("real-neg-skl", `unexpected stderr: ${JSON.stringify(r.stderr.slice(-300))}`);
    }
  }

  /* -------------------------------------------------------------------------
   * Section 4 — Edge cases.
   * ---------------------------------------------------------------------- */

  // 4a. Empty --file value — pushed verbatim, loader filters via .filter(Boolean)
  //     on chunks, ending with 0 documents. Pipeline reports
  //     "filesExtracted":0 with exit 0; user is misled into thinking the
  //     extraction succeeded.
  {
    const r = runCli([
      "--pvf",
      PVF_PATH,
      "--file",
      "",
      "--debug-out",
      path.join(PROBE_TMP, "neg-empty"),
    ]);
    if (r.code === 0 && r.stdout.includes('"filesExtracted": 0')) {
      bug(
        "real-empty-file-arg",
        "empty --file value yields exit 0 with filesExtracted=0 and a parse.jsonl containing only a newline. Should warn or refuse empty paths.",
      );
    } else {
      ok(
        "real-empty-file-arg",
        `exit=${r.code} stdout=${JSON.stringify(r.stdout.slice(-120))}`,
      );
    }
  }

  // 4b. Backslash-separated path → PVF treats as not_found (forward-slash is
  //     the canonical separator inside PVF). Loader throws as expected.
  {
    const r = runCli([
      "--pvf",
      PVF_PATH,
      "--file",
      "character\\swordman\\swordman.chr",
      "--debug-out",
      path.join(PROBE_TMP, "neg-backslash"),
    ]);
    if (r.code === 0) {
      bug(
        "real-backslash-path",
        "backslash-separated PVF path treated as valid — likely platform leakage",
      );
    } else if (r.stderr.includes("not_found")) {
      ok(
        "real-backslash-path",
        "backslash path treated as not_found (PVF uses forward slashes internally) — correct",
      );
    } else {
      bug("real-backslash-path", `unexpected: code=${r.code} stderr=${JSON.stringify(r.stderr.slice(-200))}`);
    }
  }

  // 4c. Mid-batch parser failure: use chr + skl + mob to actually trigger B9's
  //     per-document error capture. .skl is type="document" in dnf-extract
  //     output so loader does NOT filter; parseStage throws "No parser
  //     registered" (SklParser not yet built); runner now captures the error
  //     and continues with the survivors.
  {
    const debugOut = path.join(PROBE_TMP, "neg-partial");
    const r = runCli([
      "--pvf",
      PVF_PATH,
      "--file",
      "character/swordman/swordman.chr",
      "--file",
      "creature/woodendoll/skill/skill1.skl",
      "--file",
      "monster/goblin/goblin.mob",
      "--debug-out",
      debugOut,
    ]);
    if (r.code !== 0) {
      bug("real-partial-failure", `expected exit 0 after B9 fix; got ${r.code}, stderr=${r.stderr.slice(0, 200)}`);
    } else {
      type Summary = { filesExtracted?: number; filesParsed?: number; parseErrors?: Array<{ path: string; message: string }> };
      let summary: Summary = {};
      try {
        summary = JSON.parse(r.stdout) as Summary;
      } catch {
        bug("real-partial-failure", `CLI stdout not JSON: ${r.stdout.slice(0, 200)}`);
      }
      const skl = summary.parseErrors?.find(e => e.path.endsWith(".skl"));
      if (summary.filesExtracted === 3 && summary.filesParsed === 2 && skl) {
        ok(
          "real-partial-failure",
          `B9 fix verified: chr+mob parsed, skl error captured; filesExtracted=3, filesParsed=2, parseErrors[0]=${skl.path}`,
        );
      } else {
        bug(
          "real-partial-failure",
          `expected filesExtracted=3, filesParsed=2, parseErrors containing .skl entry; got ${JSON.stringify(summary)}`,
        );
      }
    }
  }

  // 4d. Field cross-check vs fixture — extract.jsonl from real PVF should
  //     match the committed fixture (same PVF hash, same section list).
  {
    try {
      const probeChrRaw = await readFile(path.join(PROBE_TMP, "chr", "extract.jsonl"), "utf8");
      const fixChrRaw = await readFile(
        path.join(ROOT, "tests", "fixtures", "parser", "chr", "swordman.jsonl"),
        "utf8",
      );
      const probe = JSON.parse(probeChrRaw.trim());
      const fixture = JSON.parse(fixChrRaw.split("---")[0].trim());
      const probeSecNames = probe.sections.map((s: { name: string }) => s.name).sort();
      const fixSecNames = fixture.sections.map((s: { name: string }) => s.name).sort();
      const checks = [
        probe.extractor_version === fixture.extractor_version,
        probe.source_pvf_hash === fixture.source_pvf_hash,
        probe.path === fixture.path,
        probe.sections.length === fixture.sections.length,
        JSON.stringify(probeSecNames) === JSON.stringify(fixSecNames),
      ];
      if (checks.every(Boolean)) {
        ok(
          "real-fixture-parity",
          `chr extract output matches tests/fixtures/parser/chr/swordman.jsonl on extractor_version, source_pvf_hash, path, section count (${probe.sections.length}), section names`,
        );
      } else {
        bug(
          "real-fixture-parity",
          `probe vs fixture drift — version=${probe.extractor_version}/${fixture.extractor_version}; hash=${probe.source_pvf_hash}/${fixture.source_pvf_hash}; secs=${probe.sections.length}/${fixture.sections.length}`,
        );
      }
    } catch (e) {
      bug("real-fixture-parity", (e as Error).message);
    }
  }

  // 4e. After B10 fix: parse.jsonl should NOT contain raw or sections fields.
  //     Positive check that the shrink-fix is in effect.
  {
    try {
      const parseRaw = (await readFile(path.join(PROBE_TMP, "chr", "parse.jsonl"), "utf8")).trim();
      // Use precise patterns: '"raw":{' to avoid matching ChrDef.job.rawValue, '"sections":[' to avoid PvfStringFact.sectionName.
      const hasRaw = parseRaw.includes('"raw":{');
      const hasSections = parseRaw.includes('"sections":[');
      if (!hasRaw && !hasSections) {
        ok("real-parsed-no-raw-in-jsonl", "B10 fix verified: parse.jsonl has neither raw nor sections fields");
      } else {
        bug(
          "real-parsed-no-raw-in-jsonl",
          `B10 fix regressed: parse.jsonl still contains raw=${hasRaw} sections=${hasSections}`,
        );
      }
    } catch (e) {
      bug("real-parsed-no-raw-in-jsonl", (e as Error).message);
    }
  }

  /* -------------------------------------------------------------------------
   * Cleanup
   * ---------------------------------------------------------------------- */

  await rm(PROBE_TMP, { recursive: true, force: true }).catch(() => undefined);
}

console.log(
  `\ndnf-native-h5-real-pvf-probes: ${bugCount} bug(s) exposed, ${okCount} OK probe(s), ${skipCount} skip(s).`,
);

// Baseline + strict-mode exit logic. SKIPs are not bugs; only real BUG counts.
const STRICT = process.env.PROBE_STRICT === "1";
if (bugCount > BASELINE_BUGS) {
  console.error(`probe regression: bug count ${bugCount} > baseline ${BASELINE_BUGS}`);
  process.exit(1);
}
if (STRICT && bugCount > 0) {
  console.error(`PROBE_STRICT: ${bugCount} bugs exposed, expected 0`);
  process.exit(1);
}
