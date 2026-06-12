import { assert } from "./test-utils.js";
import { buildEngineJumpMovementKernel, tickUntil } from "../fixtures/engineSceneHarness.js";

const { kernel, player } = buildEngineJumpMovementKernel(42);
const startZ = player.z;

player.intent = { attack: false, dir: 0, button: "jump" };
kernel.tick();
player.intent = { attack: false, dir: 0 };
for (let i = 0; i < 10; i += 1) kernel.tick();

const yAtRequest = player.y;
kernel.requestAction(player.id, "jumpattack");

const zSamples: number[] = [];
const ySamples: number[] = [];
let actionActiveTicks = 0;
let actionEndedWhileAirborne = false;

for (let i = 0; i < 20; i += 1) {
  kernel.tick();
  zSamples.push(player.z);
  ySamples.push(player.y);
  if (player.currentActionName === "jumpattack") actionActiveTicks += 1;
  if (player.currentActionName === null && !!player.airborne) actionEndedWhileAirborne = true;
  if (player.y === 0 && !player.airborne?.active) break;
}

assert.ok(actionActiveTicks > 0, "jumpattack should stay active for at least one sampled tick");
assert.ok(actionEndedWhileAirborne, "airborne motion should continue after the jumpattack animation ends");
assert.ok(ySamples.some((sample) => sample > yAtRequest), "the actor should continue the airborne arc after jumpattack starts");
assert.ok(zSamples.every((sample) => sample === startZ), `sampled jumpattack ticks should keep z locked at ${startZ}`);

const settledAt = tickUntil(
  kernel,
  () => player.y === 0 && !player.airborne?.active && player.currentActionName === null,
  120,
);
assert.ok(settledAt > 0, "jumpattack detail trace should land within 120 follow-up ticks");
assert.equal(player.z, startZ, "detailed jumpattack trace should end on the original z plane");

console.log(`jump-attack-z-detailed: sampled ${zSamples.length} ticks, action active ${actionActiveTicks} ticks, landed after +${settledAt}`);
