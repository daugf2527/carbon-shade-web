/**
 * engine-command-matcher.test.ts — tick-based skill command parse + match (skill-action infra §1).
 *
 * Verifies the matcher parses REAL .skl command sequences from the swordman shard and matches an
 * input-frame buffer deterministically — the foundation the skill-trigger wiring (§2/§3) sits on.
 *
 *   M1 parse sequence   — icewave ["(right)",",",...] → [{dir:right},{dir:down},{dir:right},{button:skill}]
 *   M2 parse "&" same-frame — hardattack ↑&skill → one step {dir:up, button:skill}
 *   M3 match in order   — frames satisfying the sequence (with noise between) → match
 *   M4 reject           — wrong order / incomplete / outside window → no match
 *   M5 "&" simultaneity  — ↑&skill needs SAME frame; up-only or skill-only → no match
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseCommand, matchCommand, type InputFrame,
} from "../../src/engine/input/CommandMatcher.js";

const ROOT = process.cwd();
const swShard = JSON.parse(readFileSync(join(ROOT, "verification/baseline-shards/players/swordman.json"), "utf-8"));
const skills = swShard.skills as Record<string, { command?: string[] }>;

const f = (dir: InputFrame["dir"], button: InputFrame["button"], tick: number): InputFrame => ({ dir, button, tick });
const N = (tick: number): InputFrame => f("none", "none", tick); // neutral noise frame

// ── M1: parse the real icewave command ──
{
  const steps = parseCommand(skills["icewave"].command!);
  assert.deepEqual(steps, [{ dir: "right", button: undefined }, { dir: "down", button: undefined }, { dir: "right", button: undefined }, { dir: undefined, button: "skill" }],
    "icewave → right,down,right,skill");
  console.log(`M1 OK: icewave parsed to ${steps.length} steps (→↓→skill)`);
}

// ── M2: parse "&" as one same-frame step ──
{
  const steps = parseCommand(skills["hardattack"].command!); // ["(up)","&","(skill)"]
  assert.equal(steps.length, 1, "hardattack = single step");
  assert.deepEqual(steps[0], { dir: "up", button: "skill" }, "↑&skill → {up, skill} same step");
  console.log("M2 OK: '&' joins into one same-frame step {up, skill}");
}

// ── M3: match in-order with noise between inputs ──
{
  const steps = parseCommand(skills["icewave"].command!);
  const buffer: InputFrame[] = [
    f("right", "none", 1), N(2), f("down", "none", 5), N(6), f("right", "none", 8), f("none", "skill", 10),
  ];
  assert.equal(matchCommand(buffer, steps, 30), true, "icewave sequence within window → match");
  console.log("M3 OK: in-order sequence (with neutral noise) matches");
}

// ── M4: reject wrong order / incomplete / outside window ──
{
  const steps = parseCommand(skills["icewave"].command!);
  // Wrong order (down before first right satisfied differently) — missing final skill.
  assert.equal(matchCommand([f("right", "none", 1), f("down", "none", 2), f("right", "none", 3)], steps, 30), false,
    "incomplete (no skill) → no match");
  // Correct sequence but spanning beyond the window.
  const tooSlow: InputFrame[] = [f("right", "none", 1), f("down", "none", 5), f("right", "none", 10), f("none", "skill", 100)];
  assert.equal(matchCommand(tooSlow, steps, 30), false, "span 1→100 > 30 ticks → no match");
  console.log("M4 OK: incomplete + out-of-window sequences rejected");
}

// ── M5: "&" simultaneity — both on the same frame ──
{
  const steps = parseCommand(skills["hardattack"].command!); // {up, skill}
  assert.equal(matchCommand([f("up", "skill", 1)], steps, 30), true, "up+skill same frame → match");
  assert.equal(matchCommand([f("up", "none", 1), f("none", "skill", 2)], steps, 30), false,
    "up then skill (different frames) → no match for '&' step");
  console.log("M5 OK: '&' requires both inputs on the same frame");
}

console.log("\n✅ command matcher (skill-action infra §1) test passed");
