/**
 * engine-skill-input.test.ts — command-sequence → skill-action trigger (skill-action infra §2).
 *
 * Proves the runtime bridge: feeding an actor's intent (commandDir + button) over ticks builds a
 * buffer that, when it matches a registered skill's PVF command, fires that skill through
 * ActionSystem — the same pipeline basic attacks use. (Wiring real skill animations + cancelWindow
 * is §3; here the skill action uses a stub anim.)
 *
 *   I1 trigger      — feeding icewave (→,↓,→,skill) fires the icewave action + SkillCommandMatched
 *   I2 no false fire — partial / wrong sequence does NOT fire
 *   I3 buffer window — the same sequence spread beyond the window does NOT fire
 *   I4 determinism   — same seed + same input script → identical trigger tick + finalStateHash
 *   I5 fallback dir   — commandDir omitted → horizontal intent.dir maps to left/right
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Actor, statsFromPlayerShard, type ActorIntent } from "../../src/engine/core/Actor.js";
import type { AniDef } from "../../src/engine/core/AnimationPlayer.js";
import { EngineKernel } from "../../src/engine/kernel/EngineKernel.js";
import { ActionSystem } from "../../src/engine/kernel/systems/ActionSystem.js";
import { AnimationSystem } from "../../src/engine/kernel/systems/AnimationSystem.js";
import { SkillInputSystem } from "../../src/engine/kernel/systems/SkillInputSystem.js";

const ROOT = process.cwd();
const swShard = JSON.parse(readFileSync(join(ROOT, "verification/baseline-shards/players/swordman.json"), "utf-8"));
const ICEWAVE_CMD = swShard.skills["icewave"].command as string[]; // ["(right)",",","(down)",",","(right)",",","(skill)"]

const STUB: AniDef = { framesCount: 2, loop: false, frames: [0, 1].map((i) => ({ index: i, delay: 1000 / 60, attackBoxes: [], damageBoxes: [] })) };

function buildKernel(seed: number): { kernel: EngineKernel; player: Actor; skillInput: SkillInputSystem } {
  const kernel = new EngineKernel(seed);
  const player = new Actor("player", "player", statsFromPlayerShard(swShard.chr));
  kernel.addActor(player, true);
  const actions = new ActionSystem();
  actions.define("icewave", STUB);
  const skillInput = new SkillInputSystem(actions);
  skillInput.registerSkill("icewave", ICEWAVE_CMD);
  kernel.registerSystem(skillInput); // INPUT phase, before ActionSystem
  kernel.registerSystem(actions);
  kernel.registerSystem(new AnimationSystem());
  return { kernel, player, skillInput };
}

const NEUTRAL: ActorIntent = { attack: false, dir: 0, commandDir: "none", button: "none" };
const cd = (commandDir: ActorIntent["commandDir"], button: ActorIntent["button"] = "none"): ActorIntent =>
  ({ attack: false, dir: 0, commandDir, button });

/** Drive the kernel one tick with the given intent, restoring neutral after. */
function tickWith(kernel: EngineKernel, player: Actor, intent: ActorIntent): void {
  player.intent = intent;
  kernel.tick();
  player.intent = { ...NEUTRAL };
}

// ── I1: feeding the icewave command fires the skill ──
{
  const { kernel, player } = buildKernel(1);
  tickWith(kernel, player, cd("right"));
  tickWith(kernel, player, cd("down"));
  tickWith(kernel, player, cd("right"));
  tickWith(kernel, player, cd("none", "skill"));
  const matched = kernel.bus.archive.filter((e) => e.type === "SkillCommandMatched");
  const started = kernel.bus.archive.filter((e) => e.type === "ActionStarted" && (e.payload as { actionName?: string }).actionName === "icewave");
  assert.equal(matched.length, 1, "icewave command matched once");
  assert.equal(started.length, 1, "icewave action started via ActionSystem");
  assert.equal(player.currentActionName, "icewave", "player is now performing icewave");
  console.log("I1 OK: →↓→skill fired icewave (SkillCommandMatched + ActionStarted)");
}

// ── I2: partial / wrong sequence does not fire ──
{
  const { kernel, player } = buildKernel(1);
  tickWith(kernel, player, cd("right"));
  tickWith(kernel, player, cd("down"));
  tickWith(kernel, player, cd("none", "skill")); // missing the second →
  const matched = kernel.bus.archive.filter((e) => e.type === "SkillCommandMatched");
  assert.equal(matched.length, 0, "incomplete sequence does not fire");
  console.log("I2 OK: partial sequence (→↓skill) does not trigger");
}

// ── I3: sequence spread beyond the window does not fire ──
{
  const { kernel, player } = buildKernel(1);
  tickWith(kernel, player, cd("right"));
  tickWith(kernel, player, cd("down"));
  tickWith(kernel, player, cd("right"));
  for (let i = 0; i < 45; i++) kernel.tick(); // let the early frames age out of the 40-tick window
  tickWith(kernel, player, cd("none", "skill"));
  const matched = kernel.bus.archive.filter((e) => e.type === "SkillCommandMatched");
  assert.equal(matched.length, 0, "sequence spanning beyond the buffer window does not fire");
  console.log("I3 OK: out-of-window sequence does not trigger");
}

// ── I4: determinism ──
{
  const run = (seed: number): { tick: number; hash: string } => {
    const { kernel, player } = buildKernel(seed);
    const script: ActorIntent[] = [cd("right"), cd("down"), cd("right"), cd("none", "skill")];
    for (const intent of script) tickWith(kernel, player, intent);
    const m = kernel.bus.archive.find((e) => e.type === "SkillCommandMatched");
    return { tick: (m?.payload as { tick: number }).tick, hash: kernel.replay.export().finalStateHash };
  };
  const a = run(2), b = run(2);
  assert.equal(a.tick, b.tick, "same script → same trigger tick");
  assert.equal(a.hash, b.hash, "same seed → identical finalStateHash");
  console.log(`I4 OK: skill trigger deterministic (fired at tick ${a.tick})`);
}

// ── I5: commandDir omitted → horizontal intent.dir fallback ──
{
  // A single-step "(right)" skill, fed via intent.dir (no commandDir) — proves the fallback path.
  const kernel = new EngineKernel(1);
  const player = new Actor("player", "player", statsFromPlayerShard(swShard.chr));
  kernel.addActor(player, true);
  const actions = new ActionSystem();
  actions.define("dash", STUB);
  const skillInput = new SkillInputSystem(actions);
  skillInput.registerSkill("dash", ["(right)", "&", "(attack)"]);
  kernel.registerSystem(skillInput);
  kernel.registerSystem(actions);
  kernel.registerSystem(new AnimationSystem());
  player.intent = { attack: true, dir: 1 }; // no commandDir/button → fallback: dir 1→right, attack→attack
  kernel.tick();
  const matched = kernel.bus.archive.filter((e) => e.type === "SkillCommandMatched");
  assert.equal(matched.length, 1, "right+attack via intent.dir/attack fallback fires");
  console.log("I5 OK: commandDir/button omitted → intent.dir+attack fallback works");
}

console.log("\n✅ skill-input bridge (skill-action infra §2) test passed");
