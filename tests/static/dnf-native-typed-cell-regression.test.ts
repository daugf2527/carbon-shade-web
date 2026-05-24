/**
 * Typed-cell regression — guards against the B3 audit (C++ printLeafValue
 * always emits {t,v} for vec/mat leaves) silently breaking parsers that
 * historically asserted bare-primitive cells.
 *
 * Real PVF (2026-05-24 extraction) confirmed:
 *   - thief.chr "weapon wav" mat cells are typed: [{t:"str",v:"r_dagger"}, ...]
 *   - jungle.dgn "map specification" mat cells are typed: [{t:"int",v:1}, ...]
 *
 * Both parsers must accept typed and bare cells (parserUtils.extractLeafString /
 * extractLeafNumber). This test runs minimal typed-cell fixtures through
 * parseChrDocument / parseDgnDocument and verifies no throw + correct values.
 *
 * If a future audit reintroduces `typeof !== "string|number"` on mat cells,
 * one of the asserts below will fire and surface the regression.
 */

import { assert } from "./test-utils.js";
import { parseChrDocument } from "../../src/dnf-native-combat/data/parsers/ChrParser.js";
import { parseDgnDocument } from "../../src/dnf-native-combat/data/parsers/DgnParser.js";
import type { PvfDocument } from "../../src/dnf-native-combat/data/types/PvfDocument.js";

// ─── ChrParser typed mat (thief weapon wav) ──────────────────────────────
{
  const doc: PvfDocument = {
    extractor_version: "v2.0.0",
    extract_timestamp: "2026-05-24T13:00:00Z",
    source_pvf_hash: "test",
    path: "character/thief/thief.chr",
    type: "document",
    sections: [
      { name: "job", attributes: [{ t: "str", v: "[thief]" }] },
      { name: "body image path", attributes: [{ t: "str", v: "x" }] },
      { name: "jump power", attributes: [{ t: "int", v: 500 }] },
      { name: "jump speed", attributes: [{ t: "int", v: 100 }] },
      { name: "weight", attributes: [{ t: "int", v: 10 }] },
      {
        name: "hp max",
        attributes: [{ t: "vec", item_type: "int", items: [100, 110, 120] }],
      },
      {
        name: "physical attack",
        attributes: [{ t: "vec", item_type: "int", items: [50, 55, 60] }],
      },
      {
        name: "weapon wav",
        attributes: [
          {
            t: "mat",
            rows: 2,
            cols: 2,
            item_type: "str",
            items: [
              [{ t: "str", v: "r_dagger" }, { t: "str", v: "r_dagger_hit" }],
              [{ t: "str", v: "r_twinswd" }, { t: "str", v: "r_twinswd_hit" }],
            ],
          },
        ],
      },
    ],
  };

  const chr = parseChrDocument(doc);
  assert.equal(chr.weaponWav.length, 1, "weapon wav section parses");
  const wav = chr.weaponWav[0];
  assert.ok(wav && wav.format === "matrix", "matrix format detected");
  assert.equal(wav.entries.length, 2, "two matrix rows");
  assert.equal(wav.entries[0].swing, "r_dagger", "typed mat cell unwrap (swing)");
  assert.equal(wav.entries[0].hit, "r_dagger_hit", "typed mat cell unwrap (hit)");
  assert.equal(wav.entries[1].swing, "r_twinswd", "row 2 swing");
}

// ─── DgnParser typed mat (jungle map specification) ──────────────────────
{
  const doc: PvfDocument = {
    extractor_version: "v2.0.0",
    extract_timestamp: "2026-05-24T13:00:00Z",
    source_pvf_hash: "test",
    path: "dungeon/act3/jungle.dgn",
    type: "document",
    sections: [
      {
        name: "map specification",
        attributes: [
          {
            t: "mat",
            rows: 2,
            cols: 3,
            item_type: "int",
            items: [
              [{ t: "int", v: 1 }, { t: "int", v: 0 }, { t: "int", v: 3206 }],
              [{ t: "int", v: 2 }, { t: "int", v: 0 }, { t: "int", v: 3205 }],
            ],
          },
        ],
      },
      { name: "start map", attributes: [{ t: "int", v: 0 }] },
    ],
  };

  const dgn = parseDgnDocument(doc);
  assert.ok(dgn.mapSpecification, "map specification parses");
  assert.equal(dgn.mapSpecification.rows, 2);
  assert.equal(dgn.mapSpecification.cols, 3);
  assert.deepEqual(
    dgn.mapSpecification.items,
    [[1, 0, 3206], [2, 0, 3205]],
    "typed mat cells unwrap to bare numbers",
  );
}

// ─── Backward compat: bare cells still work ──────────────────────────────
{
  const doc: PvfDocument = {
    extractor_version: "v2.0.0",
    extract_timestamp: "2026-05-24T13:00:00Z",
    source_pvf_hash: "test",
    path: "dungeon/act3/legacy.dgn",
    type: "document",
    sections: [
      {
        name: "map specification",
        attributes: [
          {
            t: "mat",
            rows: 1,
            cols: 3,
            item_type: "int",
            items: [[1, 0, 3206]],
          },
        ],
      },
      { name: "start map", attributes: [{ t: "int", v: 0 }] },
    ],
  };

  const dgn = parseDgnDocument(doc);
  assert.deepEqual(
    dgn.mapSpecification?.items,
    [[1, 0, 3206]],
    "bare mat cells still parse (legacy fixture format)",
  );
}

console.log("dnf-native-typed-cell-regression: 3/3 passed");
