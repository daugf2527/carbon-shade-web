import { assert } from "./test-utils.js";
import { ReplayRecorder } from "../../src/combat/replay/ReplayRecorder.js";

import { computeActionsHash, computeDamageManifestHash, computeEnemyManifestHash, computeStatusManifestHash, type DamageManifest } from "../../src/data/manifest/hash.js";
import classicDamageProfile from "../../src/data/manifest/damage/classic-profile.json" with { type: "json" };
import { loadActionsManifest } from "../../src/data/manifest/loader.js";
import { DEFAULT_ENEMY_MANIFEST } from "../../src/data/manifest/ai.js";
import { DEFAULT_STATUS_MANIFEST } from "../../src/data/manifest/status.js";

const actionsManifest = await loadActionsManifest();
const actionManifestHash = computeActionsHash(actionsManifest);
const statusManifestHash = computeStatusManifestHash(DEFAULT_STATUS_MANIFEST);
const enemyManifestHash = computeEnemyManifestHash(DEFAULT_ENEMY_MANIFEST);
const damageManifestHash = computeDamageManifestHash(classicDamageProfile as DamageManifest);
console.log(`Computed action manifest hash: ${actionManifestHash}`);
console.log(`Computed status manifest hash: ${statusManifestHash}`);
console.log(`Computed enemy manifest hash: ${enemyManifestHash}`);
console.log(`Computed damage manifest hash: ${damageManifestHash}`);

// Verify combatSchemaHash is set in ReplayRecorder defaults
const recorder = new ReplayRecorder();
const currentSchemaHash = recorder.metadata.combatSchemaHash;
const currentManifestHash = recorder.metadata.manifestHash;
const currentStatusManifestHash = recorder.metadata.statusManifestHash;
const currentEnemyManifestHash = recorder.metadata.enemyManifestHash;
const currentDamageManifestHash = recorder.metadata.damageManifestHash;

console.log(`Current combatSchemaHash: ${currentSchemaHash}`);
console.log(`Current manifestHash: ${currentManifestHash}`);
console.log(`Current statusManifestHash: ${currentStatusManifestHash}`);
console.log(`Current enemyManifestHash: ${currentEnemyManifestHash}`);
console.log(`Current damageManifestHash: ${currentDamageManifestHash}`);

assert.equal(currentSchemaHash, actionManifestHash, "combatSchemaHash must match the current action manifest hash");
assert.equal(currentManifestHash, actionManifestHash, "manifestHash must match the current action manifest hash");
assert.equal(currentStatusManifestHash, statusManifestHash, "statusManifestHash must match the current status manifest hash");
assert.equal(currentEnemyManifestHash, enemyManifestHash, "enemyManifestHash must match the current enemy manifest hash");
assert.equal(currentDamageManifestHash, damageManifestHash, "damageManifestHash must match the current damage manifest hash");
assert.equal(recorder.metadata.dataSources.actions, "src/data/manifest/actions/default.json#actions");
assert.equal(recorder.metadata.dataSources.status, "src/data/manifest/status/default.json#profiles");
assert.equal(recorder.metadata.dataSources.ai, "src/data/manifest/ai/enemy-default.json#profiles");
assert.equal(recorder.metadata.dataSources.damage, "src/data/manifest/damage/classic-profile.json#constants");

// Also verify buildHash is set (even if hardcoded)
const buildHash = recorder.metadata.buildHash;
assert.ok(buildHash.length > 0, "buildHash must be non-empty");
console.log(`Current buildHash: ${buildHash}`);

// Verify logicFps
assert.equal(recorder.metadata.logicFps, 60, "logicFps must be 60");
