/**
 * engine-action-cancel.test.ts — cancel-window gating in ActionSystem (skill-action infra §3).
 *
 * Wires the cancel-window predicate (CancelWindow.ts) into ActionSystem: an action whose current
 * frame is inside its cancel window can be interrupted by a new request (the DNF cancel/combo
 * chain). Actions without a cancel window (basic attacks — shard has none) stay uninterruptible
 * mid-animation, so this is zero-regression for them.
 *
 *   X1 cancel inside window  — request mid-animation, current frame ∈ [start, start+dur) → cancels
 *   X2 reject before window  — request before the window opens → NOT cancelable (stays in action A)
 *   X3 no window = no cancel  — an action without a cancelWindow can't be canceled mid-animation
 *   X4 determinism            — same seed + same cancel script → identical finalStateHash
 */
import assert from "node:assert/strict";
import { Actor, type ActorStats } from "../../src/engine/core/Actor.js";
import type { AniDef } from "../../src/engine/core/AnimationPlayer.js";
import type { CancelWindowConfig } from "../../src/engine/core/CancelWindow.js";
import { EngineKernel } from "../../src/engine/kernel/EngineKernel.js";
import { ActionSystem } from "../../src/engine/kernel/systems/ActionSystem.js";
import { AnimationSystem } from "../../src/engine/kernel/systems/AnimationSystem.js";

const STATS: ActorStats = { hpMax: 100, mpMax: 0, moveSpeed: 0, physicalAttack: 0, physicalDefense: 0 };
// 10-frame non-looping action so the cancel window has room.
const LONG: AniDef = { framesCount: 10, loop: false, frames: Array.from({ length: 10 }, (_, i) => ({ index: i, delay: 1000 / 60, attackBoxes: [], damageBoxes: [] })) };
const STUB: AniDef = { framesCount: 2, loop: false, frames: [0, 1].map((i) => ({ index: i, delay: 1000 / 60, attackBoxes: [], damageBoxes: [] })) };
// Cancel window: frames [3, 8) cancelable.
const CW: CancelWindowConfig = { startFrame: 3, durationFrames: 5, cancelGroup: 1, weaponMask: [], targetSlots: [] };

function build(seed: number, cancelWindow?: CancelWindowConfig): { kernel: EngineKernel; actor: Actor; actions: ActionSystem } {
  const kernel = new EngineKernel(seed);
  const actor = new Actor("p", "player", STATS);
  kernel.addActor(actor, true);
  const actions = new ActionSystem();
  actions.define("skillA", LONG, cancelWindow);
  actions.define("skillB", STUB);
  kernel.registerSystem(actions);
  kernel.registerSystem(new AnimationSystem());
  return { kernel, actor, actions };
}

/** Tick until the actor's current frame index reaches `target` (cap to avoid infinite loop). */
function tickToFrame(kernel: EngineKernel, actor: Actor, target: number): void {
  for (let i = 0; i < 30 && (actor.animationPlayer.currentFrame?.index ?? 0) < target; i++) kernel.tick();
}

// ── X1: cancel inside the window ──
{
  const { kernel, actor, actions } = build(1, CW);
  actions.request("p", "skillA");
  kernel.tick(); // start skillA
  assert.equal(actor.currentActionName, "skillA", "skillA started");
  tickToFrame(kernel, actor, 4); // frame 4 ∈ [3,8)
  assert.ok((actor.animationPlayer.currentFrame?.index ?? 0) >= 3, "reached cancel window");
  actions.request("p", "skillB");
  kernel.tick();
  assert.equal(actor.currentActionName, "skillB", "canceled into skillB inside the window");
  console.log("X1 OK: action canceled into skillB inside cancel window [3,8)");
}

// ── X2: reject before the window opens ──
{
  const { kernel, actor, actions } = build(1, CW);
  actions.request("p", "skillA");
  kernel.tick(); // start skillA (frame ~1 after AnimationSystem)
  // current frame is < 3 (before window) — request skillB should be rejected.
  assert.ok((actor.animationPlayer.currentFrame?.index ?? 0) < 3, "still before cancel window");
  actions.request("p", "skillB");
  kernel.tick();
  assert.equal(actor.currentActionName, "skillA", "NOT canceled before the window (still skillA)");
  console.log("X2 OK: request before window rejected (stays skillA)");
}

// ── X3: an action with no cancel window can't be canceled mid-animation ──
{
  const { kernel, actor, actions } = build(1, undefined); // skillA has NO cancel window
  actions.request("p", "skillA");
  kernel.tick();
  tickToFrame(kernel, actor, 4);
  actions.request("p", "skillB");
  kernel.tick();
  assert.equal(actor.currentActionName, "skillA", "no cancelWindow → uninterruptible (zero regression)");
  console.log("X3 OK: action without cancelWindow stays uninterruptible (basic-attack behavior)");
}

// ── X4: determinism ──
{
  const run = (seed: number): string => {
    const { kernel, actor, actions } = build(seed, CW);
    actions.request("p", "skillA");
    kernel.tick();
    tickToFrame(kernel, actor, 4);
    actions.request("p", "skillB");
    kernel.tick();
    for (let i = 0; i < 5; i++) kernel.tick();
    return kernel.replay.export().finalStateHash;
  };
  assert.equal(run(7), run(7), "same seed + cancel script → identical finalStateHash");
  console.log("X4 OK: cancel-chain deterministic");
}

console.log("\n✅ action cancel-window gating (skill-action infra §3) test passed");
