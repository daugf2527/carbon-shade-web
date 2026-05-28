/**
 * Four-way consistency probe: parser count
 *
 * SOT: src/dnf-native-combat/data/parsers/*.ts (filesystem)
 *
 * Strong guarantee: filesystem parser count must equal EXPECTED_TOTAL,
 * AND parseStage.ts dispatch case count must equal EXPECTED_DISPATCH.
 *
 * If you add/remove a parser:
 *   - update EXPECTED_TOTAL / EXPECTED_DISPATCH here
 *   - update CLAUDE.md "10 total: 7 via parseStage + 3 standalone"
 *   - verify parseStage.ts switch covers it OR is intentionally standalone
 *
 * 2026-05-28 created (Batch B step 3, A4 行为切 Test #1).
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { assert } from "./test-utils.js";

const ROOT = process.cwd();

// Expected counts — change these together with code/CLAUDE.md.
const EXPECTED_TOTAL = 10;       // ChrParser/MobParser/AtkParser/SklParser/AniParser/DgnParser/EtcParser/MapParser/NutExtractor/ImgParser
const EXPECTED_DISPATCH = 7;     // parseStage.ts switch cases: .chr/.mob/.atk/.skl/.dgn/.etc/.map (Ani/Nut/Img are standalone)

// ── filesystem count ────────────────────────────────────────────────────
const parserDir = join(ROOT, "src/dnf-native-combat/data/parsers");
const parserFiles = readdirSync(parserDir).filter(
  (f) =>
    /^(?:[A-Z][a-zA-Z]+)Parser\.ts$/.test(f) || // *Parser.ts
    /^NutExtractor\.ts$/.test(f),
);
assert.equal(
  parserFiles.length,
  EXPECTED_TOTAL,
  `parser count drift: filesystem ${parserFiles.length} != EXPECTED_TOTAL ${EXPECTED_TOTAL}. ` +
    `If you added/removed a parser, update EXPECTED_TOTAL here AND CLAUDE.md "10 total" AND verify parseStage.ts routes it. ` +
    `Found: ${parserFiles.join(", ")}`,
);

// ── parseStage dispatch count ───────────────────────────────────────────
const parseStageSrc = readFileSync(
  join(ROOT, "src/dnf-native-combat/data/pipeline/parseStage.ts"),
  "utf-8",
);
const caseMatches = parseStageSrc.match(/case\s+"\.[a-z]+"/g) || [];
assert.equal(
  caseMatches.length,
  EXPECTED_DISPATCH,
  `parseStage.ts dispatch drift: ${caseMatches.length} case branches != EXPECTED_DISPATCH ${EXPECTED_DISPATCH}. ` +
    `Did you add a parser without wiring its case? Or add a case without a parser file? ` +
    `Found cases: ${caseMatches.join(", ")}`,
);

// ── invariant: total = dispatch + standalone (Ani/Nut/Img = 3) ──────────
const STANDALONE_EXPECTED = 3;
assert.equal(
  EXPECTED_TOTAL - EXPECTED_DISPATCH,
  STANDALONE_EXPECTED,
  `consistency invariant: TOTAL - DISPATCH = ${EXPECTED_TOTAL - EXPECTED_DISPATCH} != STANDALONE_EXPECTED ${STANDALONE_EXPECTED}`,
);

console.log(
  `four-way-consistency-parsers: filesystem ${parserFiles.length}, dispatch ${caseMatches.length}, standalone ${STANDALONE_EXPECTED} — all aligned`,
);
