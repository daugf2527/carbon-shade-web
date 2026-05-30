import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync("verification/baseline-shards/players/swordman.json", "utf8"));

console.log("=== weaponHitInfo from chr ===");
const chr = data.chr;
if (chr && chr.sections) {
  const weaponHitInfoSection = chr.sections.find(s => s.name === "weapon hit info");
  if (weaponHitInfoSection) {
    console.log("Found weapon hit info section");
    console.log("Attributes count:", weaponHitInfoSection.attributes?.length);

    // weaponHitInfo 是一个数组，每个武器类型有多个属性
    // 格式: [hitEffect, bloodEffect, soundId, damageScalePct, pushBack, launch, ...]
    if (weaponHitInfoSection.attributes) {
      console.log("\nFirst 12 attributes (first weapon type):");
      for (let i = 0; i < Math.min(12, weaponHitInfoSection.attributes.length); i++) {
        const attr = weaponHitInfoSection.attributes[i];
        console.log(`  [${i}] ${attr.t}: ${attr.v}`);
      }
    }
  } else {
    console.log("No weapon hit info section found");
  }
}
