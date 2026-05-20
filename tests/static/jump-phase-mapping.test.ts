import { assert } from "./test-utils.js";
import { getCombatSpriteSpec, registerDnfAction } from "../../src/game/SpriteFrameLibrary.js";

registerDnfAction(
  "swordman_jump",
  {
    source: { framesCount: 16, loop: false },
    frames: [
      { width: 64, height: 100, aniOffset: { x: -232, y: -333 }, imgAnchor: { x: 201, y: 239 }, delay: 100 },
      { width: 64, height: 112, aniOffset: { x: -232, y: -333 }, imgAnchor: { x: 202, y: 229 }, delay: 100 },
      { width: 65, height: 80, aniOffset: { x: -232, y: -333 }, imgAnchor: { x: 200, y: 233 }, delay: 80 },
      { width: 65, height: 80, aniOffset: { x: -232, y: -333 }, imgAnchor: { x: 200, y: 233 }, delay: 80 },
      { width: 65, height: 80, aniOffset: { x: -232, y: -333 }, imgAnchor: { x: 200, y: 233 }, delay: 80 },
      { width: 65, height: 80, aniOffset: { x: -232, y: -333 }, imgAnchor: { x: 200, y: 233 }, delay: 80 },
      { width: 65, height: 80, aniOffset: { x: -232, y: -333 }, imgAnchor: { x: 200, y: 233 }, delay: 80 },
      { width: 65, height: 80, aniOffset: { x: -232, y: -333 }, imgAnchor: { x: 200, y: 233 }, delay: 10000 },
      { width: 70, height: 110, aniOffset: { x: -232, y: -333 }, imgAnchor: { x: 201, y: 231 }, delay: 100 },
      { width: 79, height: 112, aniOffset: { x: -232, y: -333 }, imgAnchor: { x: 201, y: 229 }, delay: 80 },
      { width: 79, height: 112, aniOffset: { x: -232, y: -333 }, imgAnchor: { x: 201, y: 229 }, delay: 80 },
      { width: 79, height: 112, aniOffset: { x: -232, y: -333 }, imgAnchor: { x: 201, y: 229 }, delay: 80 },
      { width: 79, height: 112, aniOffset: { x: -232, y: -333 }, imgAnchor: { x: 201, y: 229 }, delay: 80 },
      { width: 79, height: 112, aniOffset: { x: -232, y: -333 }, imgAnchor: { x: 201, y: 229 }, delay: 80 },
      { width: 79, height: 112, aniOffset: { x: -232, y: -333 }, imgAnchor: { x: 201, y: 229 }, delay: 10000 },
      { width: 71, height: 100, aniOffset: { x: -232, y: -333 }, imgAnchor: { x: 201, y: 239 }, delay: 50 },
    ],
  } as any,
  "dnf_swordman_jump",
);

function jumpKeyAt(localFrame: number): string {
  const spec = getCombatSpriteSpec({
    id: "player",
    action: "Jump",
    reaction: "neutral",
    locomotion: "idle",
    tick: 0,
    localFrame,
    dead: false,
  });
  assert.ok(spec, `Jump localFrame=${localFrame} should resolve to a sprite spec`);
  return spec!.key;
}

const ascentKey = jumpKeyAt(18);
const descentKey = jumpKeyAt(39);
const landingKey = jumpKeyAt(60);

assert.match(ascentKey, /^dnf_swordman_jump_0[2-7]$/, "Jump ascent should stay in the airborne rise/hold phase");
assert.match(descentKey, /^dnf_swordman_jump_0[8-9]$|^dnf_swordman_jump_1[0-4]$/, "Jump descent should advance into the falling phase");
assert.equal(landingKey, "dnf_swordman_jump_15", "Late Jump recovery should land on the final touchdown frame");
