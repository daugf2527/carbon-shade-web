import { Actor, statsFromPlayerShard } from "../../src/engine/core/Actor.js";
import type { AniDef } from "../../src/engine/core/AnimationPlayer.js";
import { ActorState } from "../../src/engine/core/ActorStateMachine.js";
import { monsterStatsAtLevel } from "../../src/engine/core/MonsterScaling.js";
import { type CharGrowth } from "../../src/engine/core/monsterTruth.js";
import { SWORDMAN_TRUTH } from "../../src/data/manifest/truth/swordman.js";
import { EngineKernel } from "../../src/engine/kernel/EngineKernel.js";
import { ActionSystem } from "../../src/engine/kernel/systems/ActionSystem.js";
import { AnimationSystem } from "../../src/engine/kernel/systems/AnimationSystem.js";
import { CombatResolutionSystem } from "../../src/engine/kernel/systems/CombatResolutionSystem.js";
import { HitstunSystem } from "../../src/engine/kernel/systems/HitstunSystem.js";
import { HitStopSystem } from "../../src/engine/kernel/systems/HitStopSystem.js";
import { DownSystem } from "../../src/engine/kernel/systems/DownSystem.js";
import { AirborneSystem } from "../../src/engine/kernel/systems/AirborneSystem.js";
import { KnockbackSystem } from "../../src/engine/kernel/systems/KnockbackSystem.js";
import { StatusSystem } from "../../src/engine/kernel/systems/StatusSystem.js";

const DUNGEON_BASIS_LEVEL = 31;
const PLAYER_LEVEL = 70;
const swGrowth = SWORDMAN_TRUTH.chr.growth as unknown as {
  hpMax: { values: number[] };
  physicalAttack: { values: number[] };
  physicalDefense: { values: number[] };
};

const GROWTH: CharGrowth = {
  hpMax: swGrowth.hpMax.values,
  physicalAttack: swGrowth.physicalAttack.values,
  physicalDefense: swGrowth.physicalDefense.values,
};

function attack(frames: number, hitFrame: number, boxW = 50, boxH = 80): AniDef {
  return {
    framesCount: frames,
    loop: false,
    frames: Array.from({ length: frames }, (_, index) => ({
      index,
      delay: 1000 / 60,
      attackBoxes: index === hitFrame ? [{ x1: 0, y1: 0, z1: -30, x2: boxW, y2: boxH, z2: 30 }] : [],
      damageBoxes: [],
    })),
  };
}

export function defineSceneLikeActions(actions: ActionSystem): void {
  actions.define("attack1", attack(4, 1));
  actions.define("attack2", attack(5, 2, 55, 85));
  actions.define("attack3", attack(6, 3, 60, 90));
  actions.define("dashattack", attack(4, 2, 65, 80));
  actions.define("jumpattack", attack(5, 2, 50, 70));
  actions.define("chargecrashfinish", attack(5, 2, 75, 90));
}

export function buildSceneLikeGruntStats() {
  return {
    ...monsterStatsAtLevel(
      DUNGEON_BASIS_LEVEL,
      {
        "hp max": { op: "*" as const, value: 65 },
        "equipment_physical_attack": { op: "*" as const, value: 75 },
        "equipment_physical_defense": { op: "*" as const, value: 80 },
      },
      GROWTH,
      350,
      45000,
    ),
    hitRecovery: 500,
  };
}

export function buildEngineSceneKernel(seed = 42) {
  const kernel = new EngineKernel(seed);
  const actions = new ActionSystem();
  defineSceneLikeActions(actions);

  kernel.registerSystem(actions);
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
    statsFromPlayerShard(SWORDMAN_TRUTH.chr as unknown as Record<string, unknown>, PLAYER_LEVEL),
  );
  player.x = 390;
  kernel.addActor(player, true);

  const grunt = new Actor("grunt", "monster", buildSceneLikeGruntStats());
  grunt.x = 440;
  kernel.addActor(grunt, false);

  return { kernel, player, grunt, actions };
}

export function primeTargetForAction(
  kernel: EngineKernel,
  player: Actor,
  target: Actor,
  facing: 1 | -1 = 1,
  offset = 30,
): void {
  player.facing = facing;
  target.hp = target.stats.hpMax;
  target.reaction = null;
  target.airborne = null;
  target.knockback = null;
  target.y = 0;
  target.z = 0;
  target.fsm.force(ActorState.IDLE, kernel.tickCount);
  target.x = player.x + offset * facing;
}

export function runSceneAction(
  kernel: EngineKernel,
  player: Actor,
  target: Actor,
  actionName: string,
  maxTicks = 12,
  facing: 1 | -1 = 1,
  offset = 30,
): void {
  primeTargetForAction(kernel, player, target, facing, offset);
  kernel.requestAction(player.id, actionName);
  for (let i = 0; i < maxTicks; i += 1) kernel.tick();
}
