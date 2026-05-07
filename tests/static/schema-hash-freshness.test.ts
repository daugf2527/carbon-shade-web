import { assert } from "./test-utils.js";
import { ReplayRecorder } from "../../src/combat/replay/ReplayRecorder.js";

// Import key data modules to compute content-derived hash
import { ACTIONS } from "../../src/combat/actions/FrameDataAction.js";
import { computeActionsHash, computeStatusManifestHash } from "../../src/data/manifest/hash.js";
import { DEFAULT_STATUS_MANIFEST } from "../../src/data/manifest/status.js";

const actionManifestHash = computeActionsHash(ACTIONS);
const statusManifestHash = computeStatusManifestHash(DEFAULT_STATUS_MANIFEST);
console.log(`Computed action manifest hash: ${actionManifestHash}`);
console.log(`Computed status manifest hash: ${statusManifestHash}`);

// Verify combatSchemaHash is set in ReplayRecorder defaults
const recorder = new ReplayRecorder();
const currentSchemaHash = recorder.metadata.combatSchemaHash;
const currentManifestHash = recorder.metadata.manifestHash;
const currentStatusManifestHash = recorder.metadata.statusManifestHash;

console.log(`Current combatSchemaHash: ${currentSchemaHash}`);
console.log(`Current manifestHash: ${currentManifestHash}`);
console.log(`Current statusManifestHash: ${currentStatusManifestHash}`);

assert.equal(currentSchemaHash, actionManifestHash, "combatSchemaHash must match the current action manifest hash");
assert.equal(currentManifestHash, actionManifestHash, "manifestHash must match the current action manifest hash");
assert.equal(currentStatusManifestHash, statusManifestHash, "statusManifestHash must match the current status manifest hash");
assert.equal(recorder.metadata.dataSources.actions, "src/combat/actions/FrameDataAction.ts#ACTIONS");
assert.equal(recorder.metadata.dataSources.status, "src/data/manifest/status/default.json#profiles");

// Also verify buildHash is set (even if hardcoded)
const buildHash = recorder.metadata.buildHash;
assert.ok(buildHash.length > 0, "buildHash must be non-empty");
console.log(`Current buildHash: ${buildHash}`);

// Verify logicFps
assert.equal(recorder.metadata.logicFps, 60, "logicFps must be 60");
