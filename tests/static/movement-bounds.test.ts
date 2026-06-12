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
  player.z = kernel.worldBounds.zMax - 0.5;
  player.intent = { attack: false, dir: 0, zDir: 1 };
  kernel.tick();
  assert.ok(player.z <= kernel.worldBounds.zMax, "engine movement should clamp z to worldBounds.zMax");
}

{
  const { kernel, player } = makeKernel();
  player.z = kernel.worldBounds.zMin + 0.5;
  player.intent = { attack: false, dir: 0, zDir: -1 };
  kernel.tick();
  assert.ok(player.z >= kernel.worldBounds.zMin, "engine movement should clamp z to worldBounds.zMin");
}
