import { assert } from "./test-utils.js";
import { buildEngineJumpMovementKernel, tickUntil } from "../fixtures/engineSceneHarness.js";

const { kernel, player } = buildEngineJumpMovementKernel(42);
const startZ = player.z;

player.intent = { attack: false, dir: 0, button: "jump" };
kernel.tick();
player.intent = { attack: false, dir: 0 };

const landedAt = tickUntil(kernel, () => player.y === 0 && !player.airborne?.active, 120);
assert.ok(landedAt > 0, "engine jump should land within 120 ticks");
assert.equal(player.y, 0, "player should be grounded after the engine jump settles");
assert.equal(player.airborne, null, "airborne state should clear on landing");

player.intent = { attack: false, dir: 0, zDir: 1 };
for (let i = 0; i < 10; i += 1) kernel.tick();
player.intent = { attack: false, dir: 0, zDir: 0 };
kernel.tick();

assert.ok(player.z > startZ, `player should move deeper into the lane after landing (${startZ} → ${player.z})`);
assert.equal(player.locomotion, "idle", "releasing z movement should return locomotion to idle");

console.log(`jump-down-movement: landed at +${landedAt} ticks and restored z movement (${startZ} → ${player.z})`);
