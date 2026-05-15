import { assert } from "./test-utils.js";
import { SOCDCleaner } from "../../src/combat/input/SOCDCleaner.js";

// Test 1: No conflict — all directions pass through
{
  const socd = new SOCDCleaner();
  socd.trackPress("ArrowLeft");
  const cleaned = socd.clean(new Set(["ArrowLeft", "ArrowDown"]));
  assert.ok(cleaned.has("ArrowLeft"), "Left should pass through");
  assert.ok(cleaned.has("ArrowDown"), "Down should pass through");
  assert.equal(cleaned.size, 2);
}

// Test 2: Left+Right conflict — last pressed wins
{
  const socd = new SOCDCleaner();
  socd.trackPress("ArrowLeft");
  socd.trackPress("ArrowRight"); // right pressed last
  const cleaned = socd.clean(new Set(["ArrowLeft", "ArrowRight"]));
  assert.ok(!cleaned.has("ArrowLeft"), "Left should be removed (right was last)");
  assert.ok(cleaned.has("ArrowRight"), "Right should remain");
}

// Test 3: Up+Down conflict — last pressed wins
{
  const socd = new SOCDCleaner();
  socd.trackPress("KeyW");
  socd.trackPress("KeyS"); // down pressed last
  const cleaned = socd.clean(new Set(["KeyW", "KeyS"]));
  assert.ok(!cleaned.has("KeyW"), "Up should be removed");
  assert.ok(cleaned.has("KeyS"), "Down should remain");
}

// Test 4: Reset clears state
{
  const socd = new SOCDCleaner();
  socd.trackPress("ArrowLeft");
  socd.reset();
  socd.trackPress("ArrowRight");
  const cleaned = socd.clean(new Set(["ArrowLeft", "ArrowRight"]));
  assert.ok(cleaned.has("ArrowRight"), "Right should win after reset");
}

// Test 5: WASD aliases work correctly (KeyA = left, KeyD = right)
{
  const socd = new SOCDCleaner();
  socd.trackPress("KeyA");
  socd.trackPress("KeyD"); // right pressed last via WASD
  const cleaned = socd.clean(new Set(["KeyA", "KeyD"]));
  assert.ok(!cleaned.has("KeyA"), "KeyA should be removed");
  assert.ok(cleaned.has("KeyD"), "KeyD should remain");
}

// Test 6: Arrow+WASD cross-conflict (ArrowRight + KeyA)
{
  const socd = new SOCDCleaner();
  socd.trackPress("KeyA");
  socd.trackPress("ArrowRight"); // right pressed last
  const cleaned = socd.clean(new Set(["KeyA", "ArrowRight"]));
  assert.ok(!cleaned.has("KeyA"), "KeyA should be removed");
  assert.ok(cleaned.has("ArrowRight"), "ArrowRight should remain");
}

// Test 7: Action buttons are never affected
{
  const socd = new SOCDCleaner();
  socd.trackPress("KeyZ");
  socd.trackPress("KeyX");
  const cleaned = socd.clean(new Set(["KeyZ", "KeyX", "ArrowLeft"]));
  assert.ok(cleaned.has("KeyZ"), "Action button Z should pass through");
  assert.ok(cleaned.has("KeyX"), "Action button X should pass through");
  assert.ok(cleaned.has("ArrowLeft"), "ArrowLeft should pass through");
}

// Test 8: Opposites released, then re-pressed — new last wins
{
  const socd = new SOCDCleaner();
  socd.trackPress("ArrowLeft");
  // Both released (empty clean call updates state to null)
  socd.clean(new Set([]));
  socd.trackPress("ArrowRight");
  const cleaned = socd.clean(new Set(["ArrowLeft", "ArrowRight"]));
  assert.ok(!cleaned.has("ArrowLeft"), "Left should be removed (right was re-pressed last)");
  assert.ok(cleaned.has("ArrowRight"), "Right should remain");
}

// Test 9: Frame pressedOrder drives last-input priority without external trackPress
{
  const socd = new SOCDCleaner();
  const frame = {
    held: new Set(["ArrowLeft", "ArrowRight"]),
    pressed: new Set(["ArrowLeft", "ArrowRight"]),
    pressedOrder: ["ArrowLeft", "ArrowRight"],
  };
  const cleaned = socd.cleanFrame(frame);
  assert.ok(!cleaned.held.has("ArrowLeft"), "Left should be removed from held when right was last in frame order");
  assert.ok(cleaned.held.has("ArrowRight"), "Right should remain in held when right was last in frame order");
  assert.ok(!cleaned.pressed.has("ArrowLeft"), "Left should be removed from pressed when right was last in frame order");
  assert.ok(cleaned.pressed.has("ArrowRight"), "Right should remain in pressed when right was last in frame order");
}

console.log("PASS: SOCD cleaner tests (9/9)");
