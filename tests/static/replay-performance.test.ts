import assert from "node:assert/strict";
import { buildEngineSceneKernel } from "../fixtures/engineSceneHarness.js";

const { kernel, player } = buildEngineSceneKernel(42);
for (let i = 0; i < 8; i += 1) {
  player.intent = { attack: i % 3 === 0, dir: 0 };
  kernel.tick();
}

const replay = kernel.replay.export();
assert.equal(replay.frames.length, 8);
for (let i = 0; i < replay.frames.length; i += 1) {
  const frame = replay.frames[i]!;
  assert.equal(frame.tick, i + 1, "engine replay should append exactly one frame per tick");
  assert.equal(
    frame.eventCount <= kernel.bus.archive.length,
    true,
    "engine replay frame eventCount should stay bounded by the live engine event archive",
  );
}
