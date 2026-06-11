import { assert } from "./test-utils.js";
import { Actor } from "../../src/engine/core/Actor.js";
import { aiConfigFromGoblinTruth } from "../../src/engine/core/MonsterAIConfig.js";
import { EngineKernel } from "../../src/engine/kernel/EngineKernel.js";
import { ActionSystem } from "../../src/engine/kernel/systems/ActionSystem.js";
import { AirborneSystem } from "../../src/engine/kernel/systems/AirborneSystem.js";
import { AnimationSystem } from "../../src/engine/kernel/systems/AnimationSystem.js";
import { CombatResolutionSystem } from "../../src/engine/kernel/systems/CombatResolutionSystem.js";
import { DownSystem } from "../../src/engine/kernel/systems/DownSystem.js";
import { EnemyAISystem } from "../../src/engine/kernel/systems/EnemyAISystem.js";
import { HitStopSystem } from "../../src/engine/kernel/systems/HitStopSystem.js";
import { HitstunSystem } from "../../src/engine/kernel/systems/HitstunSystem.js";
import { InputSystem } from "../../src/engine/kernel/systems/InputSystem.js";
import { MovementSystem } from "../../src/engine/kernel/systems/MovementSystem.js";
import { KnockbackSystem } from "../../src/engine/kernel/systems/KnockbackSystem.js";
import { StatusSystem } from "../../src/engine/kernel/systems/StatusSystem.js";
import { statsFromPlayerShard } from "../../src/engine/core/Actor.js";
import { SWORDMAN_TRUTH } from "../../src/data/manifest/truth/swordman.js";
import { buildSceneLikeGruntStats, defineSceneLikeActions } from "../fixtures/engineSceneHarness.js";

const LONG_RUN_TICKS = 1200;
const PLAYER_ROTATION = ["attack1", "attack2", "attack3", "dashattack", "chargecrashfinish"] as const;
const TARGET_ORDER = ["grunt", "imp", "boss"];

function buildAutoCombatKernel(seed = 42): { kernel: EngineKernel; player: Actor } {
  const kernel = new EngineKernel(seed);
  const actions = new ActionSystem();
  defineSceneLikeActions(actions);
  const ai = new EnemyAISystem(actions);

  kernel.registerSystem(new InputSystem(actions, "attack1"));
  kernel.registerSystem(new MovementSystem());
  kernel.registerSystem(actions);
  kernel.registerSystem(ai);
  kernel.registerSystem(new AnimationSystem());
  kernel.registerSystem(new CombatResolutionSystem());
  kernel.registerSystem(new HitstunSystem());
  kernel.registerSystem(new HitStopSystem());
  kernel.registerSystem(new DownSystem());
  kernel.registerSystem(new AirborneSystem());
  kernel.registerSystem(new KnockbackSystem());
  kernel.registerSystem(new StatusSystem());

  const player = new Actor(
    "player",
    "player",
    statsFromPlayerShard(SWORDMAN_TRUTH.chr as unknown as Record<string, unknown>, 70),
  );
  player.x = 390;
  kernel.addActor(player, true);

  const grunt = new Actor("grunt", "monster", buildSceneLikeGruntStats());
  grunt.x = 470;
  grunt.aiConfig = aiConfigFromGoblinTruth();
  kernel.addActor(grunt, false);
  ai.setAttackAction("grunt", "attack1");

  const imp = new Actor("imp", "monster", buildSceneLikeGruntStats());
  imp.x = 620;
  imp.aiConfig = aiConfigFromGoblinTruth();
  kernel.addActor(imp, false);
  ai.setAttackAction("imp", "attack1");

  const boss = new Actor("boss", "monster", {
    ...buildSceneLikeGruntStats(),
    hpMax: Math.round(buildSceneLikeGruntStats().hpMax * 1.6),
    physicalAttack: Math.round(buildSceneLikeGruntStats().physicalAttack * 1.2),
    physicalDefense: Math.round(buildSceneLikeGruntStats().physicalDefense * 1.2),
  });
  boss.x = 900;
  boss.aiConfig = aiConfigFromGoblinTruth();
  kernel.addActor(boss, false);
  ai.setAttackAction("boss", "attack3");

  return { kernel, player };
}

