import { assert } from "./test-utils.js";
import { CombatEventBus, CombatEventPriority } from "../../src/combat/events/CombatEventBus.js";

const bus = new CombatEventBus();
const seen:string[]=[];
bus.on("DamageApplied", e=>seen.push(`d:${e.payload}`));
bus.on("ActorDied", e=>seen.push(`x:${e.payload}`));
bus.emit("DamageApplied", CombatEventPriority.Damage, 1, "first", {correlationId:"same"});
bus.emit("ActorDied", CombatEventPriority.Death, 1, "death", {correlationId:"same"});
bus.emit("DamageApplied", CombatEventPriority.Damage, 1, "second", {correlationId:"same"});
const flushed = bus.flush();
assert.deepEqual(seen, ["x:death","d:first","d:second"]);
assert.deepEqual(flushed.map(e => e.payload), ["death", "first", "second"]);
assert.equal(bus.archive.every(e=>e.correlationId==="same"), true);
