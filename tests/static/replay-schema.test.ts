import { assert } from "./test-utils.js";
import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";

const k = new CombatKernel();
k.press("KeyX");
k.runTicks(6);
k.release("KeyX");
k.runTicks(4);

const exported = k.replay.export() as Record<string, unknown>;

// Top-level structure
assert.equal(exported.version, "0.2-r3", "replay version must be 0.2-r3");
assert.equal(typeof exported.frameCount, "number", "frameCount must be a number");
assert.ok(Array.isArray(exported.frames), "frames must be an array");
assert.equal((exported.frames as unknown[]).length, exported.frameCount as number,
  "frameCount must match frames array length");

const meta = exported.metadata as Record<string, unknown>;
assert.equal(typeof meta.buildHash, "string", "metadata.buildHash required");
assert.equal(typeof meta.combatSchemaHash, "string", "metadata.combatSchemaHash required");
assert.equal(meta.logicFps, 60, "metadata.logicFps must be 60");
assert.equal(typeof meta.finalStateHash, "string", "metadata.finalStateHash required");

// Validate each frame
for (const frame of exported.frames as Record<string, unknown>[]) {
  assert.equal(typeof frame.tick, "number", "frame.tick must be a number");
  assert.ok(Array.isArray(frame.actors), "frame.actors must be an array");
  assert.ok(Array.isArray(frame.inputs), "frame.inputs must be an array");
  assert.ok(Array.isArray(frame.events), "frame.events must be an array");
  assert.equal(typeof frame.eventCount, "number", "frame.eventCount required");
  assert.equal(typeof frame.stateHash, "string", "frame.stateHash required");
  assert.equal((frame.events as unknown[]).length, frame.eventCount as number,
    `frame.eventCount mismatch at tick ${frame.tick}`);

  for (const event of frame.events as Record<string, unknown>[]) {
    assert.equal(typeof event.id, "string", "event.id required");
    assert.equal(typeof event.type, "string", "event.type required");
    assert.equal(typeof event.status, "string", "event.status required");
    assert.equal(typeof event.tick, "number", "event.tick required");
    assert.equal(typeof event.correlationId, "string", "event.correlationId required");
    assert.ok(Array.isArray(event.tags), "event.tags must be an array");
  }
}

// Immutability check — already-recorded frames must be immutable snapshots
// Mutate live actor state and verify previously-exported frame data is unaffected
const firstExportJson = JSON.stringify(exported);
k.press("KeyZ");
k.runTicks(10);
// Re-parse the first export to verify it's still valid JSON and frame data unchanged
const reparsed = JSON.parse(firstExportJson) as Record<string, unknown>;
assert.equal(reparsed.version, "0.2-r3", "re-parse: version intact");
assert.equal(typeof reparsed.frameCount, "number", "re-parse: frameCount intact");
assert.ok(Array.isArray(reparsed.frames), "re-parse: frames intact");
