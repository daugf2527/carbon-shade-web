import { readdirSync, readFileSync } from "node:fs";

const playerFiles = readdirSync("verification/baseline-shards/players").filter(f => f.endsWith(".json"));

console.log("Job | Animations | Attacks | WeaponAnims");
console.log("----|------------|---------|------------");

for (const file of playerFiles) {
  const data = JSON.parse(readFileSync(`verification/baseline-shards/players/${file}`, "utf8"));
  const job = data.job || "?";
  const aniCount = Object.keys(data.animations || {}).length;
  const atkCount = Object.keys(data.attacks || {}).length;
  const wpnCount = Object.keys(data.weaponAnimations || {}).length;
  console.log(`${job.padEnd(16)} | ${String(aniCount).padStart(10)} | ${String(atkCount).padStart(7)} | ${String(wpnCount).padStart(11)}`);
}
