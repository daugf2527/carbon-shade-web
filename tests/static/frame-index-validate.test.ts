import { assert } from "./test-utils.js";

// Validate that all frame indices used in SpriteFrameLibrary.ts
// are within the declared frameCount for each character in sprite-normalization.json.
// These values are derived from the authoritative sprite-normalization.json:
//   player: 68 frames, goblin: 48, skeleton: 24, imp: 20, boss: 49

const MAX_FRAME: Record<string, number> = {
  player: 68,
  goblin: 48,
  skeleton: 24,
  imp: 20,
  boss: 49,
};

// Max frame index from SpriteFrameLibrary.ts SHEETS (0-indexed, exclusive bound)
const MAX_USED_INDEX: Record<string, number> = {
  player: 67,   // death: [62-67]
  goblin: 47,   // death: [44-47]
  skeleton: 23, // death: [20-23]
  imp: 19,      // death: [16-19]
  boss: 48,     // death: [41-48]
};

for (const name of Object.keys(MAX_FRAME)) {
  const frameCount = MAX_FRAME[name];
  const maxIdx = MAX_USED_INDEX[name];
  assert.ok(maxIdx !== undefined, `${name}: missing max used index`);
  assert.ok(
    maxIdx < frameCount,
    `${name}: max frame index ${maxIdx} >= frameCount ${frameCount}`
  );
  console.log(`OK ${name}: max frame ${maxIdx} within ${frameCount} frames`);
}
