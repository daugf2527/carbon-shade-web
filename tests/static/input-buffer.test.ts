import { assert } from "./test-utils.js";
import { Actor } from "../../src/engine/core/Actor.js";
import { ActorState } from "../../src/engine/core/ActorStateMachine.js";
import type { EngineContext } from "../../src/engine/kernel/EngineContext.js";
import type { EngineSystem } from "../../src/engine/kernel/EngineSystem.js";
import { EngineKernel } from "../../src/engine/kernel/EngineKernel.js";
import { DownSystem } from "../../src/engine/kernel/systems/DownSystem.js";
import { HitStopSystem } from "../../src/engine/kernel/systems/HitStopSystem.js";
import { ActionSystem } from "../../src/engine/kernel/systems/ActionSystem.js";

class AttackCaptureSystem implements EngineSystem {
  readonly name = "AttackCapture";
  readonly phase = "INPUT" as const;
  observedAttackIntent = false;

  tick(ctx: EngineContext): void {
    this.observedAttackIntent = ctx.player.intent.attack;
  }
}

function makePlayer(): Actor {
  return new Actor("player", "player", {
    hpMax: 180,
    mpMax: 140,
    moveSpeed: 850,
    physicalAttack: 45,
    physicalDefense: 7.5,
    hitRecovery: 600,
  });
}

{
  const kernel = new EngineKernel(42);
  const down = new DownSystem();
  kernel.registerSystem(down);
  const player = makePlayer();
  kernel.addActor(player, true);

  player.fsm.force(ActorState.DOWN, 0);
  player.reaction = { active: true, kind: "down", remainingTicks: 60, launchVy: 0 };
  kernel.tick();

  player.intent = { attack: false, dir: 0, quickRebound: true };
  kernel.tick();
  assert.equal(player.fsm.state, ActorState.IDLE, "engine quick rebound should stand the player up immediately");
  assert.ok(player.isInvulnerable(kernel.tickCount), "engine quick rebound should grant getup immunity");
}

{
  const kernel = new EngineKernel(42);
  const capture = new AttackCaptureSystem();
  const actions = new ActionSystem();
  kernel.registerSystem(capture);
  kernel.registerSystem(actions);
  kernel.registerSystem(new HitStopSystem());
  const player = makePlayer();
  kernel.addActor(player, true);

  player.frozenFrames = 2;
  player.intent = { attack: true, dir: 0 };
  kernel.tick();

  assert.equal(capture.observedAttackIntent, true, "frozen engine tick should still observe the incoming attack intent");
  assert.equal(player.currentActionName, null, "ActionSystem should not start a new action while the actor is frozen");
  assert.equal(player.frozenFrames, 1, "hit-stop should consume exactly one frozen frame per tick");
}

{
  const kernel = new EngineKernel(42);
  kernel.registerSystem(new HitStopSystem());
  const player = makePlayer();
  kernel.addActor(player, true);

  player.frozenFrames = 2;
  kernel.tick();
  assert.equal(player.frozenFrames, 1, "2F hit-stop should still freeze the next engine tick");
  kernel.tick();
  assert.equal(player.frozenFrames, 0, "2F hit-stop should fully drain after two frozen ticks");
}
