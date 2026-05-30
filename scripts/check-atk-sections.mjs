import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync("verification/baseline-shards/players/swordman.json", "utf8"));

console.log("=== Attack1/2/3 .atk 数据 ===\n");

for (const atkName of ["attack1", "attack2", "attack3"]) {
  const atk = data.attacks[atkName];
  if (!atk) {
    console.log(`${atkName}: NOT FOUND\n`);
    continue;
  }

  console.log(`${atkName}:`);
  console.log(`  path: ${atk.path}`);

  if (atk.sections) {
    console.log(`  sections (${atk.sections.length}):`);
    for (const section of atk.sections) {
      console.log(`    - ${section.name}: ${section.attributes?.length || 0} attributes`);

      // 查找可能包含 cancel 信息的 section
      if (section.name.includes("cancel") || section.name.includes("command") || section.name.includes("input")) {
        console.log(`      *** FOUND CANCEL SECTION ***`);
        if (section.attributes && section.attributes.length > 0) {
          console.log(`      Attributes:`, JSON.stringify(section.attributes.slice(0, 5), null, 2));
        }
      }
    }
  }
  console.log();
}

console.log("\n=== 所有 section 名称（去重）===");
const allSections = new Set();
for (const atkKey of Object.keys(data.attacks)) {
  const atk = data.attacks[atkKey];
  if (atk.sections) {
    for (const section of atk.sections) {
      allSections.add(section.name);
    }
  }
}
const sortedSections = Array.from(allSections).sort();
console.log(sortedSections.join("\n"));
