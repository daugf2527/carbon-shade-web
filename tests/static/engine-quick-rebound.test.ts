/**
 * engine-quick-rebound.test.ts — QuickRebound test (Stage 4B-B2)
 *
 * Verifies: DOWN + intent.quickRebound → instant stand up with getup immunity + cooldown.
 */
import { assert } from "./test-utils.js";
import { Actor } from "../../src/engine/core/Actor.js";
import { ActorState } from "../../src/engine/core/ActorStateMachine.js";
import { EngineKernel } from "../../src/engine/kernel/EngineKernel.js";
import { DownSystem } from "../../src/engine/kernel/systems/DownSystem.js";
import { HitstunSystem } from "../../src/engine/kernel/systems/HitstunSystem.js";
import { applyHitReaction } from "../../src/engine/core/ReactionResolver.js";

function makeKernel(): { kernel: EngineKernel; downSystem: DownSystem } {
  const k = new EngineKernel(42);
  const ds = new DownSystem();
  k.registerSystem(new HitstunSystem());
  k.registerSystem(ds);

  const player = new Actor("player", "player", {
    hpMax: 500, mpMax: 140, moveSpeed: 300,
    physicalAttack: 45, physicalDefense: 7.5,
    hitRecovery: 600,
  });
  k.addActor(player, true);
  return { kernel: k, downSystem: ds };
}

// Q1: quick rebound while DOWN → immediate IDLE
{
  const { kernel: k } = makeKernel();
  const p = k.player;

  // Force into DOWN
  p.fsm.force(ActorState.DOWN, 0);
  p.reaction = { active: true, kind: "down", remainingTicks: 60, launchVy: 0 };
  k.tick(); // DownSystem sees DOWN entry

  // Press quick rebound
  p.intent = { attack: false, dir: 0, quickRebound: true };
  k.tick();

  assert.equal(p.fsm.state, ActorState.IDLE, "Q1 quick rebound → IDLE");
  assert.equal(p.reaction, null, "Q1 reaction cleared");
  assert.ok(p.isInvulnerable(k.tickCount), "Q1 getup immunity active");
  console.log("Q1 OK: quick rebound → instant IDLE + immunity");
}

// Q2: not DOWN → quickRebound does nothing
{
  const { kernel: k } = makeKernel();
  const p = k.player;

  p.intent = { attack: false, dir: 0, quickRebound: true };
  k.tick();
  assert.equal(p.fsm.state, ActorState.IDLE, "Q2 already IDLE, stays IDLE");
  assert.ok(!p.isInvulnerable(k.tickCount), "Q2 no immunity (wasn't down)");
  console.log("Q2 OK: quickRebound ignored when not DOWN");
}

// Q3: cooldown — can't quick rebound twice within 300 ticks
{
  const { kernel: k } = makeKernel();
  const p = k.player;

  // First quick rebound
  p.fsm.force(ActorState.DOWN, 0);
  p.reaction = { active: true, kind: "down", remainingTicks: 60, launchVy: 0 };
  k.tick();
  p.intent = { attack: false, dir: 0, quickRebound: true };
  k.tick(); // rebound succeeds
  assert.equal(p.fsm.state, ActorState.IDLE, "Q3a first rebound");

  // Wait a bit, get knocked down again
  p.intent = { attack: false, dir: 0 };
  for (let i = 0; i < 35; i++) k.tick(); // past immunity

  p.fsm.force(ActorState.DOWN, k.tickCount);
  p.reaction = { active: true, kind: "down", remainingTicks: 60, launchVy: 0 };
  k.tick();

  // Try quick rebound again (should fail — cooldown)
  p.intent = { attack: false, dir: 0, quickRebound: true };
  k.tick();
  assert.equal(p.fsm.state, ActorState.DOWN, "Q3 cooldown blocks second rebound");
  console.log("Q3 OK: quick rebound on cooldown (300 ticks)");
}

// Q4: quick rebound deterministic
{
  function runRebound(): string {
    const { kernel: k } = makeKernel();
    const p = k.player;
    p.fsm.force(ActorState.DOWN, 0);
    p.reaction = { active: true, kind: "down", remainingTicks: 60, launchVy: 0 };
    k.tick();
    p.intent = { attack: false, dir: 0, quickRebound: true };
    k.tick();
    return `${p.fsm.state}_immune=${p.isInvulnerable(k.tickCount)}`;
  }
  assert.equal(runRebound(), runRebound(), "Q4 determinism");
  console.log("Q4 OK: quick rebound deterministic");
}

console.log("\n✅ QuickRebound (Stage 4B-B2) all tests passed");
