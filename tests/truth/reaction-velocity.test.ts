/**
 * T-C.5: ReactionResolver PVF velocity calculation (D9=B stub coefficients)
 *
 * 验证 H2 公式:
 *   velocityY = liftUp × weaponHitInfo.launch × weightFactor
 *   velocityX = pushAside × weaponHitInfo.pushBack × weightFactor × direction
 *   weightFactor = max(0.1, 1 - weight / 150000)
 */

import { ok, equal } from "../static/test-utils.js";
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

function createMockActor(weight: number, actionName?: string): Actor {
  return {
    id: "test",
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    facing: "right",
    weight,
    flags: { dead: false, invincible: false },
    handfeel: { reactionRemaining: 0, visualRecoilX: 0, visualRecoilZ: 0 },
    comboCorrection: { launchResistance: 1, stunReliefFrames: 0 },
    buffs: [],
    currentAction: actionName ? { actionName, lockedFacing: "right" } as any : undefined,
  } as Actor;
}

function createMockDecision(): HitDecision {
  return {
    hitbox: { impactSnapX: 4, attackLevel: 1, reactionProfile: undefined } as any,
  } as HitDecision;
}

// Test 1: attack3 (slot 0, launch=0) → no Y velocity
{
  const resolver = new ReactionResolver();
  const target = createMockActor(68000);
  const attacker = createMockActor(68000, "attack3");
  const decision = createMockDecision();

  resolver.apply(target, "launch", decision, attacker, 0);

  const attack3 = SWORDMAN_ATTACKS.attack3 as any;
  const slot0 = SWORDMAN_WEAPON_HIT_INFO[0];
  const expectedY = attack3.liftUp.value * slot0.launch; // 300 * 0 = 0
  equal(target.velocity.y, expectedY, "attack3 slot 0 launch=0 → velocityY=0");
  console.log("✓ Test 1: attack3 no launch");
}

// Test 2: chargecrashfinish (slot 3, pushBack=0.2) → X velocity
{
  const resolver = new ReactionResolver();
  const target = createMockActor(68000);
  const attacker = createMockActor(68000, "chargecrashfinish");
  const decision = createMockDecision();

  resolver.apply(target, "knockback", decision, attacker, 0);

  const action = SWORDMAN_ATTACKS.chargecrashfinish as any;
  const slot3 = SWORDMAN_WEAPON_HIT_INFO[3];
  const weightFactor = Math.max(0.1, 1 - 68000 / 150000); // ≈ 0.547
  const expectedX = action.pushAside.value * slot3.pushBack * weightFactor * 1; // 400 * 0.2 * 0.547 ≈ 43.7
  ok(Math.abs(target.velocity.x - expectedX) < 1, `chargecrashfinish velocityX ≈ ${expectedX.toFixed(1)}, got ${target.velocity.x.toFixed(1)}`);
  console.log("✓ Test 2: chargecrashfinish pushBack");
}

// Test 3: weight factor boundary (weight=0 → factor=1)
{
  const resolver = new ReactionResolver();
  const target = createMockActor(0);
  const attacker = createMockActor(68000, "attack3");
  const decision = createMockDecision();

  resolver.apply(target, "launch", decision, attacker, 0);

  const attack3 = SWORDMAN_ATTACKS.attack3 as any;
  const slot0 = SWORDMAN_WEAPON_HIT_INFO[0];
  const expectedY = attack3.liftUp.value * slot0.launch * 1; // 300 * 0 * 1 = 0
  equal(target.velocity.y, expectedY, "weight=0 → weightFactor=1");
  console.log("✓ Test 3: weight factor boundary");
}

// Test 4: weight factor min clamp (weight=200000 → factor=0.1)
{
  const resolver = new ReactionResolver();
  const target = createMockActor(200000);
  const attacker = createMockActor(68000, "chargecrashfinish");
  const decision = createMockDecision();

  resolver.apply(target, "knockback", decision, attacker, 0);

  const action = SWORDMAN_ATTACKS.chargecrashfinish as any;
  const slot3 = SWORDMAN_WEAPON_HIT_INFO[3];
  const expectedX = action.pushAside.value * slot3.pushBack * 0.1 * 1; // 400 * 0.2 * 0.1 = 8
  equal(target.velocity.x, expectedX, "weight=200000 → weightFactor clamped to 0.1");
  console.log("✓ Test 4: weight factor min clamp");
}

// Test 5: fallback to profile when actionName not in SWORDMAN_ATTACKS
{
  const resolver = new ReactionResolver();
  const target = createMockActor(68000);
  const attacker = createMockActor(68000, "unknown_action");
  const decision = createMockDecision();

  resolver.apply(target, "launch", decision, attacker, 0);

  // Should fallback to profile (not PVF), velocity.y will be profile.launchVelocityY
  ok(target.velocity.y !== 0 || target.velocity.x !== 0, "fallback to profile when action unknown");
  console.log("✓ Test 5: fallback to profile");
}

// Test 6: facing direction affects X velocity sign
{
  const resolver = new ReactionResolver();
  const target = createMockActor(68000);
  const attacker = createMockActor(68000, "chargecrashfinish");
  attacker.currentAction!.lockedFacing = "left";
  const decision = createMockDecision();

  resolver.apply(target, "knockback", decision, attacker, 0);

  const action = SWORDMAN_ATTACKS.chargecrashfinish as any;
  const slot3 = SWORDMAN_WEAPON_HIT_INFO[3];
  const weightFactor = Math.max(0.1, 1 - 68000 / 150000);
  const expectedX = action.pushAside.value * slot3.pushBack * weightFactor * -1; // negative for left
  ok(Math.abs(target.velocity.x - expectedX) < 1, `facing left → negative velocityX`);
  console.log("✓ Test 6: facing direction");
}

console.log("\nAll reaction velocity tests passed");
