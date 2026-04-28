import assert from 'node:assert/strict';
import { RuntimeKernel } from '../../src/runtime/combatRuntime.mjs';
const k=new RuntimeKernel();
k.actors.player.reaction='downed'; k.press('KeyC'); k.tickOnce(); assert.equal(k.actors.player.reaction,'quick_rebound'); k.release('KeyC'); k.tickOnce(); assert.equal(k.actors.player.reaction,'getting_up');
const k2=new RuntimeKernel(); k2.startHitStop(['player'],70); const hp=k2.actors.player.hp; k2.actors.player.buffs.push('frenzy'); k2.run(61); assert.equal(k2.actors.player.hp,hp);
const k3=new RuntimeKernel(); k3.applyBleed(); k3.run(31); assert.ok(k3.events.some(e=>e.type==='DamageApplied'&&e.payload.sourceKind==='status_dot'&&e.payload.reactionPolicy==='status_tick_feedback_only'));
const k4=new RuntimeKernel(); k4.upwardSlash(k4.actors.building); assert.equal(k4.actors.building.reaction,'armor_feedback_only'); assert.ok(k4.actors.building.hp<500);
const k5=new RuntimeKernel(); const s=k5.runScenario(); assert.deepEqual(Object.values(s), [true,true,true,true,true,true,true]);
console.log('runtime behavior tests passed');
