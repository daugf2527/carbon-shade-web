import { assert } from "./test-utils.js";
import { buildEngineJumpMovementKernel, tickUntil } from "../fixtures/engineSceneHarness.js";

const { kernel, player, grunt } = buildEngineJumpMovementKernel(42);
grunt.x = player.x + 30;
grunt.z = player.z;
grunt.facing = -1;

const startZ = player.z;
const startHp = grunt.hp;

player.intent = { attack: false, dir: 0, button: "jump" };
kernel.tick();
player.intent = { attack: false, dir: 0 };
for (let i = 0; i < 10; i += 1) kernel.tick();

kernel.requestAction(player.id, "jumpattack");

const hitAt = tickUntil(
  kernel,
  () =>
    kernel.bus.archive.some((event) => (
      event.type === "HitConfirmed" &&
      (event.payload as { attackerId?: string; defenderId?: string }).attackerId === player.id &&
      (event.payload as { attackerId?: string; defenderId?: string }).defenderId === grunt.id
    )),
  20,
);

assert.ok(hitAt > 0, "jumpattack should connect with the grounded grunt");
assert.ok(grunt.hp < startHp, `jumpattack hit should reduce grunt hp (${startHp} → ${grunt.hp})`);
assert.equal(player.z, startZ, "landing the jumpattack should not recoil the player along z");

const hitEvents = kernel.bus.archive.filter((event) => (
  event.type === "HitConfirmed" &&
  (event.payload as { attackerId?: string; defenderId?: string }).attackerId === player.id &&
  (event.payload as { attackerId?: string; defenderId?: string }).defenderId === grunt.id
));
assert.equal(hitEvents.length, 1, "jumpattack should emit exactly one hit-confirmed event against the grunt");

const settledAt = tickUntil(
  kernel,
  () => player.y === 0 && !player.airborne?.active && player.currentActionName === null,
  120,
);
assert.ok(settledAt > 0, "player should still settle back to the ground after the jumpattack hit");
assert.equal(player.z, startZ, "post-hit settle should preserve the original z plane");

player.intent = { attack: false, dir: 0, zDir: 1 };
for (let i = 0; i < 10; i += 1) kernel.tick();
player.intent = { attack: false, dir: 0, zDir: 0 };
kernel.tick();

assert.ok(player.z > startZ, `player should recover normal depth movement after the hit (${startZ} → ${player.z})`);
assert.equal(player.locomotion, "idle", "releasing z movement after the hit should return locomotion to idle");

console.log(`jump-attack-hit-recoil: hit at +${hitAt} ticks, settled at +${settledAt}, grunt hp ${startHp}→${grunt.hp}`);
