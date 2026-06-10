/**
 * T-C.4: engine ReactionResolver routing truth
 *
 * 这条 truth gate 不再依赖 combat ReactionResolver，而是直接守 engine
 * `routeFromHitReaction()` / `routeFromLegacyBools()` / `applyArmorToKind()`
 * 的路由语义。
 */

import assert from "node:assert/strict";
import { BOSS_SUPER_ARMOR, NONE_ARMOR, SUPER_ARMOR } from "../../src/engine/core/ArmorProfile.js";
import {
  applyArmorToKind,
  routeFromHitReaction,
  routeFromLegacyBools,
  type ReactionKind,
} from "../../src/engine/core/ReactionResolver.js";

function route(hitReaction: Parameters<typeof routeFromHitReaction>[0], causesDown: boolean, attackLevel: number): ReactionKind {
  return routeFromHitReaction(hitReaction, causesDown, attackLevel);
}

// Test 1: attack3 truth => hit_lift_up -> airborne
{
  const result = route("hit_lift_up", true, 1);
  assert.equal(result, "airborne", "hit_lift_up should route to airborne");
}

// Test 2: jumpattack truth => hit_down + causesDown=true -> down
{
  const result = route("hit_down", true, 1);
  assert.equal(result, "down", "hit_down + causesDown=true should route to down");
}

// Test 3: attack1 truth => hit_down + causesDown=false -> hit
{
  const result = route("hit_down", false, 1);
  assert.equal(result, "hit", "hit_down + causesDown=false should fold to hit on engine surfaces");
}

// Test 4: dashattack truth => hit_horizon + attackLevel>=2 -> stagger
{
  const result = route("hit_horizon", false, 2);
  assert.equal(result, "stagger", "hit_horizon should route to stagger for heavy attackLevel");
}

// Test 5: hit_horizon + attackLevel<2 still folds to the same engine stagger kind
{
  const result = route("hit_horizon", false, 1);
  assert.equal(result, "stagger", "hit_horizon should still route to stagger for light attackLevel");
}

// Test 6: none -> hit
{
  const result = route("none", false, 1);
  assert.equal(result, "hit", "none should fold to plain hit");
}

// Test 7: legacy liftUp bool path still works
{
  const result = routeFromLegacyBools({ liftUp: true });
  assert.equal(result, "airborne", "legacy liftUp should still route to airborne");
}

// Test 8: legacy pushAside bool path still works
{
  const result = routeFromLegacyBools({ pushAside: true });
  assert.equal(result, "down", "legacy pushAside should still route to down");
}

// Test 9: armor downgrade takes precedence over routed launch/knockdown kinds
{
  assert.equal(
    applyArmorToKind(BOSS_SUPER_ARMOR, "airborne"),
    "hit",
    "boss armor should suppress airborne launch",
  );
  assert.equal(
    applyArmorToKind(SUPER_ARMOR, "down"),
    "hit",
    "super armor should suppress knockdown",
  );
}

// Test 10: armor should not downgrade unaffected kinds
{
  assert.equal(
    applyArmorToKind(SUPER_ARMOR, "stagger"),
    "stagger",
    "stagger should pass through super armor unchanged",
  );
  assert.equal(
    applyArmorToKind(NONE_ARMOR, "airborne"),
    "airborne",
    "no armor should preserve the routed kind",
  );
}

console.log("✓ All engine reaction routing tests passed");
