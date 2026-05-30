import { execSync } from "node:child_process";

const jobs = [
  "atfighter", "atgunner", "atmage", "creatormage", "demonicswordman",
  "fighter", "gunner", "mage", "priest", "swordman", "thief"
];

console.log("Job | HEAD Animations | HEAD Attacks | HEAD WeaponAnims");
console.log("----|-----------------|--------------|------------------");

for (const job of jobs) {
  try {
    const headJson = execSync(`git show HEAD:verification/baseline-shards/players/${job}.json`, {
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024
    });
    const data = JSON.parse(headJson);
    const aniCount = Object.keys(data.animations || {}).length;
    const atkCount = Object.keys(data.attacks || {}).length;
    const wpnCount = Object.keys(data.weaponAnimations || {}).length;
    console.log(`${job.padEnd(16)} | ${String(aniCount).padStart(15)} | ${String(atkCount).padStart(12)} | ${String(wpnCount).padStart(16)}`);
  } catch (err) {
    console.log(`${job.padEnd(16)} | ERROR: ${err.message.split('\n')[0]}`);
  }
}
