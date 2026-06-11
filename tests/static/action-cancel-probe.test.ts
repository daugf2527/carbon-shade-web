import assert from "node:assert/strict";
import { Actor, type ActorStats } from "../../src/engine/core/Actor.js";
import type { AniDef } from "../../src/engine/core/AnimationPlayer.js";
import type { CancelWindowConfig } from "../../src/engine/core/CancelWindow.js";
import { EngineKernel } from "../../src/engine/kernel/EngineKernel.js";
import { ActionSystem } from "../../src/engine/kernel/systems/ActionSystem.js";
import { AnimationSystem } from "../../src/engine/kernel/systems/AnimationSystem.js";

const STATS: ActorStats = { hpMax: 100, mpMax: 0, moveSpeed: 0, physicalAttack: 0, physicalDefense: 0 };
const LONG: AniDef = {
  framesCount: 10,
  loop: false,
  frames: Array.from({ length: 10 }, (_, index) => ({
    index,
    delay: 1000 / 60,
    attackBoxes: [],
    damageBoxes: [],
  })),
};
const STUB: AniDef = {
  framesCount: 2,
  loop: false,
  frames: [0, 1].map((index) => ({
    index,
    delay: 1000 / 60,
    attackBoxes: [],
    damageBoxes: [],
  })),
};

function build(seed: number, cancelWindow?: CancelWindowConfig): {
  kernel: EngineKernel;
  actor: Actor;
  actions: ActionSystem;
} {
  const kernel = new EngineKernel(seed);
  const actor = new Actor("player", "player", STATS);
  kernel.addActor(actor, true);

  const actions = new ActionSystem();
  actions.define("skillA", LONG, cancelWindow);
  actions.define("attack1", STUB);
  kernel.registerSystem(actions);
  kernel.registerSystem(new AnimationSystem());
  return { kernel, actor, actions };
}

function tickToFrame(kernel: EngineKernel, actor: Actor, target: number): void {
  for (let i = 0; i < 30 && (actor.animationPlayer.currentFrame?.index ?? 0) < target; i += 1) {
    kernel.tick();
  }
}

// 1. Cancel stays closed before the configured hit-confirm window.
{
  const { kernel, actor, actions } = build(1, { startFrame: 3, durationFrames: 5, cancelGroup: 1, weaponMask: [], targetSlots: [] });
  actions.request("player", "skillA");
  kernel.tick();
  assert.equal(actor.currentActionName, "skillA", "skillA should start");
  assert.ok((actor.animationPlayer.currentFrame?.index ?? 0) < 3, "current frame should still be before the cancel window");

  actions.request("player", "attack1");
  kernel.tick();
  assert.equal(actor.currentActionName, "skillA", "cancel should stay closed before the window opens");
}

// 2. Cancel opens once the current frame enters the configured window.
{
  const { kernel, actor, actions } = build(1, { startFrame: 3, durationFrames: 5, cancelGroup: 1, weaponMask: [], targetSlots: [] });
  actions.request("player", "skillA");
  kernel.tick();
  tickToFrame(kernel, actor, 4);
  assert.ok((actor.animationPlayer.currentFrame?.index ?? 0) >= 3, "current frame should be inside the cancel window");

  actions.request("player", "attack1");
  kernel.tick();
  assert.equal(actor.currentActionName, "attack1", "cancel should hand off to attack1 inside the window");
}

// 3. Actions with no cancel window stay uninterruptible mid-animation.
{
  const { kernel, actor, actions } = build(1);
  actions.request("player", "skillA");
  kernel.tick();
  tickToFrame(kernel, actor, 4);

  actions.request("player", "attack1");
  kernel.tick();
  assert.equal(actor.currentActionName, "skillA", "actions without a cancelWindow should stay uninterruptible");
}

// 4. Determinism: same seed + same cancel script keeps the replay hash stable.
{
  const run = (seed: number): string => {
    const { kernel, actor, actions } = build(seed, { startFrame: 3, durationFrames: 5, cancelGroup: 1, weaponMask: [], targetSlots: [] });
    actions.request("player", "skillA");
    kernel.tick();
    tickToFrame(kernel, actor, 4);
    actions.request("player", "attack1");
    kernel.tick();
    for (let i = 0; i < 5; i += 1) kernel.tick();
    return kernel.replay.export().finalStateHash;
  };

  assert.equal(run(7), run(7), "same seed + cancel script should produce the same replay hash");
}

console.log("action-cancel-probe: engine cancel-window gating verified");
