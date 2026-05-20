import { assert } from "./test-utils.js";
import { getCombatSpriteSpec, registerDnfAction } from "../../src/game/SpriteFrameLibrary.js";

function registerStubAction(name: string, frameCount: number): void {
  registerDnfAction(
    name,
    {
      source: { framesCount: frameCount, loop: false },
      frames: Array.from({ length: frameCount }, (_, index) => ({
        width: 64 + index,
        height: 96 + index,
        aniOffset: { x: -232, y: -333 },
        imgAnchor: { x: 201, y: 239 },
        delay: 100,
      })),
    } as any,
    `dnf_${name}`,
  );
}

for (const [name, frames] of [
  ["swordman_stay", 6],
  ["swordman_dash", 8],
  ["swordman_jump", 16],
  ["swordman_damage1", 1],
  ["swordman_damage2", 1],
  ["swordman_hitback", 9],
  ["swordman_down", 6],
  ["swordman_overturn", 1],
  ["swordman_attack1", 10],
  ["swordman_attack2", 11],
  ["swordman_attack3", 9],
] as const) {
  registerStubAction(name, frames);
}

function playerSpec(overrides: Partial<Parameters<typeof getCombatSpriteSpec>[0]> = {}) {
  return getCombatSpriteSpec({
    id: "player",
    action: null,
    reaction: "none",
    locomotion: "idle",
    tick: 0,
    localFrame: 1,
    dead: false,
    ...overrides,
  });
}

assert.equal(playerSpec()?.key, "dnf_swordman_stay_00", "Idle should use stay");
assert.equal(playerSpec({ locomotion: "run" })?.key, "dnf_swordman_dash_00", "Run should use dash");
assert.equal(playerSpec({ action: "Jump" })?.key, "dnf_swordman_jump_00", "Jump should use jump");
assert.equal(playerSpec({ action: "NormalBasic1" })?.key, "dnf_swordman_attack1_00", "NormalBasic1 should use attack1");
assert.equal(playerSpec({ action: "NormalBasic2" })?.key, "dnf_swordman_attack2_00", "NormalBasic2 should use attack2");
assert.equal(playerSpec({ action: "NormalBasic3" })?.key, "dnf_swordman_attack3_00", "NormalBasic3 should use attack3");
assert.equal(playerSpec({ action: "Backstep" })?.key, "dnf_swordman_damage2_00", "Backstep should use damage2");
assert.equal(playerSpec({ reaction: "light_stagger" })?.key, "dnf_swordman_damage1_00", "Light stagger should use damage1");
assert.equal(playerSpec({ reaction: "downed" })?.key, "dnf_swordman_down_00", "Downed should use down");
assert.equal(playerSpec({ reaction: "getting_up" })?.key, "dnf_swordman_overturn_00", "Getting up should use overturn");
assert.equal(playerSpec({ action: "QuickRebound", reaction: "quick_rebound" })?.key, "dnf_swordman_overturn_00", "QuickRebound should use overturn");
