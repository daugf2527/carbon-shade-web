import { RuntimeEvidenceCollector } from "../../src/runtime/evidence/RuntimeEvidenceCollector.js";
import { assert } from "./test-utils.js";

const collector = new RuntimeEvidenceCollector({ buildHash: "test-build", now: () => 1234 });

collector.recordExpectedAsset({ key: "player_berserker_norm", url: "assets/player.png" });
collector.recordExpectedAsset({ key: "missing_norm", url: "assets/missing.png" });
collector.recordAssetLoaded({ key: "player_berserker_norm", url: "assets/player.png" });
collector.recordAssetFailed({ key: "missing_norm", url: "assets/missing.png", error: "404" });
collector.recordCombatSceneReady();
collector.recordCombatSnapshot({
  tick: 42,
  eventCount: 4,
  scenario: { normalHitObserved: true },
  eventTypes: { HitConfirmed: 2, DamageApplied: 2 },
  replay: {
    metadata: {
      buildHash: "test-build",
      combatSchemaHash: "schema-1",
      finalStateHash: "state-1",
    },
    frameCount: 2,
  },
});
collector.recordDynamicManifest({
  kind: "action_manifest",
  url: "/data/actions.json",
  status: "loaded",
  hash: "manifest-hash",
  version: "v1",
  loadedAtTick: 42,
});

const exported = collector.export();

assert.equal(exported.schemaVersion, 1);
assert.equal(exported.buildHash, "test-build");
assert.deepEqual(exported.assets.missingKeys, []);
assert.equal(exported.assets.expected.length, 2);
assert.equal(exported.assets.loaded.length, 1);
assert.equal(exported.assets.failed.length, 1);
assert.equal(exported.combat.sceneReady, true);
assert.equal(exported.combat.tick, 42);
assert.equal(exported.combat.finalStateHash, "state-1");
assert.equal(exported.combat.eventTypes.HitConfirmed, 2);
assert.equal(exported.dynamicManifests.length, 1);
assert.equal(exported.dynamicManifests[0]?.status, "loaded");

const clone = exported.assets.expected;
clone.push({ key: "mutated", url: "bad" });
assert.equal(collector.export().assets.expected.length, 2, "export should return a defensive copy");

console.log("runtime evidence collector tests passed");
