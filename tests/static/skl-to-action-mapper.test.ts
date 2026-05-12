// skl-to-action-mapper.test.ts — Tests for SklToActionMapper.
// Maps SklSkillDef + AniDef → MappedFrameDataAction.

import { assert } from "./test-utils.js";
import { SklToActionMapper } from "../../src/extraction/SklToActionMapper.js";
import type { SklSkillDef, AniDef, AniHitBox } from "../../src/extraction/types.js";

// ── Helpers ──

function stubSkl(overrides: Partial<SklSkillDef> = {}): SklSkillDef {
  return {
    skillId: "skillId" in overrides ? overrides.skillId! : 100,
    name: "name" in overrides ? overrides.name : "TestSkill",
    jobId: "jobId" in overrides ? overrides.jobId! : 1,
    coolTimeMs: "coolTimeMs" in overrides ? overrides.coolTimeMs! : 5000,
    castTimeMs: "castTimeMs" in overrides ? overrides.castTimeMs! : 300,
    consumeMp: "consumeMp" in overrides ? overrides.consumeMp! : 50,
    cubeCost: "cubeCost" in overrides ? overrides.cubeCost! : 1,
    maxLevel: "maxLevel" in overrides ? overrides.maxLevel! : 20,
    aniFileRefs: "aniFileRefs" in overrides ? overrides.aniFileRefs! : ["test.ani"],
    sourcePath: "sourcePath" in overrides ? overrides.sourcePath! : "test.skl",
    commandCount: "commandCount" in overrides ? overrides.commandCount! : 100,
    magicValid: "magicValid" in overrides ? overrides.magicValid! : true,
  };
}

function stubAni(overrides: Partial<AniDef> = {}): AniDef {
  return {
    imgPath: overrides.imgPath ?? "Character/Swordman/Test.img",
    totalFrames: overrides.totalFrames ?? 30,
    hitBoxes: overrides.hitBoxes ?? [],
    rawSections: overrides.rawSections ?? [],
    sourcePath: overrides.sourcePath ?? "test.ani",
    parseWarnings: overrides.parseWarnings ?? [],
  };
}

function stubHitBox(overrides: Partial<AniHitBox> = {}): AniHitBox {
  return {
    shape: overrides.shape ?? "rect",
    frameStart: overrides.frameStart ?? 5,
    frameEnd: overrides.frameEnd ?? 10,
    x1: overrides.x1 ?? -50,
    y1: overrides.y1 ?? -100,
    z1: overrides.z1 ?? 0,
    x2: overrides.x2 ?? 50,
    y2: overrides.y2 ?? 10,
    z2: overrides.z2 ?? 80,
    damageRate: overrides.damageRate ?? 100,
  };
}

// ── Tests ──

// Test 1: Coordinate conversion (DNF corner → combat center)
{
  const hb = stubHitBox({ x1: -50, y1: -100, z1: 0, x2: 50, y2: 10, z2: 80 });
  const coords = SklToActionMapper.convertHitboxCoords(hb);
  assert.equal(coords.x, 0, "Center X: (-50+50)/2 = 0");
  assert.equal(coords.y, -45, "Center Y: (-100+10)/2 = -45");
  assert.equal(coords.z, 40, "Center Z: (0+80)/2 = 40");
  assert.equal(coords.w, 100, "Width: abs(50-(-50)) = 100");
  assert.equal(coords.h, 110, "Height: abs(10-(-100)) = 110");
  assert.equal(coords.d, 80, "Depth: abs(80-0) = 80");
}

// Test 2: Action name derivation with name
{
  const skl = stubSkl({ name: "RagingFury", skillId: 200 });
  const name = SklToActionMapper.deriveActionName(skl);
  assert.equal(name, "RagingFury", "Should use name when available");
}

// Test 3: Action name derivation fallback to skillId
{
  const skl = stubSkl({ name: undefined, skillId: 300 });
  const name = SklToActionMapper.deriveActionName(skl);
  assert.equal(name, "Skill_300", "Should fallback to Skill_<id>");
}

// Test 4: Minimal mapping (skill only, no .ani)
{
  const skl = stubSkl();
  const result = SklToActionMapper.map(skl);
  assert.ok(result, "Should return MappedFrameDataAction");
  assert.equal(result.actionName, "TestSkill");
  assert.equal(result.totalFrames, 30, "Default 30 frames without .ani");
  assert.equal(result.active.length, 0, "No hitboxes without .ani");
  assert.equal(result.cooldownMs, 5000);
  assert.equal(result.mpCost, 50);
  assert.equal(result.skillId, 100);
  assert.ok(result.warnings.some(w => w.includes("No .ani data")), "Should warn about missing .ani");
}

