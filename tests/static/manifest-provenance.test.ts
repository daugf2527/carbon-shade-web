import { assert } from "./test-utils.js";
import type { ActionName, FrameDataAction } from "../../src/combat/types.js";
import { ACTIONS, getAction, loadFromManifest } from "../../src/combat/actions/FrameDataAction.js";
import { ReplayRecorder } from "../../src/combat/replay/ReplayRecorder.js";
import { cloneEnemyTuning, enemyTuning } from "../../src/data/ai/enemyTuning.js";
import { computeActionsHash, computeEnemyManifestHash, computeStatusManifestHash } from "../../src/data/manifest/hash.js";
import { loadActionsManifest, loadEnemyManifest, loadStatusManifest } from "../../src/data/manifest/loader.js";
import { DEFAULT_ENEMY_MANIFEST } from "../../src/data/manifest/ai.js";
import { DEFAULT_STATUS_MANIFEST } from "../../src/data/manifest/status.js";
import { SOURCE_POLICY_VERSION, validateEnemyManifest, validateManifest, validateStatusManifest } from "../../src/data/manifest/schema.js";
import type { EnemyManifest, EnemyManifestId } from "../../src/data/manifest/aiTypes.js";
import { initializeActionManifestForRuntime } from "../../src/game/bootActionManifest.js";

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
  // Strip sourceProvenance metadata before structural comparison (metadata, not combat data)
  const loadedStripped = JSON.parse(JSON.stringify(loaded, (key, val) => key === "sourceProvenance" ? undefined : val));
  const actionsStripped = JSON.parse(JSON.stringify(cloneActions(), (key, val) => key === "sourceProvenance" ? undefined : val));
  assert.deepEqual(loadedStripped, actionsStripped, "JSON actions manifest should remain in JSON-structural parity with ACTIONS");
  assert.equal(computeActionsHash(loaded), computeActionsHash(ACTIONS), "JSON actions manifest hash should match ACTIONS hash");
  assert.equal(loaded.RagingFury.fieldProvenance?.cooldownProfile?.sourceType, "official_api");
}

{
  const loaded = await loadActionsManifest();
  const runtimeActions = JSON.parse(JSON.stringify(loaded)) as Record<ActionName, FrameDataAction>;
  runtimeActions.RagingFury.totalFrames += 3;
  const result = await initializeActionManifestForRuntime({ loadActions: async () => runtimeActions });
  assert.equal(getAction("RagingFury").totalFrames, runtimeActions.RagingFury.totalFrames);
  assert.equal(result.manifestHash, computeActionsHash(runtimeActions));
  assert.equal(result.dataSource, "src/data/manifest/actions/default.json#actions");
  loadFromManifest(loaded);
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
  const loaded = await loadActionsManifest();
  const manifestHash = computeActionsHash(loaded);
  const changed = cloneActions();
  changed.RagingFury.totalFrames += 1;
  assert.notEqual(computeActionsHash(changed), manifestHash, "action manifest hash should change when action data changes");

  const recorder = new ReplayRecorder();
  const statusManifestHash = computeStatusManifestHash(DEFAULT_STATUS_MANIFEST);
  const enemyManifestHash = computeEnemyManifestHash(DEFAULT_ENEMY_MANIFEST);
  assert.equal(recorder.metadata.combatSchemaHash, manifestHash);
  assert.equal(recorder.metadata.manifestHash, manifestHash);
  assert.equal(recorder.metadata.statusManifestHash, statusManifestHash);
  assert.equal(recorder.metadata.enemyManifestHash, enemyManifestHash);
  assert.equal(recorder.metadata.sourcePolicyVersion, SOURCE_POLICY_VERSION);
  assert.equal(recorder.metadata.dataSources.actions, "src/data/manifest/actions/default.json#actions");
  assert.equal(recorder.metadata.dataSources.status, "src/data/manifest/status/default.json#profiles");
  assert.equal(recorder.metadata.dataSources.ai, "src/data/manifest/ai/enemy-default.json#profiles");
  assert.equal(recorder.metadata.dataSources.damage, "local_baseline");
}

{
  const statusManifest = await loadStatusManifest();
  assert.deepEqual(validateStatusManifest(statusManifest), [], "status manifest should satisfy runtime provenance gates");
  assert.deepEqual(
    Object.keys(statusManifest.profiles).sort(),
    ["attack_down", "bind", "bleed", "burn", "curse", "defense_down", "freeze", "poison", "rupture", "shock", "sleep", "slow", "stone", "stun"],
    "runtime status manifest should include all implemented status profiles"
  );
  assert.equal(statusManifest.profiles.bleed.fieldProvenance.durationFrames.sourceType, "local_baseline");
  assert.equal(statusManifest.profiles.bleed.fieldProvenance.tickIntervalFrames.sourceType, "local_baseline");
  assert.equal(statusManifest.profiles.bleed.fieldProvenance.dotDamagePerStack.sourceType, "local_baseline");
  assert.equal(statusManifest.profiles.burn.fieldProvenance.splashRadius?.sourceType, "local_baseline");
  assert.equal(statusManifest.profiles.burn.fieldProvenance.splashDamagePerStack?.sourceType, "local_baseline");
  assert.equal(statusManifest.profiles.rupture.fieldProvenance.incomingDirectDamageMultiplierPerStack?.sourceType, "local_baseline");

  const changed = JSON.parse(JSON.stringify(statusManifest)) as typeof statusManifest;
  changed.profiles.bleed.durationFrames += 1;
  assert.notEqual(
    computeStatusManifestHash(changed),
    computeStatusManifestHash(statusManifest),
    "status manifest hash should change when status data changes"
  );
}

