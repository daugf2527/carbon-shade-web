import { readFileSync } from "node:fs";
import { assert } from "./test-utils.js";
import { SWORDMAN_ATK } from "../../src/data/official/dnf/swordman/attacks.js";
import { parseAtkDocument } from "../../src/dnf-native-combat/data/parsers/AtkParser.js";
import type { PvfDocument } from "../../src/dnf-native-combat/data/types/PvfDocument.js";

const raw = readFileSync("tests/fixtures/parser/atk/attack3.jsonl", "utf8")
  .split("\n")
  .find(line => line.trim().startsWith("{"));

assert.ok(raw, "attack3.atk fixture must contain a JSON line");

const document = JSON.parse(raw) as PvfDocument;

const atk = parseAtkDocument(document);
const baseline = SWORDMAN_ATK.attack3;

assert.equal(atk.kind, "atk");
assert.equal(atk.path, document.path);
assert.equal(atk.provenance.sourcePvfHash, "crc32-head:c0779278|size:205695984");
assert.equal(atk.liftUp?.value, baseline.liftUp);
assert.equal(atk.pushAside?.value, baseline.pushAside);
assert.equal(atk.damageBonus?.value, baseline.damageBonus);
assert.equal(atk.attackEnemy, baseline.attackEnemy);
assert.equal(atk.attackFriend, baseline.attackFriend);
assert.equal(atk.weaponDamageApply, baseline.weaponDamageApply);
assert.equal(atk.attackKind, baseline.attackKind);
assert.equal(atk.element, baseline.element);
assert.equal(atk.hitReaction, baseline.hitReaction);
assert.equal(atk.causesDown, baseline.causesDown);
assert.equal(atk.sections.length, 13);

console.log("parser-atk: attack3.atk sanity assertions passed");
