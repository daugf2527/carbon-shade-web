/**
 * engine-cancel-window.test.ts — cancel-window PVF truth parse + frame predicate.
 *
 * Verifies the parser extracts the REAL skill cancelWindow truth from the swordman shard and the
 * pure predicate gates frames correctly. (The runtime FSM/skill-action integration is pending —
 * engine has no skill actions yet — so this guards the verifiable foundation, not a wired feature.)
 *
 *   C1 parse real shard — cancelgrabblastblood = {start 50, duration 30, group 2, slots [3]}
 *   C2 frame predicate  — half-open [start, start+duration): in-window boundaries exact
 *   C3 target/weapon     — canCancelInto / cancelAllowedForWeapon read the masks
 *   C4 absent → null     — a skill without cancelWindow parses to null (no invented data)
 *   C5 coverage sanity   — exactly the 19 known cancel skills carry a window
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseCancelWindow, isInCancelWindow, canCancelInto, cancelAllowedForWeapon,
} from "../../src/engine/core/CancelWindow.js";

const ROOT = process.cwd();
const swShard = JSON.parse(readFileSync(join(ROOT, "verification/baseline-shards/players/swordman.json"), "utf-8"));
const skills = swShard.skills as Record<string, { cancelWindow?: unknown }>;

// ── C1: parse the real cancelgrabblastblood cancelWindow ──
{
  const cfg = parseCancelWindow(skills["cancelgrabblastblood"]?.cancelWindow);
  assert.ok(cfg, "cancelgrabblastblood has a cancelWindow");
  assert.equal(cfg.startFrame, 50, "cancelWindowStart 50");
  assert.equal(cfg.durationFrames, 30, "cancelWindowDuration 30");
  assert.equal(cfg.cancelGroup, 2, "cancelGroup 2");
  assert.deepEqual(cfg.targetSlots, [3], "cancelTargetSlots [3]");
  assert.deepEqual(cfg.weaponMask, [0, 0, 0, 1, 0, 1], "cancelWeaponMask");
  console.log(`C1 OK: parsed real shard cancelWindow (start 50, dur 30, group 2, slots [3])`);
}

// ── C2: half-open frame predicate [50, 80) ──
{
  const cfg = parseCancelWindow(skills["cancelgrabblastblood"]!.cancelWindow)!;
  assert.equal(isInCancelWindow(cfg, 49), false, "frame 49 before window");
  assert.equal(isInCancelWindow(cfg, 50), true, "frame 50 = window start (inclusive)");
  assert.equal(isInCancelWindow(cfg, 79), true, "frame 79 = last in-window");
  assert.equal(isInCancelWindow(cfg, 80), false, "frame 80 = window end (exclusive)");
  console.log("C2 OK: cancel window half-open [50, 80) — boundaries exact");
}

// ── C3: target slot + weapon mask predicates ──
{
  const cfg = parseCancelWindow(skills["cancelgrabblastblood"]!.cancelWindow)!;
  assert.equal(canCancelInto(cfg, 3), true, "can cancel into slot 3 (in targetSlots)");
  assert.equal(canCancelInto(cfg, 0), false, "cannot cancel into slot 0");
  assert.equal(cancelAllowedForWeapon(cfg, 3), true, "weapon slot 3 allowed (mask=1)");
  assert.equal(cancelAllowedForWeapon(cfg, 0), false, "weapon slot 0 not allowed (mask=0)");
  console.log("C3 OK: targetSlots + weaponMask predicates read truth masks");
}

// ── C4: a skill without cancelWindow → null (no invented data) ──
{
  const noCancel = Object.keys(skills).find((k) => skills[k]?.cancelWindow == null);
  assert.ok(noCancel, "some skill has no cancelWindow");
  assert.equal(parseCancelWindow(skills[noCancel!]?.cancelWindow), null, "absent cancelWindow → null");
  assert.equal(parseCancelWindow(undefined), null, "undefined → null");
  assert.equal(parseCancelWindow({}), null, "empty object (no start/duration) → null");
  console.log("C4 OK: absent cancelWindow → null (no invented frames)");
}

// ── C5: coverage sanity — the known 19 cancel skills all parse ──
{
  const withWindow = Object.keys(skills).filter((k) => parseCancelWindow(skills[k]?.cancelWindow) !== null);
  assert.equal(withWindow.length, 19, `exactly 19 swordman skills carry a cancel window, got ${withWindow.length}`);
  console.log(`C5 OK: ${withWindow.length}/205 swordman skills carry a parseable cancel window`);
}

console.log("\n✅ cancel-window truth parse + predicate test passed");
