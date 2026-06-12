import { assert } from "./test-utils.js";
import { Actor, statsFromPlayerShard } from "../../src/engine/core/Actor.js";
import type { AniDef } from "../../src/engine/core/AnimationPlayer.js";
import { aiConfigFromGoblinTruth } from "../../src/engine/core/MonsterAIConfig.js";
import { SWORDMAN_TRUTH } from "../../src/data/manifest/truth/swordman.js";
import { EngineKernel } from "../../src/engine/kernel/EngineKernel.js";
import { ActionSystem } from "../../src/engine/kernel/systems/ActionSystem.js";
import { AnimationSystem } from "../../src/engine/kernel/systems/AnimationSystem.js";
import { CombatResolutionSystem } from "../../src/engine/kernel/systems/CombatResolutionSystem.js";
import { EnemyAISystem } from "../../src/engine/kernel/systems/EnemyAISystem.js";
import { HitStopSystem } from "../../src/engine/kernel/systems/HitStopSystem.js";
import { HitstunSystem } from "../../src/engine/kernel/systems/HitstunSystem.js";
import { MovementSystem } from "../../src/engine/kernel/systems/MovementSystem.js";
import { buildSceneLikeGruntStats } from "../fixtures/engineSceneHarness.js";

const ENEMY_BASIC: AniDef = {
  framesCount: 4,
  loop: false,
  frames: [
    { index: 0, delay: 1000 / 60, attackBoxes: [], damageBoxes: [] },
    { index: 1, delay: 1000 / 60, attackBoxes: [{ x1: -80, y1: 0, z1: -30, x2: 0, y2: 80, z2: 30 }], damageBoxes: [] },
    { index: 2, delay: 1000 / 60, attackBoxes: [], damageBoxes: [] },
    { index: 3, delay: 1000 / 60, attackBoxes: [], damageBoxes: [] },
  ],
};

function buildEnemyAiKernel(seed = 42): { kernel: EngineKernel; player: Actor; grunt: Actor } {
  const kernel = new EngineKernel(seed);
  const actions = new ActionSystem();
  const ai = new EnemyAISystem(actions);

  actions.define("EnemyBasic", ENEMY_BASIC);

  kernel.registerSystem(new MovementSystem());
  kernel.registerSystem(actions);
  kernel.registerSystem(ai);
  kernel.registerSystem(new AnimationSystem());
  kernel.registerSystem(new CombatResolutionSystem());
  kernel.registerSystem(new HitstunSystem());
  kernel.registerSystem(new HitStopSystem());

  const player = new Actor(
    "player",
    "player",
    statsFromPlayerShard(SWORDMAN_TRUTH.chr as unknown as Record<string, unknown>, 70),
  );
  player.x = 390;
  kernel.addActor(player, true);

  const grunt = new Actor("grunt", "monster", buildSceneLikeGruntStats());
  grunt.x = 640;
  grunt.aiConfig = aiConfigFromGoblinTruth();
  kernel.addActor(grunt, false);
  ai.setAttackAction(grunt.id, "EnemyBasic");

  return { kernel, player, grunt };
}

const { kernel, player, grunt } = buildEnemyAiKernel();
const startX = grunt.x;

for (let i = 0; i < 480; i += 1) {
  kernel.tick();
}

assert.ok(grunt.x < startX, "Enemy AI must approach the player");
assert.ok(
  kernel.bus.archive.some((event) => (
    event.type === "ActionStarted" &&
    (event.payload as { actorId?: string; actionName?: string }).actorId === grunt.id &&
    (event.payload as { actorId?: string; actionName?: string }).actionName === "EnemyBasic"
  )),
  "Enemy AI must enter EnemyBasic",
);
assert.ok(
  kernel.bus.archive.some((event) => {
    if (event.type !== "HitConfirmed") return false;
    const payload = event.payload as {
      attackerId?: string;
      targetId?: string;
      actionName?: string | null;
      finalDamage?: number;
    };
    return (
      payload.attackerId === grunt.id &&
      payload.targetId === player.id &&
      payload.actionName === "EnemyBasic" &&
      (payload.finalDamage ?? 0) > 0
    );
  }),
  "Enemy AI damage must be attributed to its engine-owned attack action",
);
assert.ok(player.hp < player.stats.hpMax, "Enemy AI attack should damage the player");
