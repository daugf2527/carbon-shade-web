/**
 * T-C.5: ReactionResolver PVF velocity calculation (D9=B stub coefficients)
 *
 * 验证 H2 公式:
 *   velocityY = liftUp × weaponHitInfo.launch × weightFactor
 *   velocityX = pushAside × weaponHitInfo.pushBack × weightFactor × direction
 *   weightFactor = max(0.1, 1 - 68000 / 150000) ≈ 0.547 (stub target weight)
 */

import { assert } from "../static/test-utils.js";
import { ReactionResolver } from "../../src/combat/reaction/ReactionResolver.js";
import type { Actor, HitDecision } from "../../src/combat/types.js";
import SWORDMAN_ATTACKS from "../../src/data/manifest/truth/swordman-attacks.json" with { type: "json" };

const SWORDMAN_WEAPON_HIT_INFO = [
  { launch: 0, pushBack: 0, damageScalePct: 90 },
  { launch: 0, pushBack: -0.1, damageScalePct: 70 },
  { launch: -0.95, pushBack: 0.1, damageScalePct: 100 },
  { launch: 0, pushBack: 0.2, damageScalePct: 120 },
  { launch: 0, pushBack: 0, damageScalePct: 100 },
  { launch: 0, pushBack: -0.15, damageScalePct: 60 },
];

// Stub weight factor (target weight = 68000)
const STUB_WEIGHT_FACTOR = Math.max(0.1, 1 - 68000 / 150000); // ≈ 0.547

function createMockActor(actionName?: string): Actor {
  return {
    id: "test",
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    facing: "right",
    flags: { dead: false },
    handfeel: { reactionRemaining: 0, downRemaining: 0, getUpRemaining: 0 },
    comboCorrection: { launchResistance: 1, stunReliefFrames: 0 } as any,
    buffs: [],
    locomotion: { mode: "idle" } as any,
    currentAction: actionName ? { actionName, lockedFacing: "right" } as any : undefined,
  } as unknown as Actor;
}

function createMockDecision(): HitDecision {
  return {
    hitbox: { impactSnapX: 4, attackLevel: 1, reactionProfile: undefined } as any,
  } as HitDecision;
}

// Test 1: attack3 (slot 0, launch=0/pushBack=0) → launch profile fallback
{
  const resolver = new ReactionResolver();
  const target = createMockActor();
  const attacker = createMockActor("attack3");
  const decision = createMockDecision();

  resolver.apply(target, "launch", decision, attacker, 0);

  assert.ok(target.velocity.y > 0, `attack3 launch should fall back to profile velocityY, got ${target.velocity.y}`);
  assert.ok(target.velocity.x > 0, `attack3 launch should fall back to profile velocityX, got ${target.velocity.x}`);
  console.log("✓ Test 1: attack3 launch fallback");
}

// Test 2: chargecrashfinish (slot 3, pushBack=0.2) → X velocity
{
  const resolver = new ReactionResolver();
  const target = createMockActor();
  const attacker = createMockActor("chargecrashfinish");
  const decision = createMockDecision();

  resolver.apply(target, "knockback", decision, attacker, 0);

  const action = SWORDMAN_ATTACKS.chargecrashfinish as any;
  const slot3 = SWORDMAN_WEAPON_HIT_INFO[3];
  const expectedX = action.pushAside.value * slot3.pushBack * STUB_WEIGHT_FACTOR * 1; // 400 * 0.2 * 0.547 ≈ 43.7
  assert.ok(Math.abs(target.velocity.x - expectedX) < 1, `chargecrashfinish velocityX ≈ ${expectedX.toFixed(1)}, got ${target.velocity.x.toFixed(1)}`);
  console.log("✓ Test 2: chargecrashfinish pushBack");
}

// Test 3: fallback to profile when actionName not in SWORDMAN_ATTACKS
{
  const resolver = new ReactionResolver();
  const target = createMockActor();
  const attacker = createMockActor("unknown_action");
  const decision = createMockDecision();

  resolver.apply(target, "launch", decision, attacker, 0);

  // Should fallback to profile (not PVF), velocity will be from profile
  assert.ok(target.velocity.y !== 0 || target.velocity.x !== 0, "fallback to profile when action unknown");
  console.log("✓ Test 3: fallback to profile");
}

// Test 4: facing direction affects X velocity sign
{
  const resolver = new ReactionResolver();
  const target = createMockActor();
  const attacker = createMockActor("chargecrashfinish");
  attacker.currentAction!.lockedFacing = "left";
  const decision = createMockDecision();

  resolver.apply(target, "knockback", decision, attacker, 0);

  const action = SWORDMAN_ATTACKS.chargecrashfinish as any;
  const slot3 = SWORDMAN_WEAPON_HIT_INFO[3];
  const expectedX = action.pushAside.value * slot3.pushBack * STUB_WEIGHT_FACTOR * -1; // negative for left
  assert.ok(Math.abs(target.velocity.x - expectedX) < 1, `facing left → negative velocityX`);
  console.log("✓ Test 4: facing direction");
}

// Test 5: attack1 (slot 0, pushBack=0) → no X velocity from PVF
{
  const resolver = new ReactionResolver();
  const target = createMockActor();
  const attacker = createMockActor("attack1");
  const decision = createMockDecision();

  resolver.apply(target, "light_stagger", decision, attacker, 0);

  const attack1 = SWORDMAN_ATTACKS.attack1 as any;
  const slot0 = SWORDMAN_WEAPON_HIT_INFO[0];
  const expectedX = attack1.pushAside.value * slot0.pushBack * STUB_WEIGHT_FACTOR * 1; // 30 * 0 * 0.547 = 0
  assert.equal(target.velocity.x, expectedX, "attack1 slot 0 pushBack=0 → velocityX=0");
  console.log("✓ Test 5: attack1 no pushback");
}

console.log("\nAll reaction velocity tests passed");