function livingTargets(kernel: EngineKernel): Actor[] {
  return TARGET_ORDER
    .map((id) => kernel.actors.find((actor) => actor.id === id))
    .filter((actor): actor is Actor => actor !== undefined && !actor.isDead);
}

function currentTarget(kernel: EngineKernel): Actor | null {
  return livingTargets(kernel)[0] ?? null;
}

function steerPlayerToward(player: Actor, target: Actor): void {
  const dx = target.x - player.x;
  const dir = Math.abs(dx) > 55 ? (dx > 0 ? 1 : -1) : 0;
  player.intent = { attack: false, dir };
}

function requestBotAction(kernel: EngineKernel, player: Actor, target: Actor): void {
  if (player.currentActionName) return;
  if (player.frozenFrames > 0) return;
  if (Math.abs(target.x - player.x) > 60) return;

  const action = PLAYER_ROTATION[Math.floor(kernel.tickCount / 45) % PLAYER_ROTATION.length]!;
  if (action === "chargecrashfinish") {
    player.facing = target.x >= player.x ? 1 : -1;
  }
  kernel.requestAction(player.id, action);
}

function assertFiniteActorState(kernel: EngineKernel): void {
  for (const actor of kernel.actors) {
    assert.ok(Number.isFinite(actor.x), `${actor.id} x must stay finite`);
    assert.ok(Number.isFinite(actor.y), `${actor.id} y must stay finite`);
    assert.ok(Number.isFinite(actor.z), `${actor.id} z must stay finite`);
    assert.ok(Number.isFinite(actor.hp), `${actor.id} hp must stay finite`);
    assert.ok(actor.hp >= 0, `${actor.id} hp must not go negative`);
  }
}

function eventCount(
  kernel: EngineKernel,
  type: string,
  predicate: (event: { payload: unknown }) => boolean,
): number {
  return kernel.bus.archive.filter((event) => event.type === type && predicate(event)).length;
}

function runAutoCombat(seed = 42): EngineKernel {
  const { kernel, player } = buildAutoCombatKernel(seed);

  for (let tick = 0; tick < LONG_RUN_TICKS; tick += 1) {
    const target = currentTarget(kernel);
    if (!target) break;

    steerPlayerToward(player, target);
    requestBotAction(kernel, player, target);
    kernel.tick();

    if (tick % 60 === 0) assertFiniteActorState(kernel);
  }

  player.intent = { attack: false, dir: 0 };
  return kernel;
}

const first = runAutoCombat();
const second = runAutoCombat();

const playerDamage = eventCount(first, "HitConfirmed", (event) => {
  const payload = event.payload as { attackerId?: string };
  return payload.attackerId === "player";
});
const enemyDamage = eventCount(first, "HitConfirmed", (event) => {
  const payload = event.payload as { attackerId?: string };
  return payload.attackerId !== "player";
});
const playerHits = playerDamage;
const enemyHits = enemyDamage;
const deadEnemies = first.actors.filter((actor) => actor.kind === "monster" && actor.isDead);
const finalHash = first.replay.export().finalStateHash;
const secondHash = second.replay.export().finalStateHash;

assert.ok(playerHits >= 10, `auto combat should produce repeated player hits, got ${playerHits}`);
assert.ok(enemyHits >= 1, `auto combat should let enemy AI hit at least once, got ${enemyHits}`);
assert.ok(playerDamage >= 10, `auto combat should apply repeated player hits, got ${playerDamage}`);
assert.ok(enemyDamage >= 1, `auto combat should apply at least one enemy hit, got ${enemyDamage}`);
assert.ok(deadEnemies.length >= 1, "auto combat should kill at least one enemy");
assert.ok(first.player.hp < first.player.stats.hpMax, "enemy AI should damage the player during auto combat");
assert.ok(finalHash.length > 0, "auto combat replay should export a final state hash");
assert.equal(finalHash, secondHash, "auto combat should be deterministic across repeated runs");
assert.ok(first.bus.archive.length < 25000, `auto combat event archive should stay bounded, got ${first.bus.archive.length}`);
assertFiniteActorState(first);

console.log(`OK: auto combat ${LONG_RUN_TICKS} ticks playerHits=${playerHits} enemyHits=${enemyHits} deadEnemies=${deadEnemies.map((actor) => actor.id).join(",")} hash=${finalHash}`);
