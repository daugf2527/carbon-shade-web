/**
 * T-B.7: engine weaponTimeline truth replaces combat DualTimelineAction shape checks.
 *
 * Verifies:
 * 1. weaponTimeline attackBoxes merge onto matching body frames
 * 2. longer weapon timelines keep late attack frames instead of dropping them
 * 3. AnimationPlayer consumes merged frames without changing its single-frame cursor API
 * 4. weaponTimeline-free animations keep backward-compatible behavior
 */

import { assert } from "../static/test-utils.js";
import { AnimationPlayer, type AniDef, type AniFrame } from "../../src/engine/core/AnimationPlayer.js";
import { flattenWeaponTimeline } from "../../src/engine/core/weaponTimelineFlattener.js";

const box = (x2: number): AniFrame["attackBoxes"][number] => ({ x1: 0, y1: 0, z1: -30, x2, y2: 80, z2: 30 });
const frame = (
  index: number,
  attackBoxes: AniFrame["attackBoxes"] = [],
  damageBoxes: AniFrame["damageBoxes"] = [],
): AniFrame => ({ index, delay: 1000 / 60, attackBoxes, damageBoxes });

{
  const body = [frame(0), frame(1, [], [box(20)]), frame(2)];
  const weapon = [frame(0), frame(1, [box(50)]), frame(2)];
  const merged = flattenWeaponTimeline(body, weapon);
  assert.equal(merged.length, 3, "weaponTimeline merge should preserve body frame count when lengths match");
  assert.equal(merged[1].attackBoxes.length, 1, "matching weapon frame should contribute its attackBox");
  assert.equal(merged[1].attackBoxes[0].x2, 50, "merged attackBox should come from weapon timeline");
  assert.equal(merged[1].damageBoxes.length, 1, "body damageBoxes should survive the merge");
}

{
  const merged = flattenWeaponTimeline([frame(0)], [frame(0), frame(1, [box(40)])]);
  assert.equal(merged.length, 2, "longer weapon timeline should keep trailing attack frames");
  assert.equal(merged[1].attackBoxes[0].x2, 40, "trailing weapon attackBox should survive");
  assert.equal(merged[1].damageBoxes.length, 0, "body-less trailing frame should not invent damageBoxes");
}

{
  const anim: AniDef = {
    framesCount: 3,
    loop: false,
    frames: [frame(0), frame(1), frame(2)],
    weaponTimeline: [frame(0), frame(1, [box(50)]), frame(2)],
  };
  const player = new AnimationPlayer();
  player.play(anim);
  player.update(1000 / 60);
  assert.equal(player.currentFrame?.attackBoxes.length, 1, "AnimationPlayer should expose merged weapon attackBoxes on the active frame");
  assert.equal(player.currentFrame?.attackBoxes[0].x2, 50, "single-frame cursor should read merged weapon attackBoxes");
}

{
  const anim: AniDef = { framesCount: 2, loop: false, frames: [frame(0, [box(99)]), frame(1)] };
  const player = new AnimationPlayer();
  player.play(anim);
  assert.equal(player.currentFrame?.attackBoxes.length, 1, "plain animations should stay unchanged without weaponTimeline");
  assert.equal(player.currentFrame?.attackBoxes[0].x2, 99, "backward-compatible attackBoxes should remain intact");
}

console.log("truth: engine weaponTimeline merge verified");
