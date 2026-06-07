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

// L2: LV5 ≈ base + ~0.93 of segment 1 (4.3125 levels per segment)
{
  const v = statAtLevel(PA, 5);
  // growthLevels=4, segment 1 spans 0..4.3125 → covered = min(4, 4.3125) = 4
  const expected = 7.5 + 4.8 * (4 / 4.3125);
  assert.ok(Math.abs(v - expected) < 0.01, `L2 LV5: ${v} vs ${expected}`);
  console.log(`L2 OK: LV5 physicalAttack = ${v.toFixed(2)} (base + partial seg1)`);
}

// L3: LV3 = base + 2/4.3125 of segment 1 (interpolation within segment)
{
  const v = statAtLevel(PA, 3);
  const expected = 7.5 + 4.8 * (2 / 4.3125);
  assert.ok(Math.abs(v - expected) < 0.01, `L3 LV3: ${v} vs ${expected}`);
  console.log(`L3 OK: LV3 physicalAttack = ${v.toFixed(2)} (mid-segment interpolation)`);
}

// L4: LV70 (cap) = full sum of all 17 values — research doc anchor (hpMax sum=952.5=LV70)
{
  const v = statAtLevel(PA, 70);
  const expected = PA.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(v - expected) < 0.01, `L4 LV70 full sum: ${v} vs ${expected}`);
  console.log(`L4 OK: LV70 physicalAttack = ${v.toFixed(1)} (full 17-value sum = ${expected}, NO extrapolation)`);
}

// L5: LV70 is the cap — no extrapolation beyond full sum
{
  const v70 = statAtLevel(PA, 70);
  const v99 = statAtLevel(PA, 99); // clamped to LV70
  assert.equal(v70, v99, `L5 LV70 is cap: ${v70} === clamped ${v99}`);
  console.log(`L5 OK: LV70 capped at full sum ${v70.toFixed(1)} (LV99 clamps to LV70)`);
}

// L6: hpMax at LV70 = full sum
{
  const v = statAtLevel(HP, 70);
  const expected = HP.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(v - expected) < 0.1, `L6 LV70 hpMax: ${v} vs ${expected}`);
  console.log(`L6 OK: LV70 hpMax = ${v.toFixed(1)} (full sum)`);
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
  // LV70 = full sum (research anchor): physicalAttack 82.8, hpMax 952.5
  assert.ok(Math.abs(s.physicalAttack - 82.8) < 0.1, `L7 physicalAttack=82.8: ${s.physicalAttack.toFixed(1)}`);
  assert.ok(Math.abs(s.hpMax - 952.5) < 0.1, `L7 hpMax=952.5: ${s.hpMax.toFixed(1)}`);
  console.log(`L7 OK: statsAtLevel(70) → atk=${s.physicalAttack.toFixed(1)} hp=${s.hpMax.toFixed(1)} def=${s.physicalDefense.toFixed(1)} (full-sum truth)`);
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
