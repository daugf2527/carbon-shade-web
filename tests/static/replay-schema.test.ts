import { assert } from "./test-utils.js";
import { buildEngineSceneKernel, runSceneAction } from "../fixtures/engineSceneHarness.js";

const { kernel, player, grunt } = buildEngineSceneKernel(42);
runSceneAction(kernel, player, grunt, "attack1");

const exported = kernel.replay.export();

assert.equal(exported.version, "0.1-engine", "engine replay version must be 0.1-engine");
assert.equal(typeof exported.frameCount, "number", "frameCount must be a number");
assert.ok(Array.isArray(exported.frames), "frames must be an array");
assert.equal(
  exported.frames.length,
  exported.frameCount,
  "frameCount must match frames array length",
);

const meta = exported.metadata;
assert.equal(typeof meta.finalStateHash, "string", "metadata.finalStateHash required");
assert.equal(meta.finalStateHash, exported.finalStateHash, "metadata.finalStateHash must mirror finalStateHash");

for (const frame of exported.frames) {
  assert.equal(typeof frame.tick, "number", "frame.tick must be a number");
  assert.equal(typeof frame.eventCount, "number", "frame.eventCount required");
  assert.equal(typeof frame.stateHash, "string", "frame.stateHash required");
}

const firstExportJson = JSON.stringify(exported);
grunt.hp = 1;
const reparsed = JSON.parse(firstExportJson) as {
  version: string;
  frameCount: number;
  frames: unknown[];
};
assert.equal(reparsed.version, "0.1-engine", "re-parse: version intact");
assert.equal(typeof reparsed.frameCount, "number", "re-parse: frameCount intact");
assert.ok(Array.isArray(reparsed.frames), "re-parse: frames intact");
