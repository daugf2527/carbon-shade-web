import { readFileSync } from "node:fs";
import { assert } from "./test-utils.js";
import { parseMobDocument } from "../../src/dnf-native-combat/data/parsers/MobParser.js";
import type { PvfDocument } from "../../src/dnf-native-combat/data/types/PvfDocument.js";

const raw = readFileSync("tests/fixtures/parser/mob/goblin.jsonl", "utf8")
  .split("\n")
  .find(line => line.trim().startsWith("{"));

assert.ok(raw, "goblin.mob fixture must contain a JSON line");

const document = JSON.parse(raw) as PvfDocument;

const mob = parseMobDocument(document);

assert.equal(mob.kind, "mob");
assert.equal(mob.path, "monster/goblin/goblin.mob");
assert.equal(mob.provenance.sourcePvfHash, "crc32-head:c0779278|size:205695984");
assert.equal(mob.name?.value, "");
assert.equal(mob.warlike?.value, 60);
assert.equal(mob.sight?.value, 300);
assert.equal(mob.weight?.value, 45000);
assert.equal(mob.hpMax, null);
assert.equal(mob.attackInfo[0]?.targetPath, "monster/goblin/attackinfo/attack1.atk");
assert.ok(mob.animationRefs.some(ref => ref.targetPath === "monster/goblin/animation_goblin2/move.ani"));
assert.deepEqual(mob.category, ["human", "goblin", "melee combat", "close-passive"]);
assert.equal(mob.sections.length, 30);

console.log("parser-mob: goblin.mob contract assertions passed");
