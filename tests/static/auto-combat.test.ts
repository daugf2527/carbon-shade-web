import { assert } from "./test-utils.js";
import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";
import type { ActionName, Actor } from "../../src/combat/types.js";

const PLAYER_ROTATION: ActionName[] = ["attack1", "UpwardSlash", "Bloodlust", "RagingFury", "MountainousWheel"];
const TARGET_ORDER = ["grunt", "dummy", "imp", "boss"];
const LONG_RUN_TICKS = 1200;

function livingTargets(kernel: CombatKernel): Actor[] {
  return TARGET_ORDER
    .map(id => kernel.actors.find(actor => actor.id === id))
    .filter((actor): actor is Actor => Boolean(actor) && !actor.flags.dead && actor.resources.hp > 0);
}

function currentTarget(kernel: CombatKernel): Actor | null {
  return livingTargets(kernel)[0] ?? null;
}

function steerPlayerToward(kernel: CombatKernel, target: Actor): void {
  const player = kernel.player;
  const dx = target.position.x - player.position.x;
  if (Math.abs(dx) > 120) {
    kernel.press(dx > 0 ? "ArrowRight" : "ArrowLeft");
    kernel.release(dx > 0 ? "ArrowLeft" : "ArrowRight");
  } else {
    kernel.release("ArrowLeft");
    kernel.release("ArrowRight");
  }
}

function requestBotAction(kernel: CombatKernel, target: Actor): void {
  if (kernel.player.currentAction) return;
  if (kernel.player.cooldowns.globalRemaining > 0) return;

  const action = PLAYER_ROTATION[Math.floor(kernel.tickCount / 45) % PLAYER_ROTATION.length]!;
  if (action === "RagingFury") {
    target.reactionState = "downed";
    target.position.x = kernel.player.position.x + (kernel.player.facing === "right" ? 88 : -88);
    target.position.z = kernel.player.position.z;
  }
  kernel.requestAction(kernel.player, action, "debug", kernel.player.facing);
}

function assertFiniteActorState(kernel: CombatKernel): void {
  for (const actor of kernel.actors) {
    assert.ok(Number.isFinite(actor.position.x), `${actor.id} x must stay finite`);
    assert.ok(Number.isFinite(actor.position.y), `${actor.id} y must stay finite`);
    assert.ok(Number.isFinite(actor.position.z), `${actor.id} z must stay finite`);
    assert.ok(Number.isFinite(actor.resources.hp), `${actor.id} hp must stay finite`);
    assert.ok(actor.resources.hp >= 0, `${actor.id} hp must not go negative`);
    for (const remaining of actor.cooldowns.remaining.values()) {
      assert.ok(remaining >= 0, `${actor.id} cooldown must not go negative`);
    }
  }
}

function runAutoCombat(): CombatKernel {
  const kernel = new CombatKernel({ enableReplay: true });
  kernel.actors.find(actor => actor.id === "boss")!.position.x = 760;
  kernel.actors.find(actor => actor.id === "building")!.position.x = 1600;

  for (let tick = 0; tick < LONG_RUN_TICKS; tick += 1) {
    const target = currentTarget(kernel);
    if (!target) break;

    steerPlayerToward(kernel, target);
    requestBotAction(kernel, target);
    kernel.tick();

    if (tick % 60 === 0) assertFiniteActorState(kernel);
  }

  kernel.release("ArrowLeft");
  kernel.release("ArrowRight");
  return kernel;
}

function eventCount(kernel: CombatKernel, type: string, predicate: (event: { payload: unknown; sourceActorId?: string; targetActorId?: string }) => boolean): number {
  return kernel.bus.archive.filter(event => event.type === type && predicate(event)).length;
}

const first = runAutoCombat();
const second = runAutoCombat();

const playerDamage = eventCount(first, "DamageApplied", event => {
  const payload = event.payload as { attackerId?: string; sourceKind?: string };
  return payload.attackerId === "player" && payload.sourceKind === "direct_hit";
});
const enemyDamage = eventCount(first, "DamageApplied", event => {
  const payload = event.payload as { sourceKind?: string };
  return payload.sourceKind === "enemy_normal";
});
const playerHits = eventCount(first, "HitConfirmed", event => event.sourceActorId === "player");
const enemyHits = eventCount(first, "HitConfirmed", event => event.sourceActorId !== "player");
const deadEnemies = first.actors.filter(actor => actor.faction === "enemy" && actor.id !== "building" && actor.flags.dead);
const finalHash = first.replay.frames.at(-1)?.stateHash ?? "";
const secondHash = second.replay.frames.at(-1)?.stateHash ?? "";

assert.ok(playerHits >= 10, `auto combat should produce repeated player hits, got ${playerHits}`);
assert.ok(enemyHits >= 1, `auto combat should let enemy AI hit at least once, got ${enemyHits}`);
assert.ok(playerDamage >= 10, `auto combat should apply repeated player damage, got ${playerDamage}`);
assert.ok(enemyDamage >= 1, `auto combat should apply enemy_normal damage, got ${enemyDamage}`);
assert.ok(deadEnemies.length >= 1, "auto combat should kill at least one non-building enemy");
assert.ok(first.player.resources.hp < first.player.resources.maxHp, "enemy AI should damage the player during auto combat");
assert.ok(finalHash.length > 0, "auto combat replay should export a final state hash");
assert.equal(finalHash, secondHash, "auto combat should be deterministic across repeated runs");
assert.ok(first.bus.archive.length < 25000, `auto combat event archive should stay bounded, got ${first.bus.archive.length}`);
assertFiniteActorState(first);

console.log(`OK: auto combat ${LONG_RUN_TICKS} ticks playerHits=${playerHits} enemyHits=${enemyHits} deadEnemies=${deadEnemies.map(actor => actor.id).join(",")} hash=${finalHash}`);
