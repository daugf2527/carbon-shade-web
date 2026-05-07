import { assert } from "./test-utils.js";
import type { ActionName, FrameDataAction } from "../../src/combat/types.js";
import { ACTIONS, getAction } from "../../src/combat/actions/FrameDataAction.js";
import { ReplayRecorder } from "../../src/combat/replay/ReplayRecorder.js";
import { computeActionsHash } from "../../src/data/manifest/hash.js";
import { loadActionsManifest } from "../../src/data/manifest/loader.js";
import { SOURCE_POLICY_VERSION, validateManifest } from "../../src/data/manifest/schema.js";

function cloneActions(): Record<ActionName, FrameDataAction> {
  return JSON.parse(JSON.stringify(ACTIONS)) as Record<ActionName, FrameDataAction>;
}

{
  const violations = validateManifest(cloneActions());
  assert.deepEqual(violations, [], "default action manifest should satisfy runtime provenance gates");
}

{
  const loaded = await loadActionsManifest();
  assert.deepEqual(validateManifest(loaded), [], "JSON actions manifest should satisfy runtime provenance gates");
  assert.equal(loaded.RagingFury.fieldProvenance?.cooldownProfile?.sourceType, "official_api");
}

{
  const actions = cloneActions();
  delete actions.RagingFury.fieldProvenance?.cooldownProfile;
  const violations = validateManifest(actions);
  assert.ok(
    violations.some(v => v.path === "RagingFury.fieldProvenance.cooldownProfile"),
    "missing DNF-facing field provenance should fail manifest validation"
  );
}

{
  const actions = cloneActions();
  actions.Bloodlust.fieldProvenance!.active = {
    sourceType: "needs_calibration",
    confidence: "low",
    sourceRef: "test-only:uncalibrated-hitbox",
    capturedAt: "2026-05-07",
    version: "test",
    requiresCalibration: true,
  };
  const violations = validateManifest(actions);
  assert.ok(
    violations.some(v => v.path === "Bloodlust.fieldProvenance.active"),
    "needs_calibration action geometry must not enter the default runtime profile"
  );
}

{
  const actions = cloneActions();
  actions.Bloodlust.fieldProvenance!.active = {
    sourceType: "experimental",
    confidence: "low",
    sourceRef: "test-only:experimental-hitbox",
    capturedAt: "2026-05-07",
    version: "test",
    requiresCalibration: true,
  };
  const violations = validateManifest(actions);
  assert.ok(
    violations.some(v => v.path === "Bloodlust.fieldProvenance.active"),
    "experimental action geometry must not enter the default runtime profile"
  );
}

{
  const ragingFury = getAction("RagingFury");
  assert.equal(ragingFury.fieldProvenance?.cooldownProfile?.sourceType, "official_api");
  assert.equal(ragingFury.fieldProvenance?.costProfile?.sourceType, "official_api");
  assert.equal(ragingFury.fieldProvenance?.active?.sourceType, "local_baseline");
  assert.equal(ragingFury.fieldProvenance?.active?.requiresCalibration, true);
  assert.equal(
    getAction("Bloodlust").fieldProvenance?.cooldownProfile?.sourceRef,
    "src/data/official/berserkerSkillFacts.ts#Bloodlust",
    "official API facts should be referenced explicitly instead of being silently overwritten by local baseline"
  );
}

{
  const manifestHash = computeActionsHash(ACTIONS);
  const changed = cloneActions();
  changed.RagingFury.totalFrames += 1;
  assert.notEqual(computeActionsHash(changed), manifestHash, "action manifest hash should change when action data changes");

  const recorder = new ReplayRecorder();
  assert.equal(recorder.metadata.combatSchemaHash, manifestHash);
  assert.equal(recorder.metadata.manifestHash, manifestHash);
  assert.equal(recorder.metadata.sourcePolicyVersion, SOURCE_POLICY_VERSION);
  assert.equal(recorder.metadata.dataSources.actions, "src/combat/actions/FrameDataAction.ts#ACTIONS");
  assert.equal(recorder.metadata.dataSources.damage, "local_baseline");
}
