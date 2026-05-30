import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync("verification/baseline-shards/players/swordman.json", "utf8"));

console.log("=== Animations ===");
const aniKeys = Object.keys(data.animations || {});
console.log(`Total: ${aniKeys.length}`);
console.log("Keys:", aniKeys.slice(0, 20).join(", "));

console.log("\n=== Dash animation ===");
const dash = data.animations?.dash;
if (dash) {
  console.log(`Frames: ${dash.frames?.length}`);
  console.log(`Duration: ${dash.duration}`);
  console.log(`Loop: ${dash.loop}`);

  // Check cancel windows
  if (dash.frames && dash.frames.length > 0) {
    const cancelFrames = dash.frames.filter(f => f.cancelInto && f.cancelInto.length > 0);
    console.log(`Cancel frames: ${cancelFrames.length}`);
    if (cancelFrames.length > 0) {
      console.log("Sample cancel:", JSON.stringify(cancelFrames[0].cancelInto, null, 2));
    }
  }
} else {
  console.log("No dash animation found");
}

console.log("\n=== Dashattack animation ===");
const dashattack = data.animations?.dashattack;
if (dashattack) {
  console.log(`Frames: ${dashattack.frames?.length}`);
  console.log(`Duration: ${dashattack.duration}`);
} else {
  console.log("No dashattack animation found");
}
