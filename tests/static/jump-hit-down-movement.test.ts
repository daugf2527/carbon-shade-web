import { assert } from "./test-utils.js";
import { buildEngineJumpMovementKernel, tickUntil } from "../fixtures/engineSceneHarness.js";

const { kernel, player, grunt } = buildEngineJumpMovementKernel(42);
grunt.x = player.x + 30;
grunt.z = player.z;
grunt.facing = -1;

const startZ = player.z;

player.intent = { attack: false, dir: 0, button: "jump" };
kernel.tick();
player.intent = { attack: false, dir: 0 };
for (let i = 0; i < 10; i += 1) kernel.tick();

kernel.requestAction(grunt.id, "attack1");
const hitAt = tickUntil(
  kernel,
  () =>
    kernel.bus.archive.some((event) => (
      event.type === "HitConfirmed" &&
      (event.payload as { defenderId?: string }).defenderId === player.id
    )),
  20,
);

assert.ok(hitAt > 0, "grunt attack should hit the airborne player");
assert.ok(player.hp < player.stats.hpMax, "the airborne hit should reduce player hp");

const recoveredAt = tickUntil(
  kernel,
  () => player.y === 0 && !player.airborne?.active && player.reaction === null && player.currentActionName === null,
  120,
);
assert.ok(recoveredAt > 0, "player should recover from the airborne hit and land within 120 ticks");

player.intent = { attack: false, dir: 0, zDir: 1 };
for (let i = 0; i < 10; i += 1) kernel.tick();
player.intent = { attack: false, dir: 0, zDir: 0 };
kernel.tick();

assert.ok(player.z > startZ, `player should move down after jump-hit recovery (${startZ} → ${player.z})`);
assert.equal(player.locomotion, "idle", "releasing z movement after recovery should return locomotion to idle");

console.log(`jump-hit-down-movement: hit at +${hitAt} ticks, recovered at +${recoveredAt}, z ${startZ} → ${player.z}`);
