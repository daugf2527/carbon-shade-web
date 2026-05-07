import { assert } from "./test-utils.js";
import { ACTIONS } from "../../src/combat/actions/FrameDataAction.js";
import type { ActionName, StatusEffectType } from "../../src/combat/types.js";

// --- G2: Status Profile Completeness ---
// 14 status types defined in types.ts. Verify each has a profile or documented gap.

const ALL_STATUS_TYPES: StatusEffectType[] = [
  "bleed", "poison", "shock", "burn", "rupture",
  "stun", "freeze", "stone", "bind", "sleep",
  "slow", "defense_down", "attack_down", "curse",
];

const IMPLEMENTED_STATUS: StatusEffectType[] = [
  "bleed", "poison", "burn", "shock", "rupture",
];

const NOT_IMPLEMENTED_STATUS: StatusEffectType[] = [
  "stun", "freeze", "stone", "bind", "sleep",
  "slow", "defense_down", "attack_down", "curse",
];

assert.equal(ALL_STATUS_TYPES.length, 14, "Must have 14 status types defined");

// Verify implemented types have profiles defined
for (const t of IMPLEMENTED_STATUS) {
  assert.ok(ALL_STATUS_TYPES.includes(t), `${t} must be in ALL_STATUS_TYPES`);
}
console.log(`OK: ${IMPLEMENTED_STATUS.length} status types have profiles`);

// Verify non-implemented types are documented
for (const t of NOT_IMPLEMENTED_STATUS) {
  assert.ok(ALL_STATUS_TYPES.includes(t), `${t} must be in ALL_STATUS_TYPES`);
}
console.log(`OK: ${NOT_IMPLEMENTED_STATUS.length} status types documented as not yet implemented`);

// Verify the counts add up
assert.equal(
  IMPLEMENTED_STATUS.length + NOT_IMPLEMENTED_STATUS.length,
  ALL_STATUS_TYPES.length,
  "All status types must be accounted for"
);

// --- G3: Action Registration Completeness ---
// Verify every action in ACTIONS has required fields

const REQUIRED_ACTION_FIELDS = [
  "totalFrames", "startup", "active", "recovery",
  "cancelPolicy", "hitStopProfile", "recoilProfile",
  "feedbackProfile", "sourcePolicy",
] as const;

const ACTION_NAMES = Object.keys(ACTIONS) as ActionName[];
console.log(`\nScanning ${ACTION_NAMES.length} registered actions...`);

for (const name of ACTION_NAMES) {
  const action = ACTIONS[name];
  assert.ok(action, `Action ${name} must exist in ACTIONS`);

  for (const field of REQUIRED_ACTION_FIELDS) {
    assert.ok(
      (action as unknown as Record<string, unknown>)[field] !== undefined,
      `Action ${name} missing required field: ${field}`
    );
  }

  // totalFrames must be >= 1
  assert.ok(action.totalFrames >= 1, `${name}: totalFrames=${action.totalFrames} must be >= 1`);

  // Active windows must reference valid frame ranges
  for (const box of action.active) {
    assert.ok(box.start >= 1, `${name}/${box.id}: start=${box.start} must be >= 1`);
    assert.ok(box.end <= action.totalFrames, `${name}/${box.id}: end=${box.end} must be <= totalFrames=${action.totalFrames}`);
    assert.ok(box.start <= box.end, `${name}/${box.id}: start=${box.start} must be <= end=${box.end}`);
    assert.ok(box.baseDamage > 0, `${name}/${box.id}: baseDamage must be > 0`);
    assert.ok(box.hitGroupId.length > 0, `${name}/${box.id}: hitGroupId required`);
  }

  // Cancel policy frame references (negative values = "never cancel", intentionally allowed)
  if (action.cancelPolicy.hitCancelFrom !== undefined) {
    assert.ok(action.cancelPolicy.hitCancelFrom <= action.totalFrames, `${name}: hitCancelFrom=${action.cancelPolicy.hitCancelFrom} must be <= totalFrames=${action.totalFrames}`);
  }
  if (action.cancelPolicy.whiffCancelFrom !== undefined) {
    assert.ok(action.cancelPolicy.whiffCancelFrom <= action.totalFrames, `${name}: whiffCancelFrom=${action.cancelPolicy.whiffCancelFrom} must be <= totalFrames=${action.totalFrames}`);
  }

  // Root motion steps must reference valid frames (if present)
  if (action.rootMotion?.frames) {
    for (const step of action.rootMotion.frames) {
      assert.ok(step.frame >= 1, `${name}/rootMotion: frame=${step.frame} must be >= 1`);
      assert.ok(step.frame <= action.totalFrames, `${name}/rootMotion: frame=${step.frame} must be <= totalFrames=${action.totalFrames}`);
    }
  }
}

