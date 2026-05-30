/**
 * T3.6 AABB Hit Detection
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assert } from "./test-utils.js";
import { parseAniDef } from "../../src/engine/core/AnimationPlayer.js";
import { detectHit } from "../../src/engine/core/HitDetection.js";

const ROOT = process.cwd();
const swordmanShard = JSON.parse(readFileSync(join(ROOT, "verification/baseline-shards/players/swordman.json"), "utf-8"));
const goblinShard = JSON.parse(readFileSync(join(ROOT, "verification/baseline-shards/monsters/goblin.json"), "utf-8"));

// Find a swordman attack anim that has attackBoxes
const swAnims = swordmanShard.animations;
let atkBoxes: unknown[] = [];
let atkAnimName = "";
for (const [name, anim] of Object.entries(swAnims) as [string, Record<string, unknown>][]) {
  const frames = anim.frames as Array<Record<string, unknown>>;
  for (const f of frames) {
    const ab = f.attackBoxes as unknown[];
    if (ab?.length) { atkBoxes = ab; atkAnimName = name; break; }
  }
  if (atkBoxes.length) break;
}

// Find goblin idle/stand anim damageBoxes
const gobAnims = goblinShard.animations;
let dmgBoxes: unknown[] = [];
for (const anim of Object.values(gobAnims) as Record<string, unknown>[]) {
  const frames = anim.frames as Array<Record<string, unknown>>;
  for (const f of frames) {
    const db = f.damageBoxes as unknown[];
    if (db?.length) { dmgBoxes = db; break; }
  }
  if (dmgBoxes.length) break;
}

assert.ok(atkBoxes.length > 0, "no swordman attackBoxes found");
assert.ok(dmgBoxes.length > 0, "no goblin damageBoxes found");

// Place goblin at x=100 (within swordman attack range)
const hit = detectHit(
  "sw", atkBoxes as never, 0, 0, 0, 1,
  "gob", dmgBoxes as never, 100, 0, 0, -1,
);

assert.ok(hit !== null, `Expected hit at x=100 (anim=${atkAnimName})`);
console.log(`T3.6 AABB: hit=${hit !== null} anim=${atkAnimName} atkBoxes=${atkBoxes.length} dmgBoxes=${dmgBoxes.length}`);
