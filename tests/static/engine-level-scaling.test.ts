/**
 * engine-level-scaling.test.ts — LevelScaling PVF growth curve test (Stage 4C-C1)
 *
 * Verifies: statAtLevel correctly cumulates chr.growth arrays, boundary conditions,
 * and statsFromPlayerShard at various levels matches known PVF sums.
 */
import { assert } from "./test-utils.js";
import { statAtLevel, statsAtLevel } from "../../src/engine/core/LevelScaling.js";
import { statsFromPlayerShard } from "../../src/engine/core/Actor.js";

// Swordman physicalAttack growth: [7.5, 4.8, 5, 5, 5, 3.5, 3.5, 3.5, 5.5, 5.5, 5.5, 4.5, 4.5, 4.5, 5, 5, 5]
const PA = [7.5, 4.8, 5, 5, 5, 3.5, 3.5, 3.5, 5.5, 5.5, 5.5, 4.5, 4.5, 4.5, 5, 5, 5];
const HP = [180, 45, 50, 50, 50, 40, 40, 40, 55, 55, 55, 45, 45, 45, 47.5, 55, 55];

// L1: LV1 = base value
{
  const v = statAtLevel(PA, 1);
  assert.equal(v, 7.5, `L1 LV1 base: ${v}`);
  console.log(`L1 OK: LV1 physicalAttack = ${v}`);
}

// L2: LV5 = base + full segment 1
{
  const v = statAtLevel(PA, 5);
  const expected = 7.5 + 4.8;
  assert.ok(Math.abs(v - expected) < 0.01, `L2 LV5: ${v} vs ${expected}`);
  console.log(`L2 OK: LV5 physicalAttack = ${v.toFixed(1)} (7.5 + 4.8)`);
}

// L3: LV3 = base + 2/4 of segment 1 (interpolation within segment)
{
  const v = statAtLevel(PA, 3);
  const expected = 7.5 + 4.8 * (2 / 4);
  assert.ok(Math.abs(v - expected) < 0.01, `L3 LV3: ${v} vs ${expected}`);
  console.log(`L3 OK: LV3 physicalAttack = ${v.toFixed(1)} (mid-segment interpolation)`);
}

// L4: LV65 = full sum of all 17 values
{
  const v = statAtLevel(PA, 65);
  const expected = PA.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(v - expected) < 0.01, `L4 LV65 full sum: ${v} vs ${expected}`);
  console.log(`L4 OK: LV65 physicalAttack = ${v.toFixed(1)} (full 17-segment sum = ${expected})`);
}

// L5: LV70 = full sum + 5 levels extrapolated from last segment
{
  const v = statAtLevel(PA, 70);
  const fullSum = PA.reduce((a, b) => a + b, 0);
  const extraRate = PA[16] / 4;
  const expected = fullSum + extraRate * 5;
  assert.ok(Math.abs(v - expected) < 0.01, `L5 LV70 extrapolated: ${v} vs ${expected}`);
  console.log(`L5 OK: LV70 physicalAttack = ${v.toFixed(1)} (extrapolated from LV65)`);
}

// L6: hpMax at LV70
{
  const v = statAtLevel(HP, 70);
  const fullSum = HP.reduce((a, b) => a + b, 0);
  const extraRate = HP[16] / 4;
  const expected = fullSum + extraRate * 5;
  assert.ok(Math.abs(v - expected) < 0.1, `L6 LV70 hpMax: ${v} vs ${expected}`);
  console.log(`L6 OK: LV70 hpMax = ${v.toFixed(1)}`);
}

// L7: statsAtLevel gives all stats
{
  const growth = {
    physicalAttack: { values: PA },
    hpMax: { values: HP },
    physicalDefense: { values: [7.5, 4.8, 5, 5, 5, 3.5, 3.5, 3.5, 5.5, 5.5, 5.5, 4.5, 4.5, 4.5, 4, 6, 6] },
    mpMax: { values: [140, 25, 20, 20, 20, 17.5, 17.5, 17.5, 25, 25, 25, 22.5, 22.5, 22.5, 22.5, 15, 15] },
    mpRegenSpeed: { values: [50, 2.5, 2.5, 2.5, 2.5, 2.5, 2.5, 2.5, 5, 5, 5, 3.5, 3.5, 3.5, 3.5, 3, 3] },
    hitRecovery: { values: [600, 1.5, 2, 2, 2, 1.5, 1.5, 1.5, 2, 2, 2, 1.5, 2, 2, 2, 3, 3] },
  };
  const s = statsAtLevel(growth, 70);
  assert.ok(s.physicalAttack > 80, `L7 physicalAttack > 80: ${s.physicalAttack.toFixed(1)}`);
  assert.ok(s.hpMax > 900, `L7 hpMax > 900: ${s.hpMax.toFixed(1)}`);
  console.log(`L7 OK: statsAtLevel(70) → atk=${s.physicalAttack.toFixed(1)} hp=${s.hpMax.toFixed(1)} def=${s.physicalDefense.toFixed(1)}`);
}

// L8: statsFromPlayerShard with level
{
  // Minimal shard structure
  const chr = {
    growth: {
      physicalAttack: { values: PA },
      hpMax: { values: HP },
      physicalDefense: { values: PA },
      mpMax: { values: [140] },
      mpRegenSpeed: { values: [50] },
      hitRecovery: { values: [600] },
    },
    moveSpeed: { value: 850 },
    jumpPower: { value: 430 },
  };
  const s1 = statsFromPlayerShard(chr as never, 1);
  const s70 = statsFromPlayerShard(chr as never, 70);
  assert.equal(s1.physicalAttack, 7.5, "L8 LV1 atk");
  assert.ok(s70.physicalAttack > 80, `L8 LV70 atk: ${s70.physicalAttack.toFixed(1)}`);
  assert.ok(s70.hpMax > 900, `L8 LV70 hp: ${s70.hpMax.toFixed(1)}`);
  console.log(`L8 OK: statsFromPlayerShard LV1=${s1.physicalAttack} LV70=${s70.physicalAttack.toFixed(1)}`);
}

// L9: edge cases
{
  assert.equal(statAtLevel([], 1), 0, "L9 empty array");
  assert.equal(statAtLevel([100], 50), 100, "L9 single-value (no growth)");
  assert.equal(statAtLevel(PA, 0), 7.5, "L9 level 0 → base");
  assert.equal(statAtLevel(PA, -1), 7.5, "L9 negative level → base");
  console.log("L9 OK: edge cases (empty, single-value, level≤0)");
}

console.log("\n✅ LevelScaling (Stage 4C-C1) all tests passed");