// Test 5: Mapping with .ani data (hitboxes)
{
  const skl = stubSkl({ coolTimeMs: 8000, consumeMp: 120 });
  const hb = stubHitBox({ frameStart: 5, frameEnd: 10, damageRate: 150 });
  const ani = stubAni({ totalFrames: 45, hitBoxes: [hb] });
  const result = SklToActionMapper.map(skl, ani);

  assert.ok(result);
  assert.equal(result.actionName, "TestSkill");
  assert.equal(result.totalFrames, 45, "Should use .ani totalFrames");
  assert.equal(result.active.length, 1, "Should have 1 hitbox");
  assert.equal(result.active[0]!.start, 5);
  assert.equal(result.active[0]!.end, 10);
  assert.equal(result.active[0]!.baseDamage, 150);
  assert.equal(result.active[0]!.shape, "rect");
  assert.equal(result.castTimeMs, 300);
}

// Test 6: Batch mapping
{
  const skills = [
    stubSkl({ skillId: 1, name: "Skill_A" }),
    stubSkl({ skillId: 2, name: "Skill_B" }),
    stubSkl({ skillId: 3, name: "Skill_C", aniFileRefs: [] }),
  ];
  const results = SklToActionMapper.mapBatch(skills);
  assert.equal(results.length, 3, "Should map all 3 skills");
  assert.equal(results[0]!.skillId, 1);
  assert.equal(results[1]!.skillId, 2);
  assert.equal(results[2]!.skillId, 3);
  // All should have no .ani warning
  results.forEach(r => {
    assert.ok(r.warnings.some(w => w.includes("No .ani data")), "Each should warn about missing .ani");
  });
}

// Test 7: Batch mapping with aniMap
{
  const skills = [
    stubSkl({ skillId: 10, name: "MatchSkill", aniFileRefs: ["match.ani"] }),
    stubSkl({ skillId: 11, name: "NoMatchSkill", aniFileRefs: ["nomatch.ani"] }),
  ];
  const hitbox = stubHitBox({ frameStart: 3, frameEnd: 8, x1: -30, x2: 30 });
  const matchedAni = stubAni({ totalFrames: 25, hitBoxes: [hitbox], sourcePath: "match.ani" });
  const aniMap = new Map<string, AniDef>();
  aniMap.set("match.ani", matchedAni);

  const results = SklToActionMapper.mapBatch(skills, aniMap);
  assert.equal(results.length, 2);
  // First skill should have matched .ani
  assert.equal(results[0]!.skillId, 10);
  assert.equal(results[0]!.active.length, 1, "Matched skill should have hitbox");
  assert.equal(results[0]!.totalFrames, 25);
  // Second skill should fallback (no .ani match)
  assert.equal(results[1]!.skillId, 11);
  assert.equal(results[1]!.active.length, 0, "Unmatched skill should have no hitboxes");
}

// Test 8: estimateTotalFrames with various inputs
{
  // totalFrames from .ani
  const aniWithFrames = stubAni({ totalFrames: 42 });
  assert.equal(SklToActionMapper.estimateTotalFrames(aniWithFrames), 42);

  // Fallback from rawSection size
  const aniWithRaw = stubAni({
    totalFrames: 0,
    rawSections: [{ type: "frameData", offset: 64, size: 720 }],
  });
  const estimated = SklToActionMapper.estimateTotalFrames(aniWithRaw);
  assert.equal(estimated, 20, "720/36 = 20");

  // Small rawSection → floor at 10
  const aniSmall = stubAni({
    totalFrames: 0,
    rawSections: [{ type: "frameData", offset: 64, size: 72 }],
  });
  assert.equal(SklToActionMapper.estimateTotalFrames(aniSmall), 10, "72/36=2, floor at 10");

  // No data → absolute fallback
  const aniEmpty = stubAni({ totalFrames: 0, rawSections: [] });
  assert.equal(SklToActionMapper.estimateTotalFrames(aniEmpty), 30);
}

// Test 9: Circular hitbox shape
{
  const hb = stubHitBox({ shape: "circle", x1: 0, y1: 0, z1: 0, x2: 50, y2: 50, z2: 50 });
  const skl = stubSkl();
  const ani = stubAni({ hitBoxes: [hb] });
  const result = SklToActionMapper.map(skl, ani);

  assert.equal(result.active.length, 1);
  assert.equal(result.active[0]!.shape, "circle");
}

console.log("PASS: skl-to-action-mapper tests (9/9)");
