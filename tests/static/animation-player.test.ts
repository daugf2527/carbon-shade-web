/**
 * T3.4 AnimationPlayer + T3.5 FrameEventBus
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assert } from "./test-utils.js";
import { AnimationPlayer, parseAniDef } from "../../src/engine/core/AnimationPlayer.js";

const ROOT = process.cwd();
const shard = JSON.parse(readFileSync(join(ROOT, "verification/baseline-shards/players/swordman.json"), "utf-8"));
const attack1 = parseAniDef(shard.animations.attack1);

assert.equal(attack1.framesCount, 10);
assert.equal(attack1.loop, false);

const player = new AnimationPlayer();
const events: string[] = [];
player.onFrameEvent((ev) => {
  if (ev.kind === "frameEnter" && ev.damageBoxes.length > 0) {
    events.push(`frame${ev.frameIndex}:dmgBoxes=${ev.damageBoxes.length}`);
  }
  if (ev.kind === "animDone") events.push("animDone");
});

player.play(attack1);

// Advance through all frames (total delay = 9*50+150 = 600ms → 36 ticks at 16.67ms)
let done = false;
for (let i = 0; i < 40 && !done; i++) {
  done = player.update(16.67);
}

assert.ok(events.includes("animDone"), "animDone event not fired");
assert.ok(events.some(e => e.startsWith("frame")), "no frame dmgBox events");

console.log(`T3.4/T3.5 AnimationPlayer: events=[${events.join(", ")}]`);
