import assert from 'node:assert/strict';
import { assertRuntimeEvidence } from '../../scripts/assert-runtime-evidence.mjs';

const baseRuntimeEvidence = {
  schemaVersion: 1,
  buildHash: 'abc123',
  assets: {
    expected: [{ key: 'player', url: '/player.png' }],
    loaded: [{ key: 'player', url: '/player.png' }],
    failed: [],
    missingKeys: [],
  },
  combat: {
    sceneReady: true,
    tick: 114,
    eventCount: 200,
    scenario: {
      normalHitObserved: false,
      launchObserved: true,
      ragingFuryMultiHitObserved: true,
      armorHitObserved: true,
      buildingArmorBlockedControlObserved: true,
      bleedObserved: true,
      quickReboundObserved: true,
    },
    eventTypes: {
      HitConfirmed: 15,
      DamageApplied: 15,
      ReactionApplied: 8,
      StatusApplied: 1,
    },
    replay: {
      metadata: {
        buildHash: 'abc123',
        combatSchemaHash: 'schema-abc',
        finalStateHash: 'state-abc',
        manifestHash: 'manifest-abc',
        statusManifestHash: 'status-abc',
        enemyManifestHash: 'enemy-abc',
        damageManifestHash: 'damage-abc',
        logicFps: 60,
      },
      frameCount: 114,
    },
    finalStateHash: 'state-abc',
  },
  dynamicManifests: [
    { kind: 'action_manifest', url: '/actions.json', status: 'loaded', hash: 'hash-1', version: 'v1', loadedAtTick: 10 },
  ],
};

const baseBrowserSmoke = {
  passed: true,
  evidence: {
    diagnostics: {
      consoleErrorCount: 0,
      pageErrorCount: 0,
      failedRequestCount: 0,
      badResponseCount: 0,
      consoleErrors: [],
      pageErrors: [],
      failedRequests: [],
      badResponses: [],
    },
    results: [{ check: "test_assertion", passed: true }],
  },
};

assert.deepEqual(assertRuntimeEvidence(baseRuntimeEvidence, baseBrowserSmoke).errors, []);

// Missing assets
assert.match(
  assertRuntimeEvidence({
    ...baseRuntimeEvidence,
    assets: { ...baseRuntimeEvidence.assets, missingKeys: ['enemy'] },
  }, baseBrowserSmoke).errors.join('\n'),
  /missing asset keys: enemy/
);

// Missing finalStateHash
assert.match(
  assertRuntimeEvidence({
    ...baseRuntimeEvidence,
    combat: { ...baseRuntimeEvidence.combat, finalStateHash: null },
  }, baseBrowserSmoke).errors.join('\n'),
  /macro: combat.finalStateHash is required/
);

// Console errors
assert.match(
  assertRuntimeEvidence(baseRuntimeEvidence, {
    ...baseBrowserSmoke,
    evidence: {
      diagnostics: {
        ...baseBrowserSmoke.evidence.diagnostics,
        consoleErrors: ['boom'],
      },
      results: baseBrowserSmoke.evidence.results,
    },
  }).errors.join('\n'),
  /console errors: boom/
);

// Unauthorized fallback
assert.match(
  assertRuntimeEvidence({
    ...baseRuntimeEvidence,
    dynamicManifests: [
      { kind: 'sprite_manifest', url: '/sprites.json', status: 'fallback', fallbackReason: '404' },
    ],
  }, baseBrowserSmoke).errors.join('\n'),
  /unauthorized dynamic manifest fallback/
);

// Allowed fallback
assert.deepEqual(
  assertRuntimeEvidence({
    ...baseRuntimeEvidence,
    dynamicManifests: [
      { kind: 'local_dev_manifest', url: '/dev.json', status: 'fallback', fallbackReason: 'dev-only' },
    ],
  }, baseBrowserSmoke, { allowedFallbackKinds: ['local_dev_manifest'] }).errors,
  []
);

// Missing scenario boolean
assert.match(
  assertRuntimeEvidence({
    ...baseRuntimeEvidence,
    combat: {
      ...baseRuntimeEvidence.combat,
      scenario: { ...baseRuntimeEvidence.combat.scenario, launchObserved: false },
    },
  }, baseBrowserSmoke).errors.join('\n'),
  /launchObserved must be true/
);

// Missing replay hash
assert.match(
  assertRuntimeEvidence({
    ...baseRuntimeEvidence,
    combat: {
      ...baseRuntimeEvidence.combat,
      replay: { ...baseRuntimeEvidence.combat.replay, metadata: { ...baseRuntimeEvidence.combat.replay.metadata, finalStateHash: null } },
    },
  }, baseBrowserSmoke).errors.join('\n'),
  /replay missing finalStateHash/
);

console.log('runtime evidence assert tests passed');
