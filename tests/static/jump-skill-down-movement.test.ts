import { assert } from "./test-utils.js";
import { buildEngineJumpMovementKernel, tickUntil } from "../fixtures/engineSceneHarness.js";

const { kernel, player } = buildEngineJumpMovementKernel(42);
const startZ = player.z;

player.intent = { attack: false, dir: 0, button: "jump" };
kernel.tick();
player.intent = { attack: false, dir: 0 };
for (let i = 0; i < 10; i += 1) kernel.tick();

// Legacy CombatKernel collapsed the mid-jump skill hotkey path into jumpattack.
kernel.requestAction(player.id, "jumpattack");
kernel.tick();
assert.equal(player.currentActionName, "jumpattack", "mid-jump action request should enter jumpattack");

const settledAt = tickUntil(
  kernel,
  () => player.y === 0 && !player.airborne?.active && player.currentActionName === null,
  120,
);
assert.ok(settledAt > 0, "jumpattack follow-up should settle back to the ground within 120 ticks");

player.intent = { attack: false, dir: 0, zDir: 1 };
for (let i = 0; i < 10; i += 1) kernel.tick();
player.intent = { attack: false, dir: 0, zDir: 0 };
kernel.tick();

assert.ok(player.z > startZ, `player should move down after the jumpattack follow-up (${startZ} → ${player.z})`);
assert.equal(player.locomotion, "idle", "releasing z movement after jumpattack should return locomotion to idle");

console.log(`jump-skill-down-movement: jumpattack settled at +${settledAt} ticks and restored z movement (${startZ} → ${player.z})`);
