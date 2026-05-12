// extraction-pipeline.test.ts — End-to-end regression tests for the extraction/mapping pipeline.
// Phase 6 of 6-phase frame-level restoration plan.
// All tests use inline stub data for deterministic CI (no PVF dependency).

import { assert } from "./test-utils.js";
import { SklToActionMapper } from "../../src/extraction/SklToActionMapper.js";
import type { SklSkillDef, AniDef, AniHitBox, MappedFrameDataAction } from "../../src/extraction/types.js";

// ── Stub factories (self-contained, no cross-file imports) ──

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

// ── Helpers ──

/** Verify all required fields of MappedFrameDataAction are present (non-undefined, non-null) */
function assertValidShape(action: MappedFrameDataAction): void {
  assert.ok(typeof action.actionName === "string", "actionName must be string");
  assert.ok(typeof action.totalFrames === "number" && action.totalFrames > 0, "totalFrames must be positive number");
  assert.ok(Array.isArray(action.startup), "startup must be array");
  assert.ok(Array.isArray(action.active), "active must be array");
  assert.ok(typeof action.skillId === "number", "skillId must be number");
  assert.ok(Array.isArray(action.warnings), "warnings must be array");
}

// ── Tests ──

// Test 1: Pipeline chain — full skill+ani → MappedFrameDataAction shape validation
{
  const skl = stubSkl({ coolTimeMs: 8000, consumeMp: 120 });
  const hb = stubHitBox({ frameStart: 5, frameEnd: 10, damageRate: 150 });
  const ani = stubAni({ totalFrames: 45, hitBoxes: [hb] });
  const result = SklToActionMapper.map(skl, ani);

  assertValidShape(result);
  assert.equal(result.actionName, "TestSkill");
  assert.equal(result.totalFrames, 45);
  assert.equal(result.active.length, 1);
  assert.equal(result.cooldownMs, 8000);
  assert.equal(result.mpCost, 120);
  assert.equal(result.skillId, 100);
  assert.equal(result.sourceSklPath, "test.skl");
}

// Test 2: Coordinate conversion round-trip — symmetry verification
{
  // Symmetric hitbox: centered at origin, equal size in all dimensions
  const hb = stubHitBox({ x1: -60, y1: -60, z1: -60, x2: 60, y2: 60, z2: 60 });
  const coords = SklToActionMapper.convertHitboxCoords(hb);
  assert.equal(coords.x, 0, "Symmetric X → center at 0");
  assert.equal(coords.y, 0, "Symmetric Y → center at 0");
  assert.equal(coords.z, 0, "Symmetric Z → center at 0");
  assert.equal(coords.w, 120, "Width = 120");
  assert.equal(coords.h, 120, "Height = 120");
  assert.equal(coords.d, 120, "Depth = 120");

  // Positive-only hitbox (no negative coords)
  const hb2 = stubHitBox({ x1: 10, y1: 20, z1: 30, x2: 110, y2: 120, z2: 130 });
  const coords2 = SklToActionMapper.convertHitboxCoords(hb2);
  assert.equal(coords2.x, 60, "Center X = (10+110)/2");
  assert.equal(coords2.w, 100, "Width = 100");
}

// Test 3: Batch mapping consistency — each output has unique skillId
{
  const skills = [
    stubSkl({ skillId: 1, name: "A" }),
    stubSkl({ skillId: 2, name: "B" }),
    stubSkl({ skillId: 3, name: "C" }),
    stubSkl({ skillId: 4, name: "D" }),
    stubSkl({ skillId: 5, name: "E" }),
  ];
  const results = SklToActionMapper.mapBatch(skills);
  assert.equal(results.length, 5);
  const ids = results.map(r => r.skillId);
  const uniqueIds = new Set(ids);
  assert.equal(uniqueIds.size, 5, "All 5 skills should have unique skillIds");
  // Verify each output is valid
  results.forEach(r => assertValidShape(r));
}

// Test 4: Warning propagation — skill without .ani → expected warning
{
  const skl = stubSkl();
  const result = SklToActionMapper.map(skl, undefined);
  assert.ok(result.warnings.length > 0, "Should have at least one warning");
  assert.ok(
    result.warnings.some(w => w.toLowerCase().includes("no .ani") || w.toLowerCase().includes("ani data")),
    "Warning should mention missing .ani data"
  );
}

// Test 5: totalFrames estimation edge cases
{
  // Case A: .ani provides totalFrames
  const aniA = stubAni({ totalFrames: 42 });
  assert.equal(SklToActionMapper.estimateTotalFrames(aniA), 42);

  // Case B: fallback from rawSection size (720 bytes / 36 ≈ 20)
  const aniB = stubAni({ totalFrames: 0, rawSections: [{ type: "frameData", offset: 64, size: 720 }] });
  assert.equal(SklToActionMapper.estimateTotalFrames(aniB), 20, "720/36 = 20");

  // Case C: tiny rawSection → floor at 10
  const aniC = stubAni({ totalFrames: 0, rawSections: [{ type: "frameData", offset: 64, size: 36 }] });
  assert.equal(SklToActionMapper.estimateTotalFrames(aniC), 10, "36/36=1, floor at 10");

  // Case D: no data → absolute fallback 30
  const aniD = stubAni({ totalFrames: 0, rawSections: [] });
  assert.equal(SklToActionMapper.estimateTotalFrames(aniD), 30);
}

// Test 6: Action name edge cases
{
  // Empty name → fallback to Skill_<id>
  const skl1 = stubSkl({ name: "", skillId: 999 });
  assert.equal(SklToActionMapper.deriveActionName(skl1), "Skill_999");

  // Path-like name → clean up
  const skl2 = stubSkl({ name: "path/to/skill_bremen.skl", skillId: 10 });
  const name2 = SklToActionMapper.deriveActionName(skl2);
  assert.ok(!name2.includes("/"), "Should not contain path separators");
  assert.ok(!name2.includes(".skl"), "Should not contain .skl extension");

  // Normal name
  const skl3 = stubSkl({ name: "RagingFury", skillId: 200 });
  assert.equal(SklToActionMapper.deriveActionName(skl3), "RagingFury");
}

// Test 7: Cross-module consistency — skillId and sourcePath preserved through pipeline
{
  const skl = stubSkl({
    skillId: 777,
    name: "CrossCheck",
    sourcePath: "skill/swordman/crosscheck.skl",
  });
  const hb = stubHitBox({ frameStart: 3, frameEnd: 8 });
  const ani = stubAni({ hitBoxes: [hb], sourcePath: "ani/crosscheck.ani" });

  const result = SklToActionMapper.map(skl, ani);

  // Verify preservation
  assert.equal(result.skillId, skl.skillId, "skillId must be preserved");
  assert.equal(result.sourceSklPath, skl.sourcePath, "sourceSklPath must be preserved");
  assert.ok(result.sourceAniPaths!.includes(ani.sourcePath!), "sourceAniPaths must include .ani path");
  assert.equal(result.cooldownMs, skl.coolTimeMs, "cooldownMs must be preserved");
  assert.equal(result.castTimeMs, skl.castTimeMs, "castTimeMs must be preserved");
  assert.equal(result.mpCost, skl.consumeMp, "mpCost must be preserved");
  assertValidShape(result);
}

console.log("PASS: extraction-pipeline tests (7/7)");
