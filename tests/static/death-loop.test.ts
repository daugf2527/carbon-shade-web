import { assert } from "./test-utils.js";
import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";
import { CombatEventPriority } from "../../src/combat/events/CombatEventBus.js";

const k = new CombatKernel();
const g=k.actors.find(a=>a.id==="grunt")!;
g.resources.hp=1;
k.status.applyBleed(g,k.player.id,"ForceBleed",0,k.bus,1);
k.runTicks(31);
assert.equal(g.flags.dead, true);
assert.equal(k.death.cleanupBarrier.has(g.id), false, "Death cleanup barrier must close after cleanup");
const ok=k.requestAction(g,"NormalBasic1");
assert.equal(ok, false, "dead actor cannot request actions");
assert.ok(k.bus.archive.some(e=>e.type==="DeathCleanupCompleted"));

const k2 = new CombatKernel();
const g2 = k2.actors.find(a=>a.id==="grunt")!;
k2.death.kill(g2, k2.tickCount, k2.bus);
k2.bus.emit("ReactionRequested", CombatEventPriority.Reaction, k2.tickCount, {targetId:g2.id, finalReaction:"light_stagger"}, {targetActorId:g2.id});
k2.bus.drainAll();
assert.equal(k2.bus.archive.find(e=>e.type==="ActorDied")?.status, "consumed", "ActorDied must not be blocked by its own cleanup barrier");
assert.equal(k2.bus.archive.find(e=>e.type==="ReactionRequested")?.status, "blocked", "death cleanup barrier must block queued reaction events for the dead actor");
