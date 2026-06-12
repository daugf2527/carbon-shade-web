import { assert } from "./test-utils.js";
import { buildEngineSceneKernel, runSceneAction } from "../fixtures/engineSceneHarness.js";
import { EngineKernel } from "../../src/engine/kernel/EngineKernel.js";
import { ActionSystem } from "../../src/engine/kernel/systems/ActionSystem.js";
import { AnimationSystem } from "../../src/engine/kernel/systems/AnimationSystem.js";

function runSequence(seed = 42): string {
  const { kernel, player, grunt } = buildEngineSceneKernel(seed);
  runSceneAction(kernel, player, grunt, "attack1");
  const replay = kernel.replay.export();
  const last = replay.frames.at(-1);
  assert.ok(last?.stateHash, "engine replay frames should carry deterministic state hashes");
  return replay.finalStateHash;
}

assert.equal(runSequence(), runSequence(), "the same engine action sequence should produce the same finalStateHash");
assert.notEqual(runSequence(42), runSequence(99), "different seeds should diverge in engine replay finalStateHash");

const emptyKernel = new EngineKernel(7);
emptyKernel.registerSystem(new ActionSystem());
emptyKernel.registerSystem(new AnimationSystem());
const exported = emptyKernel.replay.export();
assert.equal(exported.version, "0.1-engine");
assert.equal(exported.frameCount, 0, "empty engine kernel should export an empty replay");
assert.equal(exported.metadata.finalStateHash, "", "empty engine replay should mirror the empty final state hash");