function profileToTuning(profile: EnemyManifest["profiles"]["grunt"]) {
  return {
    phase: "idle",
    phaseEnteredTick: 0,
    windupRemaining: 0,
    recoverRemaining: 0,
    detectRange: profile.detectRange,
    attackRange: profile.attackRange,
    preAttackFrames: profile.preAttackFrames,
    postCooldown: profile.postCooldown,
    moveSpeedPerTick: profile.moveSpeedPerTick,
    loseAggroRange: profile.loseAggroRange,
    hp: profile.hp,
    damage: profile.damage,
    armor: profile.armor,
    // Phase 5: DNF AI parameters (synced with ai.ts toEnemyAIState)
    sightRange: profile.sightRange,
    aggressiveness: profile.aggressiveness,
    targetSwitchTime: profile.targetSwitchTime,
    longRangeReactionChance: profile.longRangeReactionChance,
    behaviorWeights: profile.behaviorWeights,
    // CRT-004: Hit-reaction substate durations (synced with ai.ts toEnemyAIState)
    flinchDurationTicks: profile.flinchDurationTicks,
    launchDurationTicks: profile.launchDurationTicks,
    knockdownDurationTicks: profile.knockdownDurationTicks,
    getupDurationTicks: profile.getupDurationTicks,
  };
}

{
  const enemyManifest = await loadEnemyManifest();
  const enemyIds: EnemyManifestId[] = ["grunt", "dummy", "imp", "boss", "building"];
  assert.deepEqual(validateEnemyManifest(enemyManifest), [], "enemy manifest should satisfy runtime provenance gates");
  assert.deepEqual(
    Object.keys(enemyManifest.profiles).sort(),
    ["boss", "building", "dummy", "grunt", "imp"],
    "runtime enemy manifest should only include current enemy tuning profiles"
  );
  for (const id of enemyIds) {
    assert.deepEqual(profileToTuning(enemyManifest.profiles[id]), enemyTuning[id], `${id} enemy manifest should match enemyTuning`);
    assert.deepEqual(cloneEnemyTuning(id), enemyTuning[id], `${id} cloneEnemyTuning should keep existing behavior`);
    assert.equal(enemyManifest.profiles[id].fieldProvenance.hp?.sourceType, "local_baseline");
    assert.equal(enemyManifest.profiles[id].fieldProvenance.detectRange?.sourceType, "local_baseline");
  }

  const changed = JSON.parse(JSON.stringify(enemyManifest)) as EnemyManifest;
  changed.profiles.grunt.detectRange += 1;
  assert.notEqual(
    computeEnemyManifestHash(changed),
    computeEnemyManifestHash(enemyManifest),
    "enemy manifest hash should change when enemy AI data changes"
  );
}

{
  const enemyManifest = await loadEnemyManifest();
  const missing = JSON.parse(JSON.stringify(enemyManifest)) as EnemyManifest;
  delete missing.profiles.grunt.fieldProvenance.detectRange;
  const violations = validateEnemyManifest(missing);
  assert.ok(
    violations.some(v => v.path === "profiles.grunt.fieldProvenance.detectRange"),
    "enemy AI range without field provenance should fail validation"
  );
}

{
  for (const sourceType of ["needs_calibration", "experimental"] as const) {
    const enemyManifest = await loadEnemyManifest();
    const blocked = JSON.parse(JSON.stringify(enemyManifest)) as EnemyManifest;
    blocked.profiles.boss.fieldProvenance.attackRange!.sourceType = sourceType;
    blocked.profiles.boss.fieldProvenance.attackRange!.requiresCalibration = true;
    const violations = validateEnemyManifest(blocked);
    assert.ok(
      violations.some(v => v.path === "profiles.boss.fieldProvenance.attackRange"),
      `${sourceType} enemy AI behavior must not enter the default runtime profile`
    );
  }
}

{
  const statusManifest = await loadStatusManifest();
  const missing = JSON.parse(JSON.stringify(statusManifest)) as typeof statusManifest;
  delete missing.profiles.bleed.fieldProvenance.dotDamagePerStack;
  const violations = validateStatusManifest(missing);
  assert.ok(
    violations.some(v => v.path === "profiles.bleed.fieldProvenance.dotDamagePerStack"),
    "status DOT damage without field provenance should fail validation"
  );
}

{
  for (const sourceType of ["needs_calibration", "experimental"] as const) {
    const statusManifest = await loadStatusManifest();
    const blocked = JSON.parse(JSON.stringify(statusManifest)) as typeof statusManifest;
    blocked.profiles.burn.fieldProvenance.splashRadius!.sourceType = sourceType;
    blocked.profiles.burn.fieldProvenance.splashRadius!.requiresCalibration = true;
    const violations = validateStatusManifest(blocked);
    assert.ok(
      violations.some(v => v.path === "profiles.burn.fieldProvenance.splashRadius"),
      `${sourceType} status behavior must not enter the default runtime profile`
    );
  }
}
