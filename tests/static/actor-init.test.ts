/**
 * T3.3 Actor entity init from shard data
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assert } from "./test-utils.js";
import { Actor, statsFromPlayerShard, statsFromMonsterShard } from "../../src/engine/core/Actor.js";

const ROOT = process.cwd();

const swordmanShard = JSON.parse(readFileSync(join(ROOT, "verification/baseline-shards/players/swordman.json"), "utf-8"));
const goblinShard = JSON.parse(readFileSync(join(ROOT, "verification/baseline-shards/monsters/goblin.json"), "utf-8"));

const swStats = statsFromPlayerShard(swordmanShard.chr);
assert.ok(swStats.hpMax > 0, `swordman hpMax=${swStats.hpMax} should be > 0`);
assert.ok(swStats.physicalAttack > 0, `swordman physAtk=${swStats.physicalAttack} should be > 0`);

const gobStats = statsFromMonsterShard(goblinShard.mob);
assert.ok(gobStats.hpMax > 0, `goblin hpMax=${gobStats.hpMax} should be > 0`);

const sw = new Actor("swordman-1", "player", swStats);
const gob = new Actor("goblin-1", "monster", gobStats);

assert.equal(sw.hp, sw.stats.hpMax);
assert.equal(gob.hp, gob.stats.hpMax);
assert.ok(!sw.isDead);
assert.ok(!gob.isDead);

console.log(`T3.3 Actor init: swordman hp=${sw.hp}/${sw.stats.hpMax} physAtk=${sw.stats.physicalAttack} | goblin hp=${gob.hp}/${gob.stats.hpMax}`);
