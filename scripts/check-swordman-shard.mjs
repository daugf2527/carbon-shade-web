import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync("verification/baseline-shards/players/swordman.json", "utf8"));

console.log("Top-level keys:", Object.keys(data).join(", "));
console.log("animations count:", Object.keys(data.animations || {}).length);
console.log("attacks count:", Object.keys(data.attacks || {}).length);
console.log("weaponAnimations count:", Object.keys(data.weaponAnimations || {}).length);

if (data.weaponAnimations && Object.keys(data.weaponAnimations).length > 0) {
  console.log("Sample weaponAnim keys:", Object.keys(data.weaponAnimations).slice(0, 5).join(", "));
}

// Check attack1 animation has frames
const ani = data.animations?.attack1;
if (ani) {
  console.log(`\nattack1 frames: ${ani.frames?.length}`);
  const hasAtk = ani.frames?.some(f => f.attackBoxes?.length > 0);
  console.log("attack1 any frame has attackBoxes:", hasAtk);
}
