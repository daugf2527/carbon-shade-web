import { readFileSync } from "node:fs";
import { assert } from "./test-utils.js";
import {
  SWORDMAN_CHR_ATTACK_INFO_REFS,
  SWORDMAN_CHR_GROWTH,
  SWORDMAN_CHR_SCALAR,
  SWORDMAN_CHR_WEAPON_HIT_INFO,
} from "../../src/data/official/dnf/swordman/chr.js";
import { parseChrDocument } from "../../src/dnf-native-combat/data/parsers/ChrParser.js";
import type { PvfDocument } from "../../src/dnf-native-combat/data/types/PvfDocument.js";

const raw = readFileSync("tests/fixtures/parser/chr/swordman.jsonl", "utf8")
  .split("\n")
  .find(line => line.trim().startsWith("{"));

assert.ok(raw, "swordman.chr fixture must contain a JSON line");

const document = JSON.parse(raw) as PvfDocument;
const chr = parseChrDocument(document);

assert.equal(chr.kind, "chr");
assert.equal(chr.path, "character/swordman/swordman.chr");
assert.equal(chr.provenance.extractorVersion, "v2.0.0");
assert.equal(chr.provenance.sourcePvfHash, "crc32-head:c0779278|size:205695984");

assert.equal(chr.job.value, SWORDMAN_CHR_SCALAR.job);
assert.equal(chr.job.rawValue, "[swordman]");
assert.equal(chr.jumpPower.value, SWORDMAN_CHR_SCALAR.jumpPower.value);
assert.equal(chr.jumpSpeed.value, SWORDMAN_CHR_SCALAR.jumpSpeed.value);
assert.equal(chr.weight.value, SWORDMAN_CHR_SCALAR.weight.value);

assert.equal(chr.growth.hpMax.values[0], SWORDMAN_CHR_GROWTH.hpMax.values[0]);
assert.equal(chr.growth.physicalAttack.values[0], SWORDMAN_CHR_GROWTH.physicalAttack.values[0]);

assert.deepEqual(
  {
    hitTag: chr.weaponHitInfo[0]?.hitTag,
    bloodTag: chr.weaponHitInfo[0]?.bloodTag,
    damageScalePct: chr.weaponHitInfo[0]?.damageScalePct,
    critOrSimilar: chr.weaponHitInfo[0]?.critOrSimilar,
    pushBack: chr.weaponHitInfo[0]?.pushBack,
    launch: chr.weaponHitInfo[0]?.launch,
  },
  {
    hitTag: SWORDMAN_CHR_WEAPON_HIT_INFO[0]?.hitTag,
    bloodTag: SWORDMAN_CHR_WEAPON_HIT_INFO[0]?.bloodTag,
    damageScalePct: SWORDMAN_CHR_WEAPON_HIT_INFO[0]?.damageScalePct,
    critOrSimilar: SWORDMAN_CHR_WEAPON_HIT_INFO[0]?.critOrSimilar,
    pushBack: SWORDMAN_CHR_WEAPON_HIT_INFO[0]?.pushBack,
    launch: SWORDMAN_CHR_WEAPON_HIT_INFO[0]?.launch,
  },
);

assert.equal(chr.attackInfo.attackBase[2]?.targetPath, `character/swordman/${SWORDMAN_CHR_ATTACK_INFO_REFS.attackBase[2]}`);
assert.ok(chr.sections.length > 40, "ChrDef must retain the raw PVF section list for SQLite/runtime audit");

console.log("parser-chr: swordman.chr sanity assertions passed");
