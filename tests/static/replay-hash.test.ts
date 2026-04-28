import { assert } from "./test-utils.js";
import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";
import { ReplayRecorder } from "../../src/combat/replay/ReplayRecorder.js";
import { createActor } from "../../src/combat/actors/ActorFactory.js";

function runSequence(): string {
  const k = new CombatKernel();
  k.press("KeyX");
  k.runTicks(6);
  k.release("KeyX");
  k.runTicks(2);
  const last = k.replay.frames.at(-1);
  assert.ok(last?.stateHash, "Replay frames should carry a deterministic state hash");
  return last.stateHash;
}

assert.equal(runSequence(), runSequence(), "The same deterministic input sequence should produce the same final stateHash");

const recorder = new ReplayRecorder({ buildHash: "test-build", combatSchemaHash: "schema-b", logicFps: 60 });
recorder.record(1, [createActor("player", "player", "player", 260, 0)]);
const exported = recorder.export() as any;
assert.equal(exported.metadata.buildHash, "test-build");
assert.equal(exported.metadata.combatSchemaHash, "schema-b");
assert.equal(exported.metadata.logicFps, 60);
assert.equal(exported.metadata.finalStateHash, recorder.frames.at(-1)?.stateHash);
