import { assert } from "./test-utils.js";
import { ReplayRecorder } from "../../src/combat/replay/ReplayRecorder.js";

// Import key data modules to compute content-derived hash
import { ACTIONS } from "../../src/combat/actions/FrameDataAction.js";
import { computeActionsHash } from "../../src/data/manifest/hash.js";

const actionManifestHash = computeActionsHash(ACTIONS);
console.log(`Computed action manifest hash: ${actionManifestHash}`);

// Verify combatSchemaHash is set in ReplayRecorder defaults
const recorder = new ReplayRecorder();
const currentSchemaHash = recorder.metadata.combatSchemaHash;
const currentManifestHash = recorder.metadata.manifestHash;

console.log(`Current combatSchemaHash: ${currentSchemaHash}`);
console.log(`Current manifestHash: ${currentManifestHash}`);

assert.equal(currentSchemaHash, actionManifestHash, "combatSchemaHash must match the current action manifest hash");
assert.equal(currentManifestHash, actionManifestHash, "manifestHash must match the current action manifest hash");
assert.equal(recorder.metadata.dataSources.actions, "src/combat/actions/FrameDataAction.ts#ACTIONS");
assert.equal(recorder.metadata.dataSources.status, "src/data/manifest/status/default.json#profiles");

// Also verify buildHash is set (even if hardcoded)
const buildHash = recorder.metadata.buildHash;
assert.ok(buildHash.length > 0, "buildHash must be non-empty");
console.log(`Current buildHash: ${buildHash}`);

// Verify logicFps
assert.equal(recorder.metadata.logicFps, 60, "logicFps must be 60");
