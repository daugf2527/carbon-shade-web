#!/usr/bin/env node
/**
 * Extract PVF truth values for QA tests
 * Usage: node scripts/extract-qa-truth.mjs
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const shardPath = resolve("verification/baseline-shards/players/swordman.json");
const attacksPath = resolve("verification/baseline-shards/players/swordman-attacks.json");

function extractSwordmanTruth() {
  console.log("Reading swordman.json...");
  const swordman = JSON.parse(readFileSync(shardPath, "utf-8"));

  console.log("Reading swordman-attacks.json...");
  const attacks = JSON.parse(readFileSync(attacksPath, "utf-8"));

  const truth = {
    // Movement
    moveSpeed: swordman.moveSpeed,
    jumpPower: swordman.jumpPower,

    // Attack animations frame counts
    attack1Frames: swordman.animations?.attack1?.totalFrames ?? null,
    attack2Frames: swordman.animations?.attack2?.totalFrames ?? null,
    attack3Frames: swordman.animations?.attack3?.totalFrames ?? null,

    // Attack data
    attack1: attacks.find(a => a.attackName === "weaponcomboshort1"),
    attack2: attacks.find(a => a.attackName === "weaponcomboshort2"),
    attack3: attacks.find(a => a.attackName === "weaponcomboshort3"),

    // Growth table (level 70)
    level70: swordman.growth?.find(g => g.level === 70),

    // Critical
    criticalRate: swordman.criticalRate,
    criticalDamage: swordman.criticalDamage,
  };

  console.log("\n=== Movement ===");
  console.log(`moveSpeed: ${truth.moveSpeed}`);
  console.log(`jumpPower: ${truth.jumpPower}`);

  console.log("\n=== Attack Frames ===");
  console.log(`attack1: ${truth.attack1Frames} frames`);
  console.log(`attack2: ${truth.attack2Frames} frames`);
  console.log(`attack3: ${truth.attack3Frames} frames`);

  console.log("\n=== Attack Data ===");
  console.log(`attack1 liftUp: ${truth.attack1?.liftUp}`);
  console.log(`attack1 pushAside: ${truth.attack1?.pushAside}`);
  console.log(`attack1 damageBonus: ${truth.attack1?.damageBonus}`);
  console.log(`attack3 liftUp: ${truth.attack3?.liftUp}`);
  console.log(`attack3 pushAside: ${truth.attack3?.pushAside}`);

  console.log("\n=== Level 70 Stats ===");
  console.log(`physicalAttack: ${truth.level70?.physicalAttack}`);
  console.log(`magicalAttack: ${truth.level70?.magicalAttack}`);
  console.log(`hp: ${truth.level70?.hp}`);
  console.log(`mp: ${truth.level70?.mp}`);

  console.log("\n=== Critical ===");
  console.log(`criticalRate: ${truth.criticalRate}`);
  console.log(`criticalDamage: ${truth.criticalDamage}`);

  return truth;
}

extractSwordmanTruth();
