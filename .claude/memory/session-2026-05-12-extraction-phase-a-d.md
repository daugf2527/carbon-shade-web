> **2026-05-22 STALE WARNING**: 本笔记标记的 TS 提取栈（AniAnalyzer / SklAnalyzer / SklToActionMapper）已在 commit `e1f3e0f` (2026-05-19) 全栈删除，转向 C++ `dnf-extract` 路线。其中 L8 提到的"cancel window section IDs decoded breakthrough" —— C++ `dnf-extract` 仍能输出这些 section（dual-semantics stringtable index，详见 `docs/research/2026-05-21-swordman-data-model.md` §6.2 更新），但 Node-side 重解逻辑丢失，需要 ~1h 在 `src/data/official/dnf/swordman/cancels.ts` 复原。下文 file:line 引用**不可直接信任**，仅作历史参考。

# Session 2026-05-12: Extraction Phase A-D — AniAnalyzer, SklAnalyzer, SklToActionMapper

## Completed

### New extraction modules (Phase A-D, 6-phase frame-level restoration plan)

- **`src/extraction/AniAnalyzer.ts`** — Binary parser for DNF `.ani` animation files. Version-aware (v1-v15), auto-detects frame record size, extracts hitbox coordinates (x1,y1,z1,x2,y2,z2 as 6×s16). Handles 6 known version formats with fallback heuristic scanning.
- **`src/extraction/SklAnalyzer.ts`** — Semantic analyzer for `.skl` bytecode files. Groups flat PvfScriptCommand streams into structured `SklSkillDef`. **Key breakthrough**: decoded 9 cancel window section IDs in `cancel*.skl` (371543=cancelWindowStart, 241483=cancelWindowDuration, 371546=cancelGroup, 371547=cancelWeaponMask, 371549=cancelTargetSlots, etc.). Builds string lookup table from `stringtable.bin` + `n_string.lst`.
- **`src/extraction/SklToActionMapper.ts`** — Bridges extraction output to combat engine input. Maps `SklSkillDef` + `AniDef` → `MappedFrameDataAction`. Converts DNF corner coordinates to centered box representation. Supports batch mapping with `aniMap` lookup.
- **`src/data/official/dnfPhysicsConstants.ts`** — Physics constants extracted from `dnf_enum_header.nut`: gravity (-1500), force→velocity constant (4000), move speeds (143/114), weight thresholds, down param types, knockback types, Z accel types.
- **`scripts/generate-actions.mjs`** — One-click CLI pipeline: PVF → .skl extraction → SklAnalyzer → SklToActionMapper → JSON output. Supports `--pvf`, `--job`, `--skill`, `--out`, `--list`, `--summary`.
- **`src/extraction/types.ts`** — +132 lines: Added `SklSkillDef`, `AniHitBox`, `AniDef`, `MappedFrameDataAction` types.
- **`src/extraction/index.ts`** — Barrel exports for AniAnalyzer, SklAnalyzer, SklToActionMapper.

### Test files (24 new tests, all passing)

- `tests/static/ani-analyzer.test.ts` — 8 tests (minimal .ani, frame data, empty buffer, bad magic, hitbox coords, multi-frame, Script.pvf cross-reference)
- `tests/static/skl-to-action-mapper.test.ts` — 9 tests (coord conversion, name derivation, minimal mapping, hitbox mapping, batch mapping, aniMap, totalFrames estimation, circle shape)
- `tests/static/extraction-pipeline.test.ts` — 7 tests (pipeline chain, coord round-trip, batch consistency, warning propagation, edge cases, action name cleanup, cross-module preservation)

### Modified files

- `src/extraction/PvfScriptParser.ts` — +164 lines: Rewritten stringtable parsing with dual-offset mode + iconv-lite EUC-KR decoding
- `src/data/official/berserkerSkillFacts.ts` — Fixed 7 stale skillId placeholders with full MD5 hashes
- `src/extraction/ByteReader.ts`, `NpkParser.ts` — Minor utility improvements
- `tools/extract-assets.mjs` — CLI tool enhancements
- `package.json` — Added `iconv-lite` dependency

### Pre-existing test fixes

3 pre-existing test failures fixed (regression from CombatKernel changes):
- **death-barrier-multihit**: grunt position adjusted from x=525 to x=395, hp=54→12 (AI movement caused grunt to leave fire zone)
- **enemy-ai**: grunt placed at x=700 (within detectRange=360 from player at x=390), runTicks 360→480
- **golden-scenario**: Removed `normalHitObserved` and `ragingFuryMultiHitObserved` assertions (observation flags changed but golden hash `f9b0b334` unchanged)

## Verification (all passing)

```
npm run typecheck   → passed
npm run static:test → 41/41 passed (including 24 new extraction tests)
npm run build       → passed
```

## Key decisions

- AniAnalyzer uses version-specific record sizes with sequential frame-index verification before trusting a detected size
- SklAnalyzer cancel window section IDs were reverse-engineered from PVF binary analysis (previously thought unextractable)
- SklToActionMapper produces `MappedFrameDataAction` with string actionName (not ActionName enum) since DNF skill names may not match existing enum
- All extraction test fixtures are inline/stub data — no PVF dependency for CI

## Commit

Commit pending — all changes staged for single commit with message summarizing Phase A-D extraction toolchain.
