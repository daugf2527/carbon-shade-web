/**
 * engine-monster-scaling.test.ts — MonsterScaling truth-path test (Stage 4C, 2026-06-07)
 *
 * Monster stats = CHARACTER_growth(baseLevel) × abilityCategory% (field-matrix:245).
 * Base = swordman chr.growth (PVF); baseLevel = dungeon basisLevel.
 */
import { assert } from "./test-utils.js";
import { monsterStatsAtLevel } from "../../src/engine/core/MonsterScaling.js";

// swordman PVF chr.growth (LevelScaling truth)
const SW_GROWTH = {
  hpMax: [180, 45, 50, 50, 50, 40, 40, 40, 55, 55, 55, 45, 45, 45, 47.5, 55, 55],
  physicalAttack: [7.5, 4.8, 5, 5, 5, 3.5, 3.5, 3.5, 5.5, 5.5, 5.5, 4.5, 4.5, 4.5, 5, 5, 5],
  physicalDefense: [7.5, 4.8, 5, 5, 5, 3.5, 3.5, 3.5, 5.5, 5.5, 5.5, 4.5, 4.5, 4.5, 4, 6, 6],
};

const GOBLIN_CAT = {
  "hp max": { op: "*" as const, value: 65 },
  "equipment_physical_attack": { op: "*" as const, value: 75 },
  "equipment_physical_defense": { op: "*" as const, value: 80 },
};

const TASKMASTER_CAT = {
  "hp max": { op: "+" as const, value: 6000 },
  "equipment_physical_attack": { op: "*" as const, value: 100 },
  "equipment_physical_defense": { op: "*" as const, value: 100 },
};

const PLAYER_ATK_LV70 = 82.8;
const K = 200;
const hitsToKill = (hp: number, def: number): number => {
  const dmg = Math.max(1, Math.round(PLAYER_ATK_LV70 * (1 - def / (def + K))));
  return hp / dmg;
};

// S1: goblin at dungeon basisLevel 31 (jungle) — truth path
{
  const s = monsterStatsAtLevel(31, GOBLIN_CAT, SW_GROWTH);
  // char hpMax(31) ≈ 493 × 65% ≈ 321; char def(31) ≈ 37.6 × 80% ≈ 30
  assert.ok(Math.abs(s.hpMax - 321) < 5, `S1 goblin HP≈321: ${s.hpMax}`);
  assert.ok(Math.abs(s.physicalDefense - 30) < 2, `S1 goblin DEF≈30: ${s.physicalDefense}`);
  console.log(`S1 OK: LV31 goblin HP=${s.hpMax} ATK=${s.physicalAttack} DEF=${s.physicalDefense} (truth path)`);
}

// S2: goblin at LV31 dies in ~4-5 hits from LV70 swordman — playable AND truth
{
  const s = monsterStatsAtLevel(31, GOBLIN_CAT, SW_GROWTH);
  const hits = hitsToKill(s.hpMax, s.physicalDefense);
  assert.ok(hits >= 3 && hits <= 6, `S2 hits to kill: ${hits.toFixed(1)} (target 3-6)`);
  console.log(`S2 OK: ${hits.toFixed(1)} hits to kill (truth path is both real AND playable)`);
}

// S3: scaling — same goblin in a low-level dungeon (basisLevel 6) is much weaker
{
  const low = monsterStatsAtLevel(6, GOBLIN_CAT, SW_GROWTH);
  const high = monsterStatsAtLevel(31, GOBLIN_CAT, SW_GROWTH);
  assert.ok(high.hpMax > low.hpMax * 1.8, `S3 LV31 HP >> LV6: ${high.hpMax} vs ${low.hpMax}`);
  console.log(`S3 OK: dungeon scaling LV6 HP=${low.hpMax} → LV31 HP=${high.hpMax}`);
}

// S4: taskmaster +6000 absolute HP (mini-boss) on top of character base
{
  const s = monsterStatsAtLevel(31, TASKMASTER_CAT, SW_GROWTH);
  assert.ok(s.hpMax > 6000, `S4 taskmaster HP > 6000: ${s.hpMax}`);
  console.log(`S4 OK: LV31 taskmaster HP=${s.hpMax} (+6000 absolute)`);
}

// S5: 100% category = character base unchanged at that level
{
  const s = monsterStatsAtLevel(31, { "hp max": { op: "*", value: 100 }, "equipment_physical_attack": { op: "*", value: 100 }, "equipment_physical_defense": { op: "*", value: 100 } }, SW_GROWTH);
  const base31 = Math.round(SW_GROWTH.hpMax.reduce((a, b) => a + b, 0) === 0 ? 0 : 493); // char hpMax(31)≈493
  assert.ok(Math.abs(s.hpMax - 493) < 5, `S5 100% = char base: ${s.hpMax} vs ~493`);
  console.log(`S5 OK: 100% category = char base at LV31 (HP=${s.hpMax})`);
}

console.log("\n✅ MonsterScaling truth-path (Stage 4C) all tests passed");
