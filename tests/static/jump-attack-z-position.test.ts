import { assert } from "./test-utils.js";
import { buildEngineJumpMovementKernel, tickUntil } from "../fixtures/engineSceneHarness.js";

const { kernel, player } = buildEngineJumpMovementKernel(42);
const startZ = player.z;

player.intent = { attack: false, dir: 0, button: "jump" };
kernel.tick();
player.intent = { attack: false, dir: 0 };
for (let i = 0; i < 10; i += 1) kernel.tick();

assert.ok(player.y > 0, `player should already be airborne before jumpattack (y=${player.y})`);

kernel.requestAction(player.id, "jumpattack");
kernel.tick();

assert.equal(player.currentActionName, "jumpattack", "mid-jump attack input should route into jumpattack");
assert.equal(player.z, startZ, "jumpattack should not inject a z-axis offset on entry");

const settledAt = tickUntil(
  kernel,
  () => player.y === 0 && !player.airborne?.active && player.currentActionName === null,
  120,
);

assert.ok(settledAt > 0, "jumpattack follow-up should settle back to the ground within 120 ticks");
assert.equal(player.y, 0, "player should be grounded after jumpattack settles");
assert.equal(player.airborne, null, "airborne state should clear after jumpattack landing");
assert.equal(player.z, startZ, "jumpattack settle should not leave a lingering z-axis drift");

player.intent = { attack: false, dir: 0, zDir: 1 };
for (let i = 0; i < 10; i += 1) kernel.tick();
player.intent = { attack: false, dir: 0, zDir: 0 };
kernel.tick();

assert.ok(player.z > startZ, `player should still be able to move deeper after landing (${startZ} → ${player.z})`);
assert.equal(player.locomotion, "idle", "releasing z movement after jumpattack should return locomotion to idle");

console.log(`jump-attack-z-position: settled at +${settledAt} ticks with z locked at ${startZ} before post-landing movement`);
