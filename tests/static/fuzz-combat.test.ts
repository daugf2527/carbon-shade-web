import { assert } from "./test-utils.js";
import { Actor, statsFromPlayerShard } from "../../src/engine/core/Actor.js";
import { aiConfigFromGoblinTruth } from "../../src/engine/core/MonsterAIConfig.js";
import { SWORDMAN_TRUTH } from "../../src/data/manifest/truth/swordman.js";
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
import { KnockbackSystem } from "../../src/engine/kernel/systems/KnockbackSystem.js";
import { MovementSystem } from "../../src/engine/kernel/systems/MovementSystem.js";
import { StatusSystem } from "../../src/engine/kernel/systems/StatusSystem.js";
import {
  buildSceneLikeGruntStats,
  defineSceneLikeActions,
  primeTargetForAction,
} from "../fixtures/engineSceneHarness.js";

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const ACTIONS = [
  "attack1",
  "attack2",
  "attack3",
  "dashattack",
  "jumpattack",
  "chargecrashfinish",
] as const;

const DIRS = [-1, 0, 1] as const;

function buildFuzzKernel(seed: number): { kernel: EngineKernel; player: Actor; grunt: Actor } {
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
  ai.setAttackAction(grunt.id, "attack1");

  return { kernel, player, grunt };
}

function tick(kernel: EngineKernel, frames: number): void {
  for (let i = 0; i < frames; i += 1) kernel.tick();
}

function runFuzzSequence(seqRng: () => number): EngineKernel {
  const kernelSeed = Math.floor(seqRng() * 0x7fffffff);
  const { kernel, player, grunt } = buildFuzzKernel(kernelSeed);
  const steps = 4 + Math.floor(seqRng() * 30);

  for (let j = 0; j < steps; j += 1) {
    const choice = seqRng();
    if (choice < 0.2) {
      player.intent = { attack: false, dir: DIRS[Math.floor(seqRng() * DIRS.length)]! };
      tick(kernel, 1 + Math.floor(seqRng() * 6));
      player.intent = { attack: false, dir: 0 };
    } else if (choice < 0.45) {
      primeTargetForAction(kernel, player, grunt, 1, 30);
      kernel.requestAction(player.id, ACTIONS[Math.floor(seqRng() * ACTIONS.length)]!);
      tick(kernel, 1 + Math.floor(seqRng() * 4));
    } else if (choice < 0.65) {
      player.intent = { attack: true, dir: DIRS[Math.floor(seqRng() * DIRS.length)]! };
      tick(kernel, 1);
      player.intent = { attack: false, dir: 0 };
    } else if (choice < 0.8) {
      kernel.requestBleed(grunt.id);
      tick(kernel, 1 + Math.floor(seqRng() * 4));
    } else {
      tick(kernel, 1 + Math.floor(seqRng() * 8));
    }
  }

  player.intent = { attack: false, dir: 0 };
  return kernel;
}

// --- Test 1: No-crash fuzz — random engine sequences must never throw ---
{
  const SEED = 12345;
  const rng = mulberry32(SEED);
  const SEQUENCES = 50;

  let crashes = 0;
  for (let i = 0; i < SEQUENCES; i += 1) {
    try {
      runFuzzSequence(mulberry32(Math.floor(rng() * 0x7fffffff)));
    } catch (err) {
      crashes += 1;
      console.log(`CRASH seq ${i}: ${(err as Error).message}`);
    }
  }
  assert.equal(crashes, 0, `${crashes}/${SEQUENCES} fuzz sequences crashed`);
  console.log(`OK: 0/${SEQUENCES} fuzz sequences crashed (seed=${SEED})`);
}

// --- Test 2: Determinism — same seed must produce same final stateHash ---
{
  const SEED = 42;
  const rng = mulberry32(SEED);
  const SEQUENCES = 40;

  let failed = 0;
  for (let i = 0; i < SEQUENCES; i += 1) {
    const seedPerSeq = Math.floor(rng() * 0x7fffffff);
    const kernelA = runFuzzSequence(mulberry32(seedPerSeq));
    const kernelB = runFuzzSequence(mulberry32(seedPerSeq));
    const hashA = kernelA.replay.export().finalStateHash;
    const hashB = kernelB.replay.export().finalStateHash;
    if (hashA !== hashB || hashA === "") {
      failed += 1;
      if (failed <= 3) console.log(`FAIL seq ${i}: hashA=${hashA} hashB=${hashB}`);
    }
  }
  assert.equal(failed, 0, `${failed}/${SEQUENCES} fuzz sequences failed determinism`);
  console.log(`OK: ${SEQUENCES - failed}/${SEQUENCES} sequences deterministic`);
}

// --- Test 3: Replay JSON validity — every engine export must be valid JSON ---
{
  const SEED = 99;
  const rng = mulberry32(SEED);
  const SEQUENCES = 30;

  for (let i = 0; i < SEQUENCES; i += 1) {
    const kernel = runFuzzSequence(mulberry32(Math.floor(rng() * 0x7fffffff)));

    let reparsed: unknown;
    try {
      const exported = kernel.replay.export();
      const json = JSON.stringify(exported);
      reparsed = JSON.parse(json);
    } catch {
      throw new Error(`Seq ${i}: replay export is not valid JSON`);
    }

    const replay = reparsed as {
      version?: string;
      frameCount?: number;
      finalStateHash?: string;
      frames?: Array<{ tick?: number; eventCount?: number; stateHash?: string }>;
      metadata?: { finalStateHash?: string };
    };
    assert.equal(replay.version, "0.1-engine", `Seq ${i}: version`);
    assert.ok(typeof replay.frameCount === "number", `Seq ${i}: frameCount`);
    assert.ok(Array.isArray(replay.frames), `Seq ${i}: frames array`);
    assert.ok(typeof replay.finalStateHash === "string" && replay.finalStateHash.length > 0, `Seq ${i}: finalStateHash`);
    assert.ok(
      typeof replay.metadata === "object" &&
      replay.metadata !== null &&
      replay.metadata.finalStateHash === replay.finalStateHash,
      `Seq ${i}: metadata mirror`,
    );
    assert.equal(replay.frameCount, replay.frames.length, `Seq ${i}: frameCount matches frames`);
    assert.ok(replay.frames.every((frame, index) => frame.tick === index + 1), `Seq ${i}: replay ticks stay monotonic`);
    assert.ok(
      replay.frames.every((frame) => typeof frame.eventCount === "number" && typeof frame.stateHash === "string"),
      `Seq ${i}: replay frames expose eventCount + stateHash`,
    );
  }
  console.log(`OK: ${SEQUENCES} fuzz sequences produced valid replay JSON`);
}
