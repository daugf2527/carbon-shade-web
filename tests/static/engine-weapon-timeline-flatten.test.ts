/**
 * engine-weapon-timeline-flatten.test.ts — D-group dual-timeline attackBox flattening.
 *
 * DNF actions play body + weapon timelines independently; the weapon timeline carries the
 * attackBoxes. The engine flattens weapon attackBoxes onto body frames at play() time so the
 * single AnimationPlayer cursor exposes them. This proves the merge is correct + deterministic
 * and that a weaponTimeline-bearing AniDef drives real hits through CombatResolutionSystem.
 *
 *   W1 lockstep merge   — weapon frame i attackBoxes append to body frame i
 *   W2 length mismatch  — weapon longer than body (extra frames kept) / shorter (body passes through)
 *   W3 player end-to-end — a weaponTimeline AniDef hits the target (attackBox came from weapon)
 *   W4 determinism      — same merged anim → identical hit timing across runs
 *   W5 no-op safety     — AniDef without weaponTimeline is unchanged (backward compat)
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Actor, statsFromPlayerShard, statsFromMonsterShard } from "../../src/engine/core/Actor.js";
import { AnimationPlayer, type AniDef, type AniFrame } from "../../src/engine/core/AnimationPlayer.js";
import { flattenWeaponTimeline } from "../../src/engine/core/weaponTimelineFlattener.js";
import { EngineKernel } from "../../src/engine/kernel/EngineKernel.js";
import { AnimationSystem } from "../../src/engine/kernel/systems/AnimationSystem.js";
import { CombatResolutionSystem } from "../../src/engine/kernel/systems/CombatResolutionSystem.js";
import { HitstunSystem } from "../../src/engine/kernel/systems/HitstunSystem.js";

const ROOT = process.cwd();
const swShard = JSON.parse(readFileSync(join(ROOT, "verification/baseline-shards/players/swordman.json"), "utf-8"));
const gobShard = JSON.parse(readFileSync(join(ROOT, "verification/baseline-shards/monsters/goblin.json"), "utf-8"));

const box = (x2: number): AniFrame["attackBoxes"][number] => ({ x1: 0, y1: 0, z1: -30, x2, y2: 80, z2: 30 });
const frame = (index: number, attackBoxes: AniFrame["attackBoxes"] = [], damageBoxes: AniFrame["damageBoxes"] = []): AniFrame =>
  ({ index, delay: 1000 / 60, attackBoxes, damageBoxes });

// ── W1: lockstep merge — weapon attackBoxes land on the matching body frame ──
{
  const body: AniFrame[] = [frame(0), frame(1, [], [box(20)]), frame(2)];      // body carries a hurtbox on f1
  const weapon: AniFrame[] = [frame(0), frame(1, [box(50)]), frame(2)];        // weapon carries a hitbox on f1
  const merged = flattenWeaponTimeline(body, weapon);
  assert.equal(merged.length, 3, "3 frames");
  assert.equal(merged[0].attackBoxes.length, 0, "f0 no attackBox");
  assert.equal(merged[1].attackBoxes.length, 1, "f1 got weapon attackBox");
  assert.equal(merged[1].attackBoxes[0].x2, 50, "f1 attackBox is the weapon's");
  assert.equal(merged[1].damageBoxes.length, 1, "f1 keeps body's damageBox");
  console.log("W1 OK: weapon attackBox merged onto body frame, body damageBox preserved");
}

// ── W2: length mismatch ──
{
  // Weapon longer: extra weapon frame kept.
  const longWeapon = flattenWeaponTimeline([frame(0)], [frame(0), frame(1, [box(40)])]);
  assert.equal(longWeapon.length, 2, "weapon-longer → 2 frames");
  assert.equal(longWeapon[1].attackBoxes[0].x2, 40, "extra weapon frame's attackBox kept");
  assert.equal(longWeapon[1].damageBoxes.length, 0, "body-less frame has no damageBoxes");
  // Body longer: trailing body frames pass through.
  const longBody = flattenWeaponTimeline([frame(0), frame(1), frame(2, [], [box(20)])], [frame(0, [box(50)])]);
  assert.equal(longBody.length, 3, "body-longer → 3 frames");
  assert.equal(longBody[0].attackBoxes[0].x2, 50, "f0 merged weapon box");
  assert.equal(longBody[2].damageBoxes.length, 1, "trailing body frame preserved");
  console.log("W2 OK: weapon-longer keeps extra frames, body-longer passes trailing frames");
}

// ── W3: end-to-end — a weaponTimeline AniDef lands a hit via the weapon's box ──
function buildScene(seed: number, anim: AniDef): { kernel: EngineKernel; sw: Actor; gob: Actor } {
  const kernel = new EngineKernel(seed);
  const sw = new Actor("sw", "player", statsFromPlayerShard(swShard.chr));
  const gob = new Actor("gob", "monster", statsFromMonsterShard(gobShard.mob));
  sw.x = 0; gob.x = 30;
  kernel.addActor(sw, true);
  kernel.addActor(gob, false);
  kernel.registerSystem(new AnimationSystem());
  kernel.registerSystem(new CombatResolutionSystem());
  kernel.registerSystem(new HitstunSystem());
  sw.animationPlayer.play(anim);
  return { kernel, sw, gob };
}
{
  // Body frames have NO attackBoxes; the hit must come entirely from the weapon timeline.
  const anim: AniDef = {
    framesCount: 3, loop: false,
    frames: [frame(0), frame(1), frame(2)],          // body: zero attackBoxes
    weaponTimeline: [frame(0), frame(1, [box(50)]), frame(2)], // weapon: hitbox on f1
  };
  const { kernel, gob } = buildScene(1, anim);
  const startHp = gob.hp;
  for (let i = 0; i < 3; i++) kernel.tick();
  assert.ok(gob.hp < startHp, `weapon-timeline attackBox landed a hit (hp ${startHp}→${gob.hp})`);
  console.log(`W3 OK: weaponTimeline-only attackBox hit the goblin (hp ${startHp}→${gob.hp})`);
}

// ── W4: determinism ──
{
  const anim: AniDef = {
    framesCount: 3, loop: false,
    frames: [frame(0), frame(1), frame(2)],
    weaponTimeline: [frame(0), frame(1, [box(50)]), frame(2)],
  };
  const run = (): string[] => {
    const { kernel, gob } = buildScene(9, anim);
    const h: string[] = [];
    for (let i = 0; i < 6 && !gob.isDead; i++) { kernel.tick(); h.push(kernel.lastStateHash); }
    return h;
  };
  assert.deepEqual(run(), run(), "flattened weapon-timeline anim is replay-deterministic");
  console.log("W4 OK: flattened anim deterministic across runs");
}

// ── W5: no-op safety — anim without weaponTimeline plays unchanged ──
{
  const plain: AniDef = { framesCount: 2, loop: false, frames: [frame(0, [box(99)]), frame(1)] };
  const p = new AnimationPlayer();
  p.play(plain);
  assert.equal(p.currentFrame?.attackBoxes[0].x2, 99, "plain anim frame 0 unchanged");
  assert.equal(p.currentFrame?.attackBoxes.length, 1, "no spurious boxes added");
  console.log("W5 OK: weaponTimeline-less AniDef unchanged (backward compat)");
}

console.log("\n✅ D-group weapon-timeline flatten test passed");
