/**
 * T3.7/T3.8/T3.9 — Damage formula + reaction + HP depletion
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assert } from "./test-utils.js";
import { Actor, statsFromPlayerShard, statsFromMonsterShard } from "../../src/engine/core/Actor.js";
import { calcPhysicalDamage } from "../../src/engine/core/DamageFormula.js";
import { applyHitReaction, tickReaction } from "../../src/engine/core/ReactionResolver.js";
import { ActorState } from "../../src/engine/core/ActorStateMachine.js";

const ROOT = process.cwd();
const swShard = JSON.parse(readFileSync(join(ROOT, "verification/baseline-shards/players/swordman.json"), "utf-8"));
const gobShard = JSON.parse(readFileSync(join(ROOT, "verification/baseline-shards/monsters/goblin.json"), "utf-8"));

const sw = new Actor("sw", "player", statsFromPlayerShard(swShard.chr));
const gob = new Actor("gob", "monster", statsFromMonsterShard(gobShard.mob));

const initialHp = gob.hp;
assert.ok(initialHp > 0);

// Single hit
const dmg = calcPhysicalDamage({
  attackerPhysAtk: sw.stats.physicalAttack,
  atkBonus: 1.0,
  defenderPhysDef: gob.stats.physicalDefense,
});
assert.ok(dmg > 0, `damage=${dmg} should be > 0`);

const reaction = applyHitReaction(gob, {}, dmg, 1);
assert.ok(gob.hp < initialHp, `hp should decrease: ${gob.hp} < ${initialHp}`);
assert.equal(gob.fsm.state, ActorState.HIT);

// Tick down hitstun
while (reaction.active) tickReaction(gob, reaction, reaction.remainingTicks);
assert.equal(gob.fsm.state, ActorState.IDLE);

// Hit until dead
let tick = 100;
while (!gob.isDead && tick < 10000) {
  const d = calcPhysicalDamage({ attackerPhysAtk: sw.stats.physicalAttack, atkBonus: 1.0, defenderPhysDef: gob.stats.physicalDefense });
  const r = applyHitReaction(gob, {}, d, tick++);
  while (r.active) tickReaction(gob, r, tick++);
}

assert.ok(gob.isDead, "goblin should be dead");
assert.equal(gob.fsm.state, ActorState.DEAD);

console.log(`T3.7/T3.8/T3.9: dmg/hit=${dmg} goblin dead after tick=${tick} hp=${gob.hp}`);
