import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync("verification/baseline-shards/players/swordman.json", "utf8"));

console.log("=== Attacks table ===\n");
const attacks = data.attacks || {};
const attackKeys = Object.keys(attacks);
console.log(`Total attacks: ${attackKeys.length}`);
console.log(`Keys: ${attackKeys.slice(0, 20).join(", ")}\n`);

// 查找 attack1/2/3 相关的 atk
const targetAttacks = attackKeys.filter(k => k.includes("attack") || k.includes("normalattack") || k.includes("basic"));
console.log(`Attack-related keys (${targetAttacks.length}):`);
for (const key of targetAttacks.slice(0, 10)) {
  console.log(`  ${key}`);
}

console.log("\n=== Attack1 detail ===");
// 尝试几个可能的 key
const possibleKeys = ["attack1", "normalattack1", "basicattack1", "attack_1"];
for (const key of possibleKeys) {
  if (attacks[key]) {
    console.log(`Found: ${key}`);
    const atk = attacks[key];
    console.log(JSON.stringify(atk, null, 2).slice(0, 500));
    break;
  }
}

// 如果没找到，显示第一个 attack
if (!possibleKeys.some(k => attacks[k])) {
  const firstAttack = targetAttacks[0];
  if (firstAttack) {
    console.log(`Using first attack key: ${firstAttack}`);
    console.log(JSON.stringify(attacks[firstAttack], null, 2).slice(0, 500));
  }
}
