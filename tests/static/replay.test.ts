import { assert } from "./test-utils.js";
import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";
const k = new CombatKernel(); k.press("KeyX"); k.tick(); const frame = k.replay.frames[0]; assert.ok(frame); const before = JSON.stringify(frame); k.player.resources.hp = 1; assert.equal(JSON.stringify(frame), before, "Replay frames must be immutable snapshots");
assert.ok(Array.isArray(frame.inputs), "ReplayFrame must include input snapshots");
assert.ok(frame.inputs.some(input => input.pressed.includes("KeyX")), "ReplayFrame must record pressed inputs");
assert.ok(Array.isArray(frame.events), "ReplayFrame must include event snapshots");
assert.ok(frame.events.some(event => event.type === "RawInputCollected"), "ReplayFrame must record event types, not only event counts");
