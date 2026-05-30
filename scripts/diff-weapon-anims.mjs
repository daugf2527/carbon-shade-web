import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const localData = JSON.parse(readFileSync("verification/baseline-shards/players/swordman.json", "utf8"));
console.log("=== LOCAL (working tree) ===");
console.log("animations:", Object.keys(localData.animations || {}).length);
console.log("attacks:", Object.keys(localData.attacks || {}).length);
console.log("weaponAnimations:", Object.keys(localData.weaponAnimations || {}).length);
if (localData.weaponAnimations && Object.keys(localData.weaponAnimations).length > 0) {
  console.log("  sample keys:", Object.keys(localData.weaponAnimations).slice(0, 3));
}

const headJson = execSync("git show HEAD:verification/baseline-shards/players/swordman.json", { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
const headData = JSON.parse(headJson);
console.log("\n=== HEAD (committed) ===");
console.log("animations:", Object.keys(headData.animations || {}).length);
console.log("attacks:", Object.keys(headData.attacks || {}).length);
console.log("weaponAnimations:", Object.keys(headData.weaponAnimations || {}).length);
if (headData.weaponAnimations && Object.keys(headData.weaponAnimations).length > 0) {
  console.log("  sample keys:", Object.keys(headData.weaponAnimations).slice(0, 3));
  const firstKey = Object.keys(headData.weaponAnimations)[0];
  const firstAnim = headData.weaponAnimations[firstKey];
  console.log(`  first anim "${firstKey}" frames: ${firstAnim.frames?.length ?? "?"}`);
  const hasAtkBox = firstAnim.frames?.some(f => f.attackBoxes?.length > 0);
  console.log(`  first anim has attackBoxes: ${hasAtkBox}`);
}
