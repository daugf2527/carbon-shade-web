import { assert } from "./test-utils.js";
import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";

const k = new CombatKernel();
k.requestAction(k.player, "ForceDownPlayer", "debug");
k.bus.drainAll();
assert.equal(k.player.reactionState, "downed");
assert.ok(k.bus.archive.some(e=>e.type==="DebugActionRequested" && (e.payload as {actionName?:string}).actionName==="ForceDownPlayer"));
assert.ok(k.bus.archive.some(e=>e.type==="DebugActionApplied" && (e.payload as {actionName?:string}).actionName==="ForceDownPlayer"));

const k2 = new CombatKernel({ enableReplay: true });
k2.requestAction(k2.player, "ForceDownPlayer", "debug");
k2.tick();
const frame = k2.replay.frames.at(-1);
assert.ok(frame?.events.some(e=>e.type==="DebugActionApplied"), "ReplayFrame must include debug action events");
