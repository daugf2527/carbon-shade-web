import { assert } from "./test-utils.js";
import { Actor } from "../../src/engine/core/Actor.js";
import { EngineKernel } from "../../src/engine/kernel/EngineKernel.js";
import { InputSystem } from "../../src/engine/kernel/systems/InputSystem.js";
import { MovementSystem } from "../../src/engine/kernel/systems/MovementSystem.js";
import { ActionSystem } from "../../src/engine/kernel/systems/ActionSystem.js";
import { AnimationSystem } from "../../src/engine/kernel/systems/AnimationSystem.js";

const MOVE_SPEED = 850;

function makeKernel(): { kernel: EngineKernel; player: Actor } {
  const kernel = new EngineKernel(42);
  const actions = new ActionSystem();
  kernel.registerSystem(new InputSystem(actions, "attack1"));
  kernel.registerSystem(new MovementSystem());
  kernel.registerSystem(actions);
  kernel.registerSystem(new AnimationSystem());
  const player = new Actor("player", "player", {
    hpMax: 180,
    mpMax: 140,
    moveSpeed: MOVE_SPEED,
    physicalAttack: 45,
    physicalDefense: 7.5,
  });
  player.x = 390;
  kernel.addActor(player, true);
  return { kernel, player };
}

{
  const { kernel, player } = makeKernel();
  const startX = player.x;
  player.intent = { attack: false, dir: 1 };
  kernel.tick();
  const walkDelta = player.x - startX;

  assert.equal(player.currentActionName, null, "walk should stay in locomotion, not start an action");
  assert.equal(player.locomotion, "walk", "single horizontal press should enter walk locomotion");
  assert.ok(walkDelta > 0, "walk should move the player forward");

  player.intent = { attack: false, dir: 0 };
  kernel.tick();
  assert.equal(player.locomotion, "idle", "walk should end after releasing horizontal intent");
}

{
  const { kernel, player } = makeKernel();
  const startX = player.x;

  player.intent = { attack: false, dir: 1 };
  kernel.tick();
  player.intent = { attack: false, dir: 0 };
  kernel.tick();
  player.intent = { attack: false, dir: 1 };
  kernel.tick();

  assert.equal(player.currentActionName, null, "double-tap movement should not create a frame-data action");

  const xBeforeRun = player.x;
  kernel.tick();
  const runDelta = player.x - xBeforeRun;

  assert.equal(player.locomotion, "run", "double-tapping within the dash window should enter run locomotion");
  assert.ok(player.x > startX, "run should keep moving the player forward");
  assert.ok(runDelta > 2, "run should advance faster than walk on the same tick budget");

  player.intent = { attack: false, dir: 0 };
  kernel.tick();
  assert.equal(player.locomotion, "idle", "run should end after releasing horizontal intent");
}
