/**
 * engine-monster-scaling.test.ts — MonsterScaling PVF abilityCategory test (Stage 4C)
 *
 * Verifies: monsterStatsAtLevel applies base curve × abilityCategory correctly.
 */
import { assert } from "./test-utils.js";
import { monsterStatsAtLevel } from "../../src/engine/core/MonsterScaling.js";

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

// S1: goblin at LV70 — HP reduced by 65%, ATK by 75%, DEF by 80%
{
  const s = monsterStatsAtLevel(70, GOBLIN_CAT);
  assert.ok(s.hpMax > 200 && s.hpMax < 500, `S1 goblin HP reasonable: ${s.hpMax}`);
  assert.ok(s.physicalDefense < 15, `S1 goblin DEF low: ${s.physicalDefense}`);
  console.log(`S1 OK: LV70 goblin HP=${s.hpMax} ATK=${s.physicalAttack} DEF=${s.physicalDefense}`);
}

// S2: goblin dies in ~4 hits from LV70 swordman (atk=89)
{
  const s = monsterStatsAtLevel(70, GOBLIN_CAT);
  const PLAYER_ATK_LV70 = 82.8; // swordman physicalAttack full-sum truth (LevelScaling)
  const dmg = PLAYER_ATK_LV70 - s.physicalDefense;
  const hits = s.hpMax / dmg;
  assert.ok(hits >= 2 && hits <= 8, `S2 hits to kill: ${hits.toFixed(1)} (target 3-5)`);
  console.log(`S2 OK: ${hits.toFixed(1)} hits to kill (dmg/hit=${dmg.toFixed(1)})`);
}

// S3: taskmaster at LV70 — HP = base + 6000 (mini-boss), stats ×100%
{
  const s = monsterStatsAtLevel(70, TASKMASTER_CAT);
  assert.ok(s.hpMax > 6000, `S3 taskmaster HP > 6000: ${s.hpMax}`);
  console.log(`S3 OK: LV70 taskmaster HP=${s.hpMax} (mini-boss, +6000 HP)`);
}

// S4: level scaling — LV1 goblin much weaker than LV70
{
  const s1 = monsterStatsAtLevel(1, GOBLIN_CAT);
  const s70 = monsterStatsAtLevel(70, GOBLIN_CAT);
  assert.ok(s70.hpMax > s1.hpMax * 3, `S4 LV70 HP > 3× LV1: ${s70.hpMax} vs ${s1.hpMax}`);
  console.log(`S4 OK: LV1 goblin HP=${s1.hpMax}, LV70=${s70.hpMax} (${(s70.hpMax / s1.hpMax).toFixed(1)}x)`);
}

// S5: 100% category = base unchanged
{
  const base = monsterStatsAtLevel(50, { "hp max": { op: "*", value: 100 }, "equipment_physical_attack": { op: "*", value: 100 }, "equipment_physical_defense": { op: "*", value: 100 } });
  const raw50hp = 50 + 50 * 6.5; // baseHP(50) = 375
  assert.equal(base.hpMax, Math.round(raw50hp), `S5 100% = base: ${base.hpMax}`);
  console.log(`S5 OK: 100% category = base (HP=${base.hpMax})`);
}

console.log("\n✅ MonsterScaling (Stage 4C) all tests passed");