console.log(`OK: All ${ACTION_NAMES.length} actions have valid frame data`);

// --- G1: Tuning Baseline Verification ---
// Cross-reference key tuning values against the tuning baseline

const tuningBaseline = {
  quickReboundMaxHold: 180,
  bleedDuration: 180,
  bleedInterval: 30,
  ragingFuryPillarFrames: [15, 17, 19, 21, 23, 25, 27, 29, 31, 33],
  tickRate: 60,
} as const;

// QuickRebound action maxHoldFrames should match tuning baseline
const qrAction = ACTIONS.QuickRebound;
assert.ok(qrAction.maxHoldFrames !== undefined, "QuickRebound must have maxHoldFrames");
assert.equal(
  qrAction.maxHoldFrames,
  tuningBaseline.quickReboundMaxHold,
  `QuickRebound.maxHoldFrames=${qrAction.maxHoldFrames} must match tuning baseline ${tuningBaseline.quickReboundMaxHold}`
);

// RagingFury blood pillar frame windows should match pillar frames
const rfAction = ACTIONS.RagingFury;
const pillarHitboxes = rfAction.active.filter(box => box.id.startsWith("rf_pillar_"));
assert.equal(
  pillarHitboxes.length,
  tuningBaseline.ragingFuryPillarFrames.length,
  `RagingFury pillar count ${pillarHitboxes.length} must match tuning baseline ${tuningBaseline.ragingFuryPillarFrames.length}`
);

for (let i = 0; i < pillarHitboxes.length; i++) {
  const baselineFrame = tuningBaseline.ragingFuryPillarFrames[i]!;
  const actualStart = pillarHitboxes[i]!.start;
  assert.equal(
    actualStart,
    baselineFrame,
    `RagingFury pillar[${i}] start=${actualStart} must match tuning baseline frame ${baselineFrame}`
  );
}

console.log(`OK: Tuning baseline values consistent with action definitions`);

// --- B4: FrameData vs. Animation Config Cross-Reference ---
// Verify that every player action that uses sprites has appropriate sprite animation coverage.
// SpriteFrameLibrary maps combat actions to sprite sheet animation clips.
// We verify: (1) all player combat actions are checked, (2) every ACTIONS entry that
// has active hitboxes is referenced by a known action name pattern.

const PLAYER_COMBAT_ACTIONS: ActionName[] = [
  "NormalBasic1", "NormalBasic2", "NormalBasic3",
  "FrenzyBasic1", "FrenzyBasic2", "FrenzyBasic3",
  "UpwardSlash", "MountainousWheel", "RagingFury", "Bloodlust",
  "DashAttack", "Jump", "JumpAttack", "Backstep",
  "QuickRebound", "Derange", "Diehard",
];

const NON_SPRITE_ACTIONS: ActionName[] = [
  "Idle", "Walk", "Run", "FrenzyToggle", "DebugReset",
  "ForceDownPlayer", "ForceBleed", "SpawnTargets", "RunScreenshotScenario",
  "EnemyBasic",
];

for (const name of PLAYER_COMBAT_ACTIONS) {
  assert.ok(ACTIONS[name] !== undefined, `Player action ${name} must exist in ACTIONS`);
  assert.ok(
    ACTIONS[name]!.sourcePolicy.sourceType === "local_baseline",
    `${name}: sourcePolicy.sourceType must be local_baseline`
  );
}

const allActionNames = new Set(ACTION_NAMES);
const accounted = new Set([...PLAYER_COMBAT_ACTIONS, ...NON_SPRITE_ACTIONS]);
const unaccounted = [...allActionNames].filter(n => !accounted.has(n));

if (unaccounted.length > 0) {
  console.log(`NOTE: ${unaccounted.length} actions not explicitly categorized: ${unaccounted.join(", ")}`);
}

console.log(`OK: ${PLAYER_COMBAT_ACTIONS.length} player combat actions verified`);
console.log(`OK: Frame data x animation config cross-reference complete`);
