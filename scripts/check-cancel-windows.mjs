import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync("verification/baseline-shards/players/swordman.json", "utf8"));

console.log("=== Attack animations cancel data ===\n");

const attackAnims = ["attack1", "attack2", "attack3"];
for (const aniName of attackAnims) {
  const ani = data.animations[aniName];
  if (!ani) {
    console.log(`${aniName}: NOT FOUND`);
    continue;
  }

  console.log(`${aniName}:`);
  console.log(`  Total frames: ${ani.frames?.length}`);

  // 检查每一帧的 delay 和 cancelInto
  if (ani.frames) {
    let totalDelay = 0;
    for (let i = 0; i < ani.frames.length; i++) {
      const frame = ani.frames[i];
      totalDelay += frame.delay || 0;

      if (frame.cancelInto && frame.cancelInto.length > 0) {
        console.log(`  Frame ${i}: delay=${frame.delay}ms, totalDelay=${totalDelay}ms, cancelInto=${JSON.stringify(frame.cancelInto)}`);
      }
    }
    console.log(`  Total duration: ${totalDelay}ms`);
  }
  console.log();
}

console.log("=== Hardattack animation ===\n");
const hardattack = data.animations.hardattack;
if (hardattack) {
  console.log(`hardattack:`);
  console.log(`  Total frames: ${hardattack.frames?.length}`);
  console.log(`  Loop: ${hardattack.loop}`);

  if (hardattack.frames && hardattack.frames.length > 0) {
    console.log(`  First 3 frames:`);
    for (let i = 0; i < Math.min(3, hardattack.frames.length); i++) {
      const f = hardattack.frames[i];
      console.log(`    [${i}] delay=${f.delay}ms, attackBoxes=${f.attackBoxes?.length || 0}, damageBoxes=${f.damageBoxes?.length || 0}`);
    }
  }
} else {
  console.log("hardattack: NOT FOUND");
}
