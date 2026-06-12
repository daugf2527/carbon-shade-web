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
  const startZ = player.z;
  player.intent = { attack: false, dir: 0, zDir: 1 };
  kernel.tick();

  assert.equal(player.currentActionName, null, "vertical locomotion should not enter a frame-data action");
  assert.equal(player.locomotion, "walk", "single z-axis press should enter walk locomotion");
  assert.ok(player.z > startZ, "positive zDir should move the player deeper into the lane");
  assert.equal(player.x, startX, "pure z movement should not drift on x");

  player.intent = { attack: false, dir: 0, zDir: 0 };
  kernel.tick();
  assert.equal(player.locomotion, "idle", "z-axis locomotion should end after releasing depth intent");
}

{
  const horizontal = makeKernel();
  const horizontalStartX = horizontal.player.x;
  horizontal.player.intent = { attack: false, dir: 1, zDir: 0 };
  horizontal.kernel.tick();
  const horizontalDistance = horizontal.player.x - horizontalStartX;

  const diagonal = makeKernel();
  const diagonalStartX = diagonal.player.x;
  const diagonalStartZ = diagonal.player.z;
  diagonal.player.intent = { attack: false, dir: 1, zDir: 1 };
  diagonal.kernel.tick();

  const diagonalDx = diagonal.player.x - diagonalStartX;
  const diagonalDz = diagonal.player.z - diagonalStartZ;
  const diagonalDistance = Math.hypot(diagonalDx, diagonalDz);

  assert.ok(
    Math.abs(horizontalDistance - diagonalDistance) < 0.6,
    "diagonal movement should preserve the engine's current combined-axis locomotion magnitude",
  );

  diagonal.player.intent = { attack: false, dir: 0, zDir: 0 };
  diagonal.kernel.tick();
  assert.equal(diagonal.player.locomotion, "idle", "diagonal locomotion should end after releasing both axes");
}
