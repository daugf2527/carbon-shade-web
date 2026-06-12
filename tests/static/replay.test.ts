import { assert } from "./test-utils.js";
import { buildEngineSceneKernel, runSceneAction } from "../fixtures/engineSceneHarness.js";

const { kernel, player, grunt } = buildEngineSceneKernel(42);
runSceneAction(kernel, player, grunt, "attack1");

const replay = kernel.replay.export();
const firstFrame = replay.frames[0];
assert.ok(firstFrame, "engine replay should record at least one frame");

const before = JSON.stringify(firstFrame);
grunt.hp = 1;
assert.equal(JSON.stringify(firstFrame), before, "engine replay frames must remain immutable snapshots");

assert.equal(firstFrame.tick, 1, "engine replay should start counting at tick 1");
assert.ok(firstFrame.eventCount >= 0, "engine replay frames should expose per-frame event counts");
assert.ok(firstFrame.stateHash.length > 0, "engine replay frames should expose deterministic state hashes");
assert.ok(
  replay.frames.some((frame) => frame.eventCount > 0),
  "engine replay should capture at least one tick that flushed engine events",
);

console.log(`replay: recorded ${replay.frameCount} frames, first tick=${firstFrame.tick}, finalHash=${replay.finalStateHash}`);
