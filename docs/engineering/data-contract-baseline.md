# Data Contract Baseline (Stage 1 shard fields)

**生成时间**: 2026-05-29T03:01:48.804Z  
**生成脚本**: `scripts/data-contract-audit.mjs`  
**扫描范围**: 16 shards, 843 unique field paths  
**分类原则**: producer/consumer 实测 grep, heuristic 给建议 (keep/sidecar/delete), **review override 优先**

## 元摘要

| 指标 | 值 |
|------|-----|
| Shard 总字节 | 5.35 MB |
| 字段总数 (unique paths) | 843 |
| **keep** (runtime 真消费) | 377 (45%) |
| **sidecar** (仅 tests/scripts 读) | 381 (45%) |
| **delete** (0 消费 or producer-only) | 85 (10%) |
| sidecar 估算字节 | 888.9 KB (16% of shard) |
| delete 估算字节 | 2.47 MB (46% of shard) |
| Phase 2 .bin 候选体积 | 2.01 MB (keep only) |

## 一、🗑️ delete 候选 (0 runtime consumer)

| field path | shards | types | producers | runtime | audit | tests | scripts | reason | sample |
|------------|--------|-------|-----------|---------|-------|-------|---------|--------|--------|
| `chr.attackInfo.attackBase[].raw` | 11 | string | 16 | 17 | 1 | 16 | 7 | key 过于通用 — Stage 1 audit 实测 dnf-native runtime 无消费 | atattackinfo/attack1.atk |
| `chr.attackInfo.dashAttack.raw` | 11 | string | 16 | 17 | 1 | 16 | 7 | key 过于通用 — Stage 1 audit 实测 dnf-native runtime 无消费 | atattackinfo/dashattack.atk |
| `chr.attackInfo.etc[].raw` | 11 | string | 16 | 17 | 1 | 16 | 7 | key 过于通用 — Stage 1 audit 实测 dnf-native runtime 无消费 | atattackinfo/crashlowkick.atk |
| `chr.attackInfo.jumpAttack.raw` | 11 | string | 16 | 17 | 1 | 16 | 7 | key 过于通用 — Stage 1 audit 实测 dnf-native runtime 无消费 | atattackinfo/jumpattack.atk |
| `chr.awakening.names[][]` | 11 | string | 0 | 0 | 0 | 0 | 0 | OOS — 70-cap PVE 范围外 (awakening Lv75+ / worldmap 现 |  |
| `chr.awakening.skillSlots[]` | 11 | array(empty) | 1 | 2 | 1 | 1 | 1 | OOS — 70-cap PVE 范围外 (awakening Lv75+ / worldmap 现 |  |
| `chr.awakening.tier1SlotCounts[]` | 11 | number | 1 | 2 | 1 | 1 | 1 | OOS — 70-cap PVE 范围外 (awakening Lv75+ / worldmap 现 | 0 |
| `chr.awakening.tier2SlotCounts[]` | 11 | number | 1 | 2 | 1 | 1 | 1 | OOS — 70-cap PVE 范围外 (awakening Lv75+ / worldmap 现 | 0 |
| `chr.motionRefs.back motion[].raw` | 11 | string | 16 | 17 | 1 | 16 | 7 | key 过于通用 — Stage 1 audit 实测 dnf-native runtime 无消费 | atanimation/liftupper.ani |
| `chr.motionRefs.buff motion[].raw` | 11 | string | 16 | 17 | 1 | 16 | 7 | key 过于通用 — Stage 1 audit 实测 dnf-native runtime 无消费 | atanimation/buff.ani |
| `chr.motionRefs.damage motion 1[].raw` | 11 | string | 16 | 17 | 1 | 16 | 7 | key 过于通用 — Stage 1 audit 实测 dnf-native runtime 无消费 | atanimation/damage1.ani |
| `chr.motionRefs.damage motion 2[].raw` | 11 | string | 16 | 17 | 1 | 16 | 7 | key 过于通用 — Stage 1 audit 实测 dnf-native runtime 无消费 | atanimation/damage2.ani |
| `chr.motionRefs.dash motion[].raw` | 11 | string | 16 | 17 | 1 | 16 | 7 | key 过于通用 — Stage 1 audit 实测 dnf-native runtime 无消费 | atanimation/dash.ani |
| `chr.motionRefs.dashattack motion[].raw` | 11 | string | 16 | 17 | 1 | 16 | 7 | key 过于通用 — Stage 1 audit 实测 dnf-native runtime 无消费 | atanimation/dashattack.ani |
| `chr.motionRefs.down motion[].raw` | 11 | string | 16 | 17 | 1 | 16 | 7 | key 过于通用 — Stage 1 audit 实测 dnf-native runtime 无消费 | atanimation/down.ani |
| `chr.motionRefs.etc motion[].raw` | 11 | string | 16 | 17 | 1 | 16 | 7 | key 过于通用 — Stage 1 audit 实测 dnf-native runtime 无消费 | atanimation/crouch.ani |
| `chr.motionRefs.getitem motion[].raw` | 11 | string | 16 | 17 | 1 | 16 | 7 | key 过于通用 — Stage 1 audit 实测 dnf-native runtime 无消费 | atanimation/getitem.ani |
| `chr.motionRefs.ghost motion[].raw` | 11 | string | 16 | 17 | 1 | 16 | 7 | key 过于通用 — Stage 1 audit 实测 dnf-native runtime 无消费 | atanimation/ghost.ani |
| `chr.motionRefs.jump motion[].raw` | 11 | string | 16 | 17 | 1 | 16 | 7 | key 过于通用 — Stage 1 audit 实测 dnf-native runtime 无消费 | atanimation/jump.ani |
| `chr.motionRefs.jumpattack motion[].raw` | 11 | string | 16 | 17 | 1 | 16 | 7 | key 过于通用 — Stage 1 audit 实测 dnf-native runtime 无消费 | atanimation/jumpattack.ani |
| `chr.motionRefs.move motion[].raw` | 11 | string | 16 | 17 | 1 | 16 | 7 | key 过于通用 — Stage 1 audit 实测 dnf-native runtime 无消费 | atanimation/move.ani |
| `chr.motionRefs.overturn motion[].raw` | 11 | string | 16 | 17 | 1 | 16 | 7 | key 过于通用 — Stage 1 audit 实测 dnf-native runtime 无消费 | atanimation/overturn.ani |
| `chr.motionRefs.rest motion[].raw` | 11 | string | 16 | 17 | 1 | 16 | 7 | key 过于通用 — Stage 1 audit 实测 dnf-native runtime 无消费 | atanimation/rest.ani |
| `chr.motionRefs.simple move motion[].raw` | 11 | string | 16 | 17 | 1 | 16 | 7 | key 过于通用 — Stage 1 audit 实测 dnf-native runtime 无消费 | atanimation/simple_move.ani |
| `chr.motionRefs.simple rest motion[].raw` | 11 | string | 16 | 17 | 1 | 16 | 7 | key 过于通用 — Stage 1 audit 实测 dnf-native runtime 无消费 | atanimation/simple_rest.ani |
| `chr.motionRefs.sit motion[].raw` | 11 | string | 16 | 17 | 1 | 16 | 7 | key 过于通用 — Stage 1 audit 实测 dnf-native runtime 无消费 | atanimation/sit.ani |
| `chr.motionRefs.throw motion 1-1[].raw` | 11 | string | 16 | 17 | 1 | 16 | 7 | key 过于通用 — Stage 1 audit 实测 dnf-native runtime 无消费 | atanimation/throwprepare.ani |
| `chr.motionRefs.throw motion 1-2[].raw` | 11 | string | 16 | 17 | 1 | 16 | 7 | key 过于通用 — Stage 1 audit 实测 dnf-native runtime 无消费 | atanimation/throw.ani |
| `chr.motionRefs.throw motion 2-1[].raw` | 11 | string | 16 | 17 | 1 | 16 | 7 | key 过于通用 — Stage 1 audit 实测 dnf-native runtime 无消费 | atanimation/shootprepare.ani |
| `chr.motionRefs.throw motion 2-2[].raw` | 11 | string | 16 | 17 | 1 | 16 | 7 | key 过于通用 — Stage 1 audit 实测 dnf-native runtime 无消费 | atanimation/shoot.ani |
| `chr.motionRefs.waiting motion[].raw` | 11 | string | 16 | 17 | 1 | 16 | 7 | key 过于通用 — Stage 1 audit 实测 dnf-native runtime 无消费 | atanimation/stay.ani |
| `chr.raw.sections[].attributes[].t` | 11 | string | 0 | 0 | 0 | 0 | 0 | no grep match anywhere | float |
| `chr.raw.sections[].attributes[].v` | 11 | number|string | 0 | 0 | 0 | 0 | 0 | no grep match anywhere | 0.95 |
| `chr.sections[].attributes[].t` | 11 | string | 0 | 0 | 0 | 0 | 0 | no grep match anywhere | float |
| `chr.sections[].attributes[].v` | 11 | number|string | 0 | 0 | 0 | 0 | 0 | no grep match anywhere | 0.95 |
| `chr.awakening.skillSlots[][]` | 10 | number | 0 | 0 | 0 | 0 | 0 | OOS — 70-cap PVE 范围外 (awakening Lv75+ / worldmap 现 | 114 |
| `chr.motionRefs.attack motion[].raw` | 10 | string | 16 | 17 | 1 | 16 | 7 | key 过于通用 — Stage 1 audit 实测 dnf-native runtime 无消费 | atanimation/attack1.ani |
| `chr.motionRefs.throw motion 3-1[].raw` | 9 | string | 16 | 17 | 1 | 16 | 7 | key 过于通用 — Stage 1 audit 实测 dnf-native runtime 无消费 | atanimation/chargeprepare.ani |
| `chr.motionRefs.throw motion 3-2[].raw` | 9 | string | 16 | 17 | 1 | 16 | 7 | key 过于通用 — Stage 1 audit 实测 dnf-native runtime 无消费 | atanimation/charge.ani |
| `chr.motionRefs.throw motion 4-1[].raw` | 6 | string | 16 | 17 | 1 | 16 | 7 | key 过于通用 — Stage 1 audit 实测 dnf-native runtime 无消费 | atanimation/setrobot.ani |
| `chr.motionRefs.throw motion 4-2[].raw` | 6 | string | 16 | 17 | 1 | 16 | 7 | key 过于通用 — Stage 1 audit 实测 dnf-native runtime 无消费 | atanimation/setrobot.ani |
| `animations{}` | 3 | dict | 0 | 0 | 0 | 0 | 0 | no grep match anywhere | dict<8 keys> |
| `attacks{}` | 2 | dict | 0 | 0 | 0 | 0 | 0 | no grep match anywhere | dict<81 keys> |
| `attacks{}.raw.sections[].attributes[].t` | 2 | string | 0 | 0 | 0 | 0 | 0 | no grep match anywhere | int |
| `attacks{}.raw.sections[].attributes[].v` | 2 | number | 0 | 0 | 0 | 0 | 0 | no grep match anywhere | 400 |
| `attacks{}.sections[].attributes[].t` | 2 | string | 0 | 0 | 0 | 0 | 0 | no grep match anywhere | int |
| `attacks{}.sections[].attributes[].v` | 2 | number | 0 | 0 | 0 | 0 | 0 | no grep match anywhere | 400 |
| `id` | 2 | string | 0 | 0 | 0 | 0 | 0 | no grep match anywhere | jungle |
| `skills{}` | 2 | dict | 0 | 0 | 0 | 0 | 0 | no grep match anywhere | dict<205 keys> |
| `skills{}.raw.sections[].attributes[].t` | 2 | string | 0 | 0 | 0 | 0 | 0 | no grep match anywhere | str |
| `skills{}.raw.sections[].attributes[].v` | 2 | string | 0 | 0 | 0 | 0 | 0 | no grep match anywhere | character/swordman/effect/icewave1.img |
| `skills{}.sections[].attributes[].t` | 2 | string | 0 | 0 | 0 | 0 | 0 | no grep match anywhere | str |
| `skills{}.sections[].attributes[].v` | 2 | string | 0 | 0 | 0 | 0 | 0 | no grep match anywhere | character/swordman/effect/icewave1.img |
| `attacks.attack1.raw.sections[].attributes[].t` | 1 | string | 0 | 0 | 0 | 0 | 0 | no grep match anywhere | int |
| `attacks.attack1.raw.sections[].attributes[].v` | 1 | number | 0 | 0 | 0 | 0 | 0 | no grep match anywhere | 200 |
| `attacks.attack1.sections[].attributes[].t` | 1 | string | 0 | 0 | 0 | 0 | 0 | no grep match anywhere | int |
| `attacks.attack1.sections[].attributes[].v` | 1 | number | 0 | 0 | 0 | 0 | 0 | no grep match anywhere | 200 |
| `chr.raw.sections[].attributes[].items[][].t` | 1 | string | 0 | 0 | 0 | 0 | 0 | no grep match anywhere | str |
| `chr.raw.sections[].attributes[].items[][].v` | 1 | string | 0 | 0 | 0 | 0 | 0 | no grep match anywhere | r_dagger |
| `chr.sections[].attributes[].items[][].t` | 1 | string | 0 | 0 | 0 | 0 | 0 | no grep match anywhere | str |
| `chr.sections[].attributes[].items[][].v` | 1 | string | 0 | 0 | 0 | 0 | 0 | no grep match anywhere | r_dagger |
| `dgn.enteringTitleRefs[].raw` | 1 | string | 16 | 17 | 1 | 16 | 7 | key 过于通用 — Stage 1 audit 实测 dnf-native runtime 无消费 | title/jungle.ani |
| `dgn.raw.special passive object item[].t` | 1 | string | 0 | 0 | 0 | 0 | 0 | no grep match anywhere | int |
| `dgn.raw.special passive object item[].v` | 1 | number | 0 | 0 | 0 | 0 | 0 | no grep match anywhere | 0 |
| `dgn.sections[].attributes[].items[][].t` | 1 | string | 0 | 0 | 0 | 0 | 0 | no grep match anywhere | int |
| `dgn.sections[].attributes[].items[][].v` | 1 | number | 0 | 0 | 0 | 0 | 0 | no grep match anywhere | 1 |
| `dgn.sections[].attributes[].t` | 1 | string | 0 | 0 | 0 | 0 | 0 | no grep match anywhere | link |
| `dgn.sections[].attributes[].v` | 1 | string|number | 0 | 0 | 0 | 0 | 0 | no grep match anywhere |  |
| `dgn.worldmapPatternInfo[]._note` | 1 | string | 3 | 1 | 0 | 1 | 0 | OOS — 70-cap PVE 范围外 (awakening Lv75+ / worldmap 现 | ref_ext_but_path_not_found |
| `dgn.worldmapPatternInfo[].t` | 1 | string | 0 | 0 | 0 | 0 | 0 | OOS — 70-cap PVE 范围外 (awakening Lv75+ / worldmap 现 | int |
| `dgn.worldmapPatternInfo[].v` | 1 | number|string | 0 | 0 | 0 | 0 | 0 | OOS — 70-cap PVE 范围外 (awakening Lv75+ / worldmap 现 | 1 |
| `maps[].animationRefs[].raw` | 1 | string | 16 | 17 | 1 | 16 | 7 | key 过于通用 — Stage 1 audit 实测 dnf-native runtime 无消费 | animation/act3_vine.ani |
| `maps[].raw.sections[].attributes[].t` | 1 | string | 0 | 0 | 0 | 0 | 0 | no grep match anywhere | link |
| `maps[].raw.sections[].attributes[].v` | 1 | string|number | 0 | 0 | 0 | 0 | 0 | no grep match anywhere | PVP 킠쫁 |
| `maps[].sections[].attributes[].t` | 1 | string | 0 | 0 | 0 | 0 | 0 | no grep match anywhere | link |
| `maps[].sections[].attributes[].v` | 1 | string|number | 0 | 0 | 0 | 0 | 0 | no grep match anywhere | PVP 킠쫁 |
| `mob.animationRefs[].raw` | 1 | string | 16 | 17 | 1 | 16 | 7 | key 过于通用 — Stage 1 audit 实测 dnf-native runtime 无消费 | animation_goblin2/damage1.ani |
| `mob.attackInfo[].raw` | 1 | string | 16 | 17 | 1 | 16 | 7 | key 过于通用 — Stage 1 audit 实测 dnf-native runtime 无消费 | attackinfo/attack1.atk |
| `mob.raw.sections[].attributes[].raw` | 1 | string | 16 | 17 | 1 | 16 | 7 | key 过于通用 — Stage 1 audit 实测 dnf-native runtime 无消费 | animation_goblin2/damage1.ani |
| `mob.raw.sections[].attributes[].t` | 1 | string | 0 | 0 | 0 | 0 | 0 | no grep match anywhere | str |
| `mob.raw.sections[].attributes[].v` | 1 | string|number | 0 | 0 | 0 | 0 | 0 | no grep match anywhere | [on revenge] |
| `mob.sections[].attributes[].raw` | 1 | string | 16 | 17 | 1 | 16 | 7 | key 过于通用 — Stage 1 audit 实测 dnf-native runtime 无消费 | animation_goblin2/damage1.ani |
| `mob.sections[].attributes[].t` | 1 | string | 0 | 0 | 0 | 0 | 0 | no grep match anywhere | str |
| `mob.sections[].attributes[].v` | 1 | string|number | 0 | 0 | 0 | 0 | 0 | no grep match anywhere | [on revenge] |
| `tables{}` | 1 | dict | 0 | 0 | 0 | 0 | 0 | no grep match anywhere | dict<6 keys> |

## 二、📦 sidecar 候选 (仅 tests/scripts 用)

| field path | shards | types | producers | runtime | audit | tests | scripts | reason | sample |
|------------|--------|-------|-----------|---------|-------|-------|---------|--------|--------|
| `shape_version` | 15 | string | 1 | 1 | 0 | 1 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | 1.0.0 |
| `chr.attackSpeed.provenance.extractorVersion` | 11 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `chr.attackSpeed.provenance.extractTimestamp` | 11 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `chr.attackSpeed.provenance.sectionName` | 11 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | attack speed |
| `chr.attackSpeed.provenance.sourcePvfHash` | 11 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `chr.attackSpeed.provenance.sourceRef` | 11 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:character/fighter/atfighter.chr |
| `chr.attackSpeed.requiresManualVerification` | 11 | boolean | 1 | 8 | 1 | 3 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | true |
| `chr.attackSpeed.sourceType` | 11 | string | 1 | 18 | 1 | 5 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | tier3 |
| `chr.attackSpeed.unit` | 11 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | %xSPEED_VALUE_DEFAULT |
| `chr.bodyImagePath.provenance.extractorVersion` | 11 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `chr.bodyImagePath.provenance.extractTimestamp` | 11 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `chr.bodyImagePath.provenance.sectionName` | 11 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | body image path |
| `chr.bodyImagePath.provenance.sourcePvfHash` | 11 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `chr.bodyImagePath.provenance.sourceRef` | 11 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:character/fighter/atfighter.chr |
| `chr.bodyImagePath.unit` | 11 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | raw-string |
| `chr.castSpeed.provenance.extractorVersion` | 11 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `chr.castSpeed.provenance.extractTimestamp` | 11 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `chr.castSpeed.provenance.sectionName` | 11 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | cast speed |
| `chr.castSpeed.provenance.sourcePvfHash` | 11 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `chr.castSpeed.provenance.sourceRef` | 11 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:character/fighter/atfighter.chr |
| `chr.castSpeed.requiresManualVerification` | 11 | boolean | 1 | 8 | 1 | 3 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | true |
| `chr.castSpeed.sourceType` | 11 | string | 1 | 18 | 1 | 5 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | tier3 |
| `chr.castSpeed.unit` | 11 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | %xSPEED_VALUE_DEFAULT |
| `chr.growth{}.provenance.extractorVersion` | 11 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `chr.growth{}.provenance.extractTimestamp` | 11 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `chr.growth{}.provenance.sectionName` | 11 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | hp max |
| `chr.growth{}.provenance.sourcePvfHash` | 11 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `chr.growth{}.provenance.sourceRef` | 11 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:character/fighter/atfighter.chr |
| `chr.growth{}.unit` | 11 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | hp |
| `chr.job.provenance.extractorVersion` | 11 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `chr.job.provenance.extractTimestamp` | 11 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `chr.job.provenance.sectionName` | 11 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | job |
| `chr.job.provenance.sourcePvfHash` | 11 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `chr.job.provenance.sourceRef` | 11 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:character/fighter/atfighter.chr |
| `chr.job.unit` | 11 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | raw-string |
| `chr.jumpPower.provenance.extractorVersion` | 11 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `chr.jumpPower.provenance.extractTimestamp` | 11 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `chr.jumpPower.provenance.sectionName` | 11 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | jump power |
| `chr.jumpPower.provenance.sourcePvfHash` | 11 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `chr.jumpPower.provenance.sourceRef` | 11 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:character/fighter/atfighter.chr |
| `chr.jumpPower.requiresManualVerification` | 11 | boolean | 1 | 8 | 1 | 3 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | true |
| `chr.jumpPower.sourceType` | 11 | string | 1 | 18 | 1 | 5 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | tier3 |
| `chr.jumpPower.unit` | 11 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | ambiguous |
| `chr.jumpSpeed.provenance.extractorVersion` | 11 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `chr.jumpSpeed.provenance.extractTimestamp` | 11 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `chr.jumpSpeed.provenance.sectionName` | 11 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | jump speed |
| `chr.jumpSpeed.provenance.sourcePvfHash` | 11 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `chr.jumpSpeed.provenance.sourceRef` | 11 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:character/fighter/atfighter.chr |
| `chr.jumpSpeed.requiresManualVerification` | 11 | boolean | 1 | 8 | 1 | 3 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | true |
| `chr.jumpSpeed.sourceType` | 11 | string | 1 | 18 | 1 | 5 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | tier3 |
| `chr.jumpSpeed.unit` | 11 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | int |
| `chr.moveSpeed.provenance.extractorVersion` | 11 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `chr.moveSpeed.provenance.extractTimestamp` | 11 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `chr.moveSpeed.provenance.sectionName` | 11 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | move speed |
| `chr.moveSpeed.provenance.sourcePvfHash` | 11 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `chr.moveSpeed.provenance.sourceRef` | 11 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:character/fighter/atfighter.chr |
| `chr.moveSpeed.requiresManualVerification` | 11 | boolean | 1 | 8 | 1 | 3 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | true |
| `chr.moveSpeed.sourceType` | 11 | string | 1 | 18 | 1 | 5 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | tier3 |
| `chr.moveSpeed.unit` | 11 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | %xSPEED_VALUE_DEFAULT |
| `chr.provenance.extractorVersion` | 11 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `chr.provenance.extractTimestamp` | 11 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `chr.provenance.sourcePvfHash` | 11 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `chr.provenance.sourceRef` | 11 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:character/fighter/atfighter.chr |
| `chr.raw.extractor_version` | 11 | string | 7 | 6 | 0 | 17 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `chr.weight.provenance.extractorVersion` | 11 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `chr.weight.provenance.extractTimestamp` | 11 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `chr.weight.provenance.sectionName` | 11 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | weight |
| `chr.weight.provenance.sourcePvfHash` | 11 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `chr.weight.provenance.sourceRef` | 11 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:character/fighter/atfighter.chr |
| `chr.weight.requiresManualVerification` | 11 | boolean | 1 | 8 | 1 | 3 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | true |
| `chr.weight.sourceType` | 11 | string | 1 | 18 | 1 | 5 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | tier3 |
| `chr.weight.unit` | 11 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | audio-only |
| `parentJob` | 11 | string | 1 | 0 | 0 | 1 | 0 | audit/tests/scripts only (0A+1T+0S) | fighter |
| `chr.darkResistance.provenance.extractorVersion` | 4 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `chr.darkResistance.provenance.extractTimestamp` | 4 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `chr.darkResistance.provenance.sectionName` | 4 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | dark resistance |
| `chr.darkResistance.provenance.sourcePvfHash` | 4 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `chr.darkResistance.provenance.sourceRef` | 4 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:character/fighter/atfighter.chr |
| `chr.darkResistance.unit` | 4 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | % |
| `chr.lightResistance.provenance.extractorVersion` | 4 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `chr.lightResistance.provenance.extractTimestamp` | 4 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `chr.lightResistance.provenance.sectionName` | 4 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | light resistance |
| `chr.lightResistance.provenance.sourcePvfHash` | 4 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `chr.lightResistance.provenance.sourceRef` | 4 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:character/fighter/atfighter.chr |
| `chr.lightResistance.unit` | 4 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | % |
| `animations{}.provenance.extractorVersion` | 3 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `animations{}.provenance.extractTimestamp` | 3 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:10Z |
| `animations{}.provenance.sourcePvfHash` | 3 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `animations{}.provenance.sourceRef` | 3 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:monster/goblin/animation_goblin2/damage1.ani |
| `attacks{}.damageBonus.provenance.extractorVersion` | 2 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `attacks{}.damageBonus.provenance.extractTimestamp` | 2 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `attacks{}.damageBonus.provenance.sectionName` | 2 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | damage bonus |
| `attacks{}.damageBonus.provenance.sourcePvfHash` | 2 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `attacks{}.damageBonus.provenance.sourceRef` | 2 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:character/swordman/attackinfo/weaponcomboshort |
| `attacks{}.damageBonus.unit` | 2 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | % |
| `attacks{}.liftUp.provenance.extractorVersion` | 2 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `attacks{}.liftUp.provenance.extractTimestamp` | 2 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `attacks{}.liftUp.provenance.sectionName` | 2 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | lift up |
| `attacks{}.liftUp.provenance.sourcePvfHash` | 2 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `attacks{}.liftUp.provenance.sourceRef` | 2 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:character/swordman/attackinfo/weaponcomboshort |
| `attacks{}.liftUp.requiresManualVerification` | 2 | boolean | 1 | 8 | 1 | 3 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | true |
| `attacks{}.liftUp.sourceType` | 2 | string | 1 | 18 | 1 | 5 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | tier3 |
| `attacks{}.liftUp.unit` | 2 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | px/s |
| `attacks{}.provenance.extractorVersion` | 2 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `attacks{}.provenance.extractTimestamp` | 2 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `attacks{}.provenance.sourcePvfHash` | 2 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `attacks{}.provenance.sourceRef` | 2 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:character/swordman/attackinfo/weaponcomboshort |
| `attacks{}.pushAside.provenance.extractorVersion` | 2 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `attacks{}.pushAside.provenance.extractTimestamp` | 2 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `attacks{}.pushAside.provenance.sectionName` | 2 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | push aside |
| `attacks{}.pushAside.provenance.sourcePvfHash` | 2 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `attacks{}.pushAside.provenance.sourceRef` | 2 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:character/swordman/attackinfo/weaponcomboshort |
| `attacks{}.pushAside.requiresManualVerification` | 2 | boolean | 1 | 8 | 1 | 3 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | true |
| `attacks{}.pushAside.sourceType` | 2 | string | 1 | 18 | 1 | 5 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | tier3 |
| `attacks{}.pushAside.unit` | 2 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | px/s |
| `attacks{}.raw.extractor_version` | 2 | string | 7 | 6 | 0 | 17 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `skills{}.durabilityDecreaseRate.provenance.extractorVersion` | 2 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `skills{}.durabilityDecreaseRate.provenance.extractTimestamp` | 2 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `skills{}.durabilityDecreaseRate.provenance.sectionName` | 2 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | durability decrease rate |
| `skills{}.durabilityDecreaseRate.provenance.sourcePvfHash` | 2 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `skills{}.durabilityDecreaseRate.provenance.sourceRef` | 2 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:skill/swordman/icewave.skl |
| `skills{}.durabilityDecreaseRate.unit` | 2 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | % |
| `skills{}.maximumLevel.provenance.extractorVersion` | 2 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `skills{}.maximumLevel.provenance.extractTimestamp` | 2 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `skills{}.maximumLevel.provenance.sectionName` | 2 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | maximum level |
| `skills{}.maximumLevel.provenance.sourcePvfHash` | 2 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `skills{}.maximumLevel.provenance.sourceRef` | 2 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:skill/swordman/icewave.skl |
| `skills{}.maximumLevel.unit` | 2 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | level |
| `skills{}.name.provenance.extractorVersion` | 2 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `skills{}.name.provenance.extractTimestamp` | 2 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `skills{}.name.provenance.sectionName` | 2 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | name |
| `skills{}.name.provenance.sourcePvfHash` | 2 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `skills{}.name.provenance.sourceRef` | 2 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:skill/swordman/icewave.skl |
| `skills{}.name.unit` | 2 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | link-key |
| `skills{}.provenance.extractorVersion` | 2 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `skills{}.provenance.extractTimestamp` | 2 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `skills{}.provenance.sourcePvfHash` | 2 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `skills{}.provenance.sourceRef` | 2 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:skill/swordman/icewave.skl |
| `skills{}.purchaseCost.provenance.extractorVersion` | 2 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `skills{}.purchaseCost.provenance.extractTimestamp` | 2 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `skills{}.purchaseCost.provenance.sectionName` | 2 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | purchase cost |
| `skills{}.purchaseCost.provenance.sourcePvfHash` | 2 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `skills{}.purchaseCost.provenance.sourceRef` | 2 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:skill/swordman/icewave.skl |
| `skills{}.purchaseCost.unit` | 2 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | sp |
| `skills{}.raw.extractor_version` | 2 | string | 7 | 6 | 0 | 17 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `skills{}.requiredLevel.provenance.extractorVersion` | 2 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `skills{}.requiredLevel.provenance.extractTimestamp` | 2 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `skills{}.requiredLevel.provenance.sectionName` | 2 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | required level |
| `skills{}.requiredLevel.provenance.sourcePvfHash` | 2 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `skills{}.requiredLevel.provenance.sourceRef` | 2 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:skill/swordman/icewave.skl |
| `skills{}.requiredLevel.unit` | 2 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | level |
| `skills{}.requiredLevelRange.provenance.extractorVersion` | 2 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `skills{}.requiredLevelRange.provenance.extractTimestamp` | 2 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `skills{}.requiredLevelRange.provenance.sectionName` | 2 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | required level range |
| `skills{}.requiredLevelRange.provenance.sourcePvfHash` | 2 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `skills{}.requiredLevelRange.provenance.sourceRef` | 2 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:skill/swordman/icewave.skl |
| `skills{}.requiredLevelRange.unit` | 2 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | raw |
| `skills{}.skillClass.provenance.extractorVersion` | 2 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `skills{}.skillClass.provenance.extractTimestamp` | 2 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `skills{}.skillClass.provenance.sectionName` | 2 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | skill class |
| `skills{}.skillClass.provenance.sourcePvfHash` | 2 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `skills{}.skillClass.provenance.sourceRef` | 2 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:skill/swordman/icewave.skl |
| `skills{}.skillClass.unit` | 2 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | raw |
| `attacks.attack1.hitWav.provenance.extractorVersion` | 1 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `attacks.attack1.hitWav.provenance.extractTimestamp` | 1 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `attacks.attack1.hitWav.provenance.sectionName` | 1 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | hit wav |
| `attacks.attack1.hitWav.provenance.sourcePvfHash` | 1 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `attacks.attack1.hitWav.provenance.sourceRef` | 1 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:monster/goblin/attackinfo/attack1.atk |
| `attacks.attack1.hitWav.unit` | 1 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | sound-id |
| `attacks.attack1.liftUp.provenance.extractorVersion` | 1 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `attacks.attack1.liftUp.provenance.extractTimestamp` | 1 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `attacks.attack1.liftUp.provenance.sectionName` | 1 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | lift up |
| `attacks.attack1.liftUp.provenance.sourcePvfHash` | 1 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `attacks.attack1.liftUp.provenance.sourceRef` | 1 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:monster/goblin/attackinfo/attack1.atk |
| `attacks.attack1.liftUp.requiresManualVerification` | 1 | boolean | 1 | 8 | 1 | 3 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | true |
| `attacks.attack1.liftUp.sourceType` | 1 | string | 1 | 18 | 1 | 5 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | tier3 |
| `attacks.attack1.liftUp.unit` | 1 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | px/s |
| `attacks.attack1.provenance.extractorVersion` | 1 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `attacks.attack1.provenance.extractTimestamp` | 1 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `attacks.attack1.provenance.sourcePvfHash` | 1 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `attacks.attack1.provenance.sourceRef` | 1 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:monster/goblin/attackinfo/attack1.atk |
| `attacks.attack1.pushAside.provenance.extractorVersion` | 1 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `attacks.attack1.pushAside.provenance.extractTimestamp` | 1 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `attacks.attack1.pushAside.provenance.sectionName` | 1 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | push aside |
| `attacks.attack1.pushAside.provenance.sourcePvfHash` | 1 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `attacks.attack1.pushAside.provenance.sourceRef` | 1 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:monster/goblin/attackinfo/attack1.atk |
| `attacks.attack1.pushAside.requiresManualVerification` | 1 | boolean | 1 | 8 | 1 | 3 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | true |
| `attacks.attack1.pushAside.sourceType` | 1 | string | 1 | 18 | 1 | 5 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | tier3 |
| `attacks.attack1.pushAside.unit` | 1 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | px/s |
| `attacks.attack1.raw.extractor_version` | 1 | string | 7 | 6 | 0 | 17 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `dgn.backgroundPos.provenance.extractorVersion` | 1 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `dgn.backgroundPos.provenance.extractTimestamp` | 1 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `dgn.backgroundPos.provenance.sectionName` | 1 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | background pos |
| `dgn.backgroundPos.provenance.sourcePvfHash` | 1 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `dgn.backgroundPos.provenance.sourceRef` | 1 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:dungeon/act3/jungle.dgn |
| `dgn.backgroundPos.unit` | 1 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | px |
| `dgn.basisLevel.provenance.extractorVersion` | 1 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `dgn.basisLevel.provenance.extractTimestamp` | 1 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `dgn.basisLevel.provenance.sectionName` | 1 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | basis level |
| `dgn.basisLevel.provenance.sourcePvfHash` | 1 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `dgn.basisLevel.provenance.sourceRef` | 1 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:dungeon/act3/jungle.dgn |
| `dgn.basisLevel.unit` | 1 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | level |
| `dgn.experienceIncreasingPoint.provenance.extractorVersion` | 1 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `dgn.experienceIncreasingPoint.provenance.extractTimestamp` | 1 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `dgn.experienceIncreasingPoint.provenance.sectionName` | 1 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | experience increasing point |
| `dgn.experienceIncreasingPoint.provenance.sourcePvfHash` | 1 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `dgn.experienceIncreasingPoint.provenance.sourceRef` | 1 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:dungeon/act3/jungle.dgn |
| `dgn.experienceIncreasingPoint.unit` | 1 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | multiplier |
| `dgn.explain.provenance.extractorVersion` | 1 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `dgn.explain.provenance.extractTimestamp` | 1 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `dgn.explain.provenance.sectionName` | 1 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | explain |
| `dgn.explain.provenance.sourcePvfHash` | 1 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `dgn.explain.provenance.sourceRef` | 1 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:dungeon/act3/jungle.dgn |
| `dgn.explain.unit` | 1 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | link-key |
| `dgn.minimumRequiredLevel.provenance.extractorVersion` | 1 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `dgn.minimumRequiredLevel.provenance.extractTimestamp` | 1 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `dgn.minimumRequiredLevel.provenance.sectionName` | 1 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | minimum required level |
| `dgn.minimumRequiredLevel.provenance.sourcePvfHash` | 1 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `dgn.minimumRequiredLevel.provenance.sourceRef` | 1 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:dungeon/act3/jungle.dgn |
| `dgn.minimumRequiredLevel.unit` | 1 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | level |
| `dgn.name.provenance.extractorVersion` | 1 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `dgn.name.provenance.extractTimestamp` | 1 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `dgn.name.provenance.sectionName` | 1 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | name |
| `dgn.name.provenance.sourcePvfHash` | 1 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `dgn.name.provenance.sourceRef` | 1 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:dungeon/act3/jungle.dgn |
| `dgn.name.unit` | 1 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | link-key |
| `dgn.provenance.extractorVersion` | 1 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `dgn.provenance.extractTimestamp` | 1 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `dgn.provenance.sourcePvfHash` | 1 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `dgn.provenance.sourceRef` | 1 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:dungeon/act3/jungle.dgn |
| `exported_at` | 1 | string | 1 | 1 | 0 | 1 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:21.006Z |
| `extractor_version` | 1 | string | 7 | 6 | 0 | 17 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `files[].sha256` | 1 | string | 2 | 3 | 0 | 4 | 5 | metadata 字段 — audit/build-time only, 不进 runtime .b | 363b8023a319a17018b29c63d0ff5fa3e54a1ef7bad54d06b9 |
| `files[].shape_version` | 1 | string | 1 | 1 | 0 | 1 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | 1.0.0 |
| `files[].sizeBytes` | 1 | number | 4 | 3 | 0 | 3 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2293569 |
| `manifest_version` | 1 | string | 1 | 1 | 0 | 2 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | 1.0.0 |
| `maps[].dungeonId.provenance.extractorVersion` | 1 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `maps[].dungeonId.provenance.extractTimestamp` | 1 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `maps[].dungeonId.provenance.sectionName` | 1 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | dungeon |
| `maps[].dungeonId.provenance.sourcePvfHash` | 1 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `maps[].dungeonId.provenance.sourceRef` | 1 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:map/jungle/e3204(1,2).map |
| `maps[].dungeonId.unit` | 1 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | id |
| `maps[].farSightScroll.provenance.extractorVersion` | 1 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `maps[].farSightScroll.provenance.extractTimestamp` | 1 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `maps[].farSightScroll.provenance.sectionName` | 1 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | far sight scroll |
| `maps[].farSightScroll.provenance.sourcePvfHash` | 1 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `maps[].farSightScroll.provenance.sourceRef` | 1 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:map/jungle/e3204(1,2).map |
| `maps[].farSightScroll.unit` | 1 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | px |
| `maps[].greed.provenance.extractorVersion` | 1 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `maps[].greed.provenance.extractTimestamp` | 1 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `maps[].greed.provenance.sectionName` | 1 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | greed |
| `maps[].greed.provenance.sourcePvfHash` | 1 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `maps[].greed.provenance.sourceRef` | 1 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:map/jungle/e3204(1,2).map |
| `maps[].greed.unit` | 1 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | raw-string |
| `maps[].mapType.provenance.extractorVersion` | 1 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `maps[].mapType.provenance.extractTimestamp` | 1 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `maps[].mapType.provenance.sectionName` | 1 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | type |
| `maps[].mapType.provenance.sourcePvfHash` | 1 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `maps[].mapType.provenance.sourceRef` | 1 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:map/jungle/e3204(1,2).map |
| `maps[].mapType.unit` | 1 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | raw-string |
| `maps[].middleSightScroll.provenance.extractorVersion` | 1 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `maps[].middleSightScroll.provenance.extractTimestamp` | 1 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `maps[].middleSightScroll.provenance.sectionName` | 1 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | middle sight scroll |
| `maps[].middleSightScroll.provenance.sourcePvfHash` | 1 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `maps[].middleSightScroll.provenance.sourceRef` | 1 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:map/jungle/e3204(1,2).map |
| `maps[].middleSightScroll.unit` | 1 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | px |
| `maps[].name.provenance.extractorVersion` | 1 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `maps[].name.provenance.extractTimestamp` | 1 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `maps[].name.provenance.sectionName` | 1 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | map name |
| `maps[].name.provenance.sourcePvfHash` | 1 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `maps[].name.provenance.sourceRef` | 1 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:map/jungle/e3204(1,2).map |
| `maps[].name.unit` | 1 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | stringtable-link |
| `maps[].nearSightScroll.provenance.extractorVersion` | 1 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `maps[].nearSightScroll.provenance.extractTimestamp` | 1 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `maps[].nearSightScroll.provenance.sectionName` | 1 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | near sight scroll |
| `maps[].nearSightScroll.provenance.sourcePvfHash` | 1 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `maps[].nearSightScroll.provenance.sourceRef` | 1 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:map/jungle/e3204(1,2).map |
| `maps[].nearSightScroll.unit` | 1 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | px |
| `maps[].provenance.extractorVersion` | 1 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `maps[].provenance.extractTimestamp` | 1 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `maps[].provenance.sourcePvfHash` | 1 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `maps[].provenance.sourceRef` | 1 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:map/jungle/e3204(1,2).map |
| `maps[].raw.extractor_version` | 1 | string | 7 | 6 | 0 | 17 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `mob.abilityCategory.provenance.extractorVersion` | 1 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `mob.abilityCategory.provenance.extractTimestamp` | 1 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `mob.abilityCategory.provenance.sectionName` | 1 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | ability category |
| `mob.abilityCategory.provenance.sourcePvfHash` | 1 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `mob.abilityCategory.provenance.sourceRef` | 1 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:monster/goblin/goblin.mob |
| `mob.abilityCategory.requiresManualVerification` | 1 | boolean | 1 | 8 | 1 | 3 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | true |
| `mob.abilityCategory.sourceType` | 1 | string | 1 | 18 | 1 | 5 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | tier3 |
| `mob.abilityCategory.unit` | 1 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | percent |
| `mob.attackDelay.provenance.extractorVersion` | 1 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `mob.attackDelay.provenance.extractTimestamp` | 1 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `mob.attackDelay.provenance.sectionName` | 1 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | attack delay |
| `mob.attackDelay.provenance.sourcePvfHash` | 1 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `mob.attackDelay.provenance.sourceRef` | 1 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:monster/goblin/goblin.mob |
| `mob.attackDelay.requiresManualVerification` | 1 | boolean | 1 | 8 | 1 | 3 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | true |
| `mob.attackDelay.sourceType` | 1 | string | 1 | 18 | 1 | 5 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | tier3 |
| `mob.attackDelay.unit` | 1 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | ms |
| `mob.hitRecovery.provenance.extractorVersion` | 1 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `mob.hitRecovery.provenance.extractTimestamp` | 1 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `mob.hitRecovery.provenance.sectionName` | 1 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | hit recovery |
| `mob.hitRecovery.provenance.sourcePvfHash` | 1 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `mob.hitRecovery.provenance.sourceRef` | 1 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:monster/goblin/goblin.mob |
| `mob.hitRecovery.requiresManualVerification` | 1 | boolean | 1 | 8 | 1 | 3 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | true |
| `mob.hitRecovery.sourceType` | 1 | string | 1 | 18 | 1 | 5 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | tier3 |
| `mob.hitRecovery.unit` | 1 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | ms |
| `mob.level.provenance.extractorVersion` | 1 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `mob.level.provenance.extractTimestamp` | 1 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `mob.level.provenance.sectionName` | 1 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | level |
| `mob.level.provenance.sourcePvfHash` | 1 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `mob.level.provenance.sourceRef` | 1 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:monster/goblin/goblin.mob |
| `mob.level.requiresManualVerification` | 1 | boolean | 1 | 8 | 1 | 3 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | true |
| `mob.level.sourceType` | 1 | string | 1 | 18 | 1 | 5 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | tier3 |
| `mob.level.unit` | 1 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | raw |
| `mob.moveSpeed.provenance.extractorVersion` | 1 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `mob.moveSpeed.provenance.extractTimestamp` | 1 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `mob.moveSpeed.provenance.sectionName` | 1 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | move speed |
| `mob.moveSpeed.provenance.sourcePvfHash` | 1 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `mob.moveSpeed.provenance.sourceRef` | 1 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:monster/goblin/goblin.mob |
| `mob.moveSpeed.requiresManualVerification` | 1 | boolean | 1 | 8 | 1 | 3 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | true |
| `mob.moveSpeed.sourceType` | 1 | string | 1 | 18 | 1 | 5 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | tier3 |
| `mob.moveSpeed.unit` | 1 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | raw |
| `mob.name.provenance.extractorVersion` | 1 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `mob.name.provenance.extractTimestamp` | 1 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `mob.name.provenance.sectionName` | 1 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | name |
| `mob.name.provenance.sourcePvfHash` | 1 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `mob.name.provenance.sourceRef` | 1 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:monster/goblin/goblin.mob |
| `mob.name.unit` | 1 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | raw-string |
| `mob.provenance.extractorVersion` | 1 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `mob.provenance.extractTimestamp` | 1 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `mob.provenance.sourcePvfHash` | 1 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `mob.provenance.sourceRef` | 1 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:monster/goblin/goblin.mob |
| `mob.raw.extractor_version` | 1 | string | 7 | 6 | 0 | 17 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `mob.sight.provenance.extractorVersion` | 1 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `mob.sight.provenance.extractTimestamp` | 1 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `mob.sight.provenance.sectionName` | 1 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | sight |
| `mob.sight.provenance.sourcePvfHash` | 1 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `mob.sight.provenance.sourceRef` | 1 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:monster/goblin/goblin.mob |
| `mob.sight.unit` | 1 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | px |
| `mob.stuckbonusOnDamage.provenance.extractorVersion` | 1 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `mob.stuckbonusOnDamage.provenance.extractTimestamp` | 1 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `mob.stuckbonusOnDamage.provenance.sectionName` | 1 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | stuckbonus on damage |
| `mob.stuckbonusOnDamage.provenance.sourcePvfHash` | 1 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `mob.stuckbonusOnDamage.provenance.sourceRef` | 1 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:monster/goblin/goblin.mob |
| `mob.stuckbonusOnDamage.requiresManualVerification` | 1 | boolean | 1 | 8 | 1 | 3 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | true |
| `mob.stuckbonusOnDamage.sourceType` | 1 | string | 1 | 18 | 1 | 5 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | tier3 |
| `mob.stuckbonusOnDamage.unit` | 1 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | raw |
| `mob.warlike.provenance.extractorVersion` | 1 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `mob.warlike.provenance.extractTimestamp` | 1 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `mob.warlike.provenance.sectionName` | 1 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | warlike |
| `mob.warlike.provenance.sourcePvfHash` | 1 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `mob.warlike.provenance.sourceRef` | 1 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:monster/goblin/goblin.mob |
| `mob.warlike.requiresManualVerification` | 1 | boolean | 1 | 8 | 1 | 3 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | true |
| `mob.warlike.sourceType` | 1 | string | 1 | 18 | 1 | 5 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | tier3 |
| `mob.warlike.unit` | 1 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | raw |
| `mob.weight.provenance.extractorVersion` | 1 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `mob.weight.provenance.extractTimestamp` | 1 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `mob.weight.provenance.sectionName` | 1 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | weight |
| `mob.weight.provenance.sourcePvfHash` | 1 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `mob.weight.provenance.sourceRef` | 1 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:monster/goblin/goblin.mob |
| `mob.weight.requiresManualVerification` | 1 | boolean | 1 | 8 | 1 | 3 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | true |
| `mob.weight.sourceType` | 1 | string | 1 | 18 | 1 | 5 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | tier3 |
| `mob.weight.unit` | 1 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | raw |
| `mob.weightDual.provenance.extractorVersion` | 1 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `mob.weightDual.provenance.extractTimestamp` | 1 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `mob.weightDual.provenance.sectionName` | 1 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | weight |
| `mob.weightDual.provenance.sourcePvfHash` | 1 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `mob.weightDual.provenance.sourceRef` | 1 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:monster/goblin/goblin.mob |
| `mob.weightDual.requiresManualVerification` | 1 | boolean | 1 | 8 | 1 | 3 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | true |
| `mob.weightDual.sourceType` | 1 | string | 1 | 18 | 1 | 5 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | tier3 |
| `mob.weightDual.unit` | 1 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | raw |
| `mob.widthBox.provenance.extractorVersion` | 1 | string | 6 | 4 | 1 | 11 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | v2.0.0 |
| `mob.widthBox.provenance.extractTimestamp` | 1 | string | 6 | 3 | 1 | 6 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | 2026-05-27T03:45:20Z |
| `mob.widthBox.provenance.sectionName` | 1 | string | 7 | 2 | 1 | 7 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | width |
| `mob.widthBox.provenance.sourcePvfHash` | 1 | string | 5 | 2 | 1 | 13 | 2 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |
| `mob.widthBox.provenance.sourceRef` | 1 | string | 4 | 14 | 1 | 13 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | pvf:monster/goblin/goblin.mob |
| `mob.widthBox.requiresManualVerification` | 1 | boolean | 1 | 8 | 1 | 3 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | true |
| `mob.widthBox.sourceType` | 1 | string | 1 | 18 | 1 | 5 | 3 | metadata 字段 — audit/build-time only, 不进 runtime .b | tier3 |
| `mob.widthBox.unit` | 1 | string | 4 | 9 | 1 | 5 | 2 | unit 是 build-time hint, schema 默认即可 | raw |
| `pvf_hash` | 1 | string | 3 | 1 | 0 | 1 | 1 | metadata 字段 — audit/build-time only, 不进 runtime .b | crc32-head:c0779278\|size:205695984 |

## 三、✅ keep (runtime 真消费)

| field path | shards | types | producers | runtime | audit | tests | scripts | reason | sample |
|------------|--------|-------|-----------|---------|-------|-------|---------|--------|--------|
| `chr.attackInfo.attackBase[].targetKind` | 11 | string | 3 | 3 | 1 | 5 | 0 | runtime consumer: src/dnf-native-combat/data/types | atk |
| `chr.attackInfo.attackBase[].targetPath` | 11 | string | 3 | 3 | 1 | 6 | 0 | runtime consumer: src/dnf-native-combat/data/types | character/fighter/atattackinfo/attack1.atk |
| `chr.attackInfo.dashAttack.targetKind` | 11 | string | 3 | 3 | 1 | 5 | 0 | runtime consumer: src/dnf-native-combat/data/types | atk |
| `chr.attackInfo.dashAttack.targetPath` | 11 | string | 3 | 3 | 1 | 6 | 0 | runtime consumer: src/dnf-native-combat/data/types | character/fighter/atattackinfo/dashattack.atk |
| `chr.attackInfo.etc[].targetKind` | 11 | string | 3 | 3 | 1 | 5 | 0 | runtime consumer: src/dnf-native-combat/data/types | atk |
| `chr.attackInfo.etc[].targetPath` | 11 | string | 3 | 3 | 1 | 6 | 0 | runtime consumer: src/dnf-native-combat/data/types | character/fighter/atattackinfo/crashlowkick.atk |
| `chr.attackInfo.jumpAttack.targetKind` | 11 | string | 3 | 3 | 1 | 5 | 0 | runtime consumer: src/dnf-native-combat/data/types | atk |
| `chr.attackInfo.jumpAttack.targetPath` | 11 | string | 3 | 3 | 1 | 6 | 0 | runtime consumer: src/dnf-native-combat/data/types | character/fighter/atattackinfo/jumpattack.atk |
| `chr.attackSpeed.value` | 11 | number | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy | 950 |
| `chr.bodyImagePath.value` | 11 | string | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy | character/fighter/atequipment/avatar/skin/fm_body% |
| `chr.castSpeed.value` | 11 | number | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy | 1000 |
| `chr.growth{}` | 11 | dict | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | dict<9 keys> |
| `chr.growth{}.values[]` | 11 | number | 14 | 17 | 1 | 16 | 3 | business whitelist (review pass 1) — Phase 3+ runt | 210 |
| `chr.job.rawValue` | 11 | string | 1 | 1 | 1 | 3 | 0 | runtime consumer: src/dnf-native-combat/data/types | [at fighter] |
| `chr.job.value` | 11 | string | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy | at fighter |
| `chr.jumpPower.value` | 11 | number | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy | 470 |
| `chr.jumpSpeed.value` | 11 | number | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy | 110 |
| `chr.kind` | 11 | string | 12 | 22 | 1 | 20 | 4 | runtime consumer: src/data/official/dnf/swordman/m | chr |
| `chr.moduleDamageRate[][]` | 11 | number | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | 0.85 |
| `chr.motionRefs.back motion[].targetKind` | 11 | string | 3 | 3 | 1 | 5 | 0 | runtime consumer: src/dnf-native-combat/data/types | ani |
| `chr.motionRefs.back motion[].targetPath` | 11 | string | 3 | 3 | 1 | 6 | 0 | runtime consumer: src/dnf-native-combat/data/types | character/fighter/atanimation/liftupper.ani |
| `chr.motionRefs.buff motion[].targetKind` | 11 | string | 3 | 3 | 1 | 5 | 0 | runtime consumer: src/dnf-native-combat/data/types | ani |
| `chr.motionRefs.buff motion[].targetPath` | 11 | string | 3 | 3 | 1 | 6 | 0 | runtime consumer: src/dnf-native-combat/data/types | character/fighter/atanimation/buff.ani |
| `chr.motionRefs.damage motion 1[].targetKind` | 11 | string | 3 | 3 | 1 | 5 | 0 | runtime consumer: src/dnf-native-combat/data/types | ani |
| `chr.motionRefs.damage motion 1[].targetPath` | 11 | string | 3 | 3 | 1 | 6 | 0 | runtime consumer: src/dnf-native-combat/data/types | character/fighter/atanimation/damage1.ani |
| `chr.motionRefs.damage motion 2[].targetKind` | 11 | string | 3 | 3 | 1 | 5 | 0 | runtime consumer: src/dnf-native-combat/data/types | ani |
| `chr.motionRefs.damage motion 2[].targetPath` | 11 | string | 3 | 3 | 1 | 6 | 0 | runtime consumer: src/dnf-native-combat/data/types | character/fighter/atanimation/damage2.ani |
| `chr.motionRefs.dash motion[].targetKind` | 11 | string | 3 | 3 | 1 | 5 | 0 | runtime consumer: src/dnf-native-combat/data/types | ani |
| `chr.motionRefs.dash motion[].targetPath` | 11 | string | 3 | 3 | 1 | 6 | 0 | runtime consumer: src/dnf-native-combat/data/types | character/fighter/atanimation/dash.ani |
| `chr.motionRefs.dashattack motion[].targetKind` | 11 | string | 3 | 3 | 1 | 5 | 0 | runtime consumer: src/dnf-native-combat/data/types | ani |
| `chr.motionRefs.dashattack motion[].targetPath` | 11 | string | 3 | 3 | 1 | 6 | 0 | runtime consumer: src/dnf-native-combat/data/types | character/fighter/atanimation/dashattack.ani |
| `chr.motionRefs.down motion[].targetKind` | 11 | string | 3 | 3 | 1 | 5 | 0 | runtime consumer: src/dnf-native-combat/data/types | ani |
| `chr.motionRefs.down motion[].targetPath` | 11 | string | 3 | 3 | 1 | 6 | 0 | runtime consumer: src/dnf-native-combat/data/types | character/fighter/atanimation/down.ani |
| `chr.motionRefs.etc motion[].targetKind` | 11 | string | 3 | 3 | 1 | 5 | 0 | runtime consumer: src/dnf-native-combat/data/types | ani |
| `chr.motionRefs.etc motion[].targetPath` | 11 | string | 3 | 3 | 1 | 6 | 0 | runtime consumer: src/dnf-native-combat/data/types | character/fighter/atanimation/crouch.ani |
| `chr.motionRefs.getitem motion[].targetKind` | 11 | string | 3 | 3 | 1 | 5 | 0 | runtime consumer: src/dnf-native-combat/data/types | ani |
| `chr.motionRefs.getitem motion[].targetPath` | 11 | string | 3 | 3 | 1 | 6 | 0 | runtime consumer: src/dnf-native-combat/data/types | character/fighter/atanimation/getitem.ani |
| `chr.motionRefs.ghost motion[].targetKind` | 11 | string | 3 | 3 | 1 | 5 | 0 | runtime consumer: src/dnf-native-combat/data/types | ani |
| `chr.motionRefs.ghost motion[].targetPath` | 11 | string | 3 | 3 | 1 | 6 | 0 | runtime consumer: src/dnf-native-combat/data/types | character/fighter/atanimation/ghost.ani |
| `chr.motionRefs.jump motion[].targetKind` | 11 | string | 3 | 3 | 1 | 5 | 0 | runtime consumer: src/dnf-native-combat/data/types | ani |
| `chr.motionRefs.jump motion[].targetPath` | 11 | string | 3 | 3 | 1 | 6 | 0 | runtime consumer: src/dnf-native-combat/data/types | character/fighter/atanimation/jump.ani |
| `chr.motionRefs.jumpattack motion[].targetKind` | 11 | string | 3 | 3 | 1 | 5 | 0 | runtime consumer: src/dnf-native-combat/data/types | ani |
| `chr.motionRefs.jumpattack motion[].targetPath` | 11 | string | 3 | 3 | 1 | 6 | 0 | runtime consumer: src/dnf-native-combat/data/types | character/fighter/atanimation/jumpattack.ani |
| `chr.motionRefs.move motion[].targetKind` | 11 | string | 3 | 3 | 1 | 5 | 0 | runtime consumer: src/dnf-native-combat/data/types | ani |
| `chr.motionRefs.move motion[].targetPath` | 11 | string | 3 | 3 | 1 | 6 | 0 | runtime consumer: src/dnf-native-combat/data/types | character/fighter/atanimation/move.ani |
| `chr.motionRefs.overturn motion[].targetKind` | 11 | string | 3 | 3 | 1 | 5 | 0 | runtime consumer: src/dnf-native-combat/data/types | ani |
| `chr.motionRefs.overturn motion[].targetPath` | 11 | string | 3 | 3 | 1 | 6 | 0 | runtime consumer: src/dnf-native-combat/data/types | character/fighter/atanimation/overturn.ani |
| `chr.motionRefs.rest motion[].targetKind` | 11 | string | 3 | 3 | 1 | 5 | 0 | runtime consumer: src/dnf-native-combat/data/types | ani |
| `chr.motionRefs.rest motion[].targetPath` | 11 | string | 3 | 3 | 1 | 6 | 0 | runtime consumer: src/dnf-native-combat/data/types | character/fighter/atanimation/rest.ani |
| `chr.motionRefs.simple move motion[].targetKind` | 11 | string | 3 | 3 | 1 | 5 | 0 | runtime consumer: src/dnf-native-combat/data/types | ani |
| `chr.motionRefs.simple move motion[].targetPath` | 11 | string | 3 | 3 | 1 | 6 | 0 | runtime consumer: src/dnf-native-combat/data/types | character/fighter/atanimation/simple_move.ani |
| `chr.motionRefs.simple rest motion[].targetKind` | 11 | string | 3 | 3 | 1 | 5 | 0 | runtime consumer: src/dnf-native-combat/data/types | ani |
| `chr.motionRefs.simple rest motion[].targetPath` | 11 | string | 3 | 3 | 1 | 6 | 0 | runtime consumer: src/dnf-native-combat/data/types | character/fighter/atanimation/simple_rest.ani |
| `chr.motionRefs.sit motion[].targetKind` | 11 | string | 3 | 3 | 1 | 5 | 0 | runtime consumer: src/dnf-native-combat/data/types | ani |
| `chr.motionRefs.sit motion[].targetPath` | 11 | string | 3 | 3 | 1 | 6 | 0 | runtime consumer: src/dnf-native-combat/data/types | character/fighter/atanimation/sit.ani |
| `chr.motionRefs.throw motion 1-1[].targetKind` | 11 | string | 3 | 3 | 1 | 5 | 0 | runtime consumer: src/dnf-native-combat/data/types | ani |
| `chr.motionRefs.throw motion 1-1[].targetPath` | 11 | string | 3 | 3 | 1 | 6 | 0 | runtime consumer: src/dnf-native-combat/data/types | character/fighter/atanimation/throwprepare.ani |
| `chr.motionRefs.throw motion 1-2[].targetKind` | 11 | string | 3 | 3 | 1 | 5 | 0 | runtime consumer: src/dnf-native-combat/data/types | ani |
| `chr.motionRefs.throw motion 1-2[].targetPath` | 11 | string | 3 | 3 | 1 | 6 | 0 | runtime consumer: src/dnf-native-combat/data/types | character/fighter/atanimation/throw.ani |
| `chr.motionRefs.throw motion 2-1[].targetKind` | 11 | string | 3 | 3 | 1 | 5 | 0 | runtime consumer: src/dnf-native-combat/data/types | ani |
| `chr.motionRefs.throw motion 2-1[].targetPath` | 11 | string | 3 | 3 | 1 | 6 | 0 | runtime consumer: src/dnf-native-combat/data/types | character/fighter/atanimation/shootprepare.ani |
| `chr.motionRefs.throw motion 2-2[].targetKind` | 11 | string | 3 | 3 | 1 | 5 | 0 | runtime consumer: src/dnf-native-combat/data/types | ani |
| `chr.motionRefs.throw motion 2-2[].targetPath` | 11 | string | 3 | 3 | 1 | 6 | 0 | runtime consumer: src/dnf-native-combat/data/types | character/fighter/atanimation/shoot.ani |
| `chr.motionRefs.waiting motion[].targetKind` | 11 | string | 3 | 3 | 1 | 5 | 0 | runtime consumer: src/dnf-native-combat/data/types | ani |
| `chr.motionRefs.waiting motion[].targetPath` | 11 | string | 3 | 3 | 1 | 6 | 0 | runtime consumer: src/dnf-native-combat/data/types | character/fighter/atanimation/stay.ani |
| `chr.moveSpeed.value` | 11 | number | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy | 880 |
| `chr.path` | 11 | string | 24 | 26 | 1 | 30 | 30 | runtime consumer: src/combat/damage/DamageFormula. | character/fighter/atfighter.chr |
| `chr.raw.extract_timestamp` | 11 | string | 7 | 4 | 0 | 16 | 1 | runtime consumer: src/dnf-native-combat/data/types | 2026-05-27T03:45:20Z |
| `chr.raw.path` | 11 | string | 24 | 26 | 1 | 30 | 30 | runtime consumer: src/combat/damage/DamageFormula. | character/fighter/atfighter.chr |
| `chr.raw.sections[].name` | 11 | string | 19 | 31 | 1 | 22 | 15 | runtime consumer: src/combat/actions/FrameDataActi | upgrade weapon attack power rate |
| `chr.raw.source_pvf_hash` | 11 | string | 6 | 5 | 0 | 15 | 1 | runtime consumer: src/dnf-native-combat/data/pipel | crc32-head:c0779278\|size:205695984 |
| `chr.raw.type` | 11 | string | 22 | 81 | 1 | 42 | 10 | runtime consumer: src/combat/actions/FrameDataActi | document |
| `chr.sections[].name` | 11 | string | 19 | 31 | 1 | 22 | 15 | runtime consumer: src/combat/actions/FrameDataActi | upgrade weapon attack power rate |
| `chr.upgradeWeaponAttackPowerRate[]` | 11 | number | 1 | 1 | 1 | 2 | 0 | runtime consumer: src/dnf-native-combat/data/types | 0.95 |
| `chr.weaponDurabilityDecreaseRate[]` | 11 | number | 1 | 1 | 1 | 2 | 0 | runtime consumer: src/dnf-native-combat/data/types | 1 |
| `chr.weaponHitInfo[].bloodTag` | 11 | string | 1 | 3 | 1 | 1 | 0 | runtime consumer: src/data/official/dnf/swordman/c | [no blood] |
| `chr.weaponHitInfo[].critOrSimilar` | 11 | number | 1 | 3 | 1 | 1 | 0 | runtime consumer: src/data/official/dnf/swordman/c | 1 |
| `chr.weaponHitInfo[].damageScalePct` | 11 | number | 1 | 3 | 1 | 1 | 0 | runtime consumer: src/data/official/dnf/swordman/c | 85 |
| `chr.weaponHitInfo[].hitTag` | 11 | string | 1 | 3 | 1 | 1 | 0 | runtime consumer: src/data/official/dnf/swordman/c | [blow] |
| `chr.weaponHitInfo[].launch` | 11 | number | 3 | 22 | 1 | 7 | 1 | runtime consumer: src/combat/ai/EnemyAI.ts, src/co | 0.15 |
| `chr.weaponHitInfo[].pushBack` | 11 | number | 1 | 3 | 1 | 1 | 0 | runtime consumer: src/data/official/dnf/swordman/c | -0.05 |
| `chr.weaponSkillInfo[]` | 11 | number | 1 | 1 | 1 | 2 | 0 | runtime consumer: src/dnf-native-combat/data/types | 0.95 |
| `chr.weight.value` | 11 | number | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy | 50000 |
| `chr.widthBox[]` | 11 | number | 2 | 5 | 1 | 2 | 0 | runtime consumer: src/data/official/dnf/swordman/c | 40 |
| `etc` | 11 | null | 8 | 9 | 1 | 6 | 3 | runtime consumer: src/combat/damage/DamageFormula. |  |
| `job` | 11 | string | 4 | 5 | 1 | 11 | 3 | runtime consumer: src/data/official/dnf/characters | atfighter |
| `chr.motionRefs.attack motion[].targetKind` | 10 | string | 3 | 3 | 1 | 5 | 0 | runtime consumer: src/dnf-native-combat/data/types | ani |
| `chr.motionRefs.attack motion[].targetPath` | 10 | string | 3 | 3 | 1 | 6 | 0 | runtime consumer: src/dnf-native-combat/data/types | character/fighter/atanimation/attack1.ani |
| `animations` | 9 | object(empty) | 3 | 2 | 0 | 3 | 4 | runtime consumer: src/data/official/dnf/swordman/i |  |
| `attacks` | 9 | object(empty) | 2 | 7 | 0 | 4 | 3 | runtime consumer: src/combat/kernel/CombatKernel.t |  |
| `chr.motionRefs.throw motion 3-1[].targetKind` | 9 | string | 3 | 3 | 1 | 5 | 0 | runtime consumer: src/dnf-native-combat/data/types | ani |
| `chr.motionRefs.throw motion 3-1[].targetPath` | 9 | string | 3 | 3 | 1 | 6 | 0 | runtime consumer: src/dnf-native-combat/data/types | character/fighter/atanimation/chargeprepare.ani |
| `chr.motionRefs.throw motion 3-2[].targetKind` | 9 | string | 3 | 3 | 1 | 5 | 0 | runtime consumer: src/dnf-native-combat/data/types | ani |
| `chr.motionRefs.throw motion 3-2[].targetPath` | 9 | string | 3 | 3 | 1 | 6 | 0 | runtime consumer: src/dnf-native-combat/data/types | character/fighter/atanimation/charge.ani |
| `chr.weaponWav[].format` | 9 | string | 11 | 2 | 1 | 6 | 4 | runtime consumer: src/dnf-native-combat/data/types | stereo |
| `skills` | 9 | object(empty) | 3 | 5 | 0 | 5 | 6 | runtime consumer: src/data/official/dnf/swordman/c |  |
| `chr.darkResistance` | 7 | null | 1 | 3 | 1 | 2 | 0 | runtime consumer: src/data/official/dnf/swordman/c |  |
| `chr.lightResistance` | 7 | null | 1 | 3 | 1 | 2 | 0 | runtime consumer: src/data/official/dnf/swordman/c |  |
| `chr.motionRefs.throw motion 4-1[].targetKind` | 6 | string | 3 | 3 | 1 | 5 | 0 | runtime consumer: src/dnf-native-combat/data/types | ani |
| `chr.motionRefs.throw motion 4-1[].targetPath` | 6 | string | 3 | 3 | 1 | 6 | 0 | runtime consumer: src/dnf-native-combat/data/types | character/gunner/atanimation/setrobot.ani |
| `chr.motionRefs.throw motion 4-2[].targetKind` | 6 | string | 3 | 3 | 1 | 5 | 0 | runtime consumer: src/dnf-native-combat/data/types | ani |
| `chr.motionRefs.throw motion 4-2[].targetPath` | 6 | string | 3 | 3 | 1 | 6 | 0 | runtime consumer: src/dnf-native-combat/data/types | character/gunner/atanimation/setrobot.ani |
| `chr.darkResistance.value` | 4 | number | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy | -20 |
| `chr.lightResistance.value` | 4 | number | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy | 20 |
| `chr.weaponWav[].attackSwingA` | 4 | string | 1 | 2 | 1 | 0 | 0 | runtime consumer: src/data/official/dnf/swordman/c | r_knucklea |
| `chr.weaponWav[].attackSwingB` | 4 | string | 1 | 2 | 1 | 0 | 0 | runtime consumer: src/data/official/dnf/swordman/c | r_knuckleb |
| `chr.weaponWav[].hit` | 4 | string | 5 | 22 | 1 | 11 | 2 | runtime consumer: src/combat/actions/FrameDataActi | r_spear_hit |
| `chr.weaponWav[].hitA` | 4 | string | 1 | 2 | 1 | 0 | 0 | runtime consumer: src/data/official/dnf/swordman/c | r_knucklea_hit |
| `chr.weaponWav[].hitB` | 4 | string | 1 | 2 | 1 | 0 | 0 | runtime consumer: src/data/official/dnf/swordman/c | r_knuckleb_hit |
| `chr.weaponWav[].swing` | 4 | string | 1 | 1 | 1 | 2 | 0 | runtime consumer: src/dnf-native-combat/data/types | r_spear |
| `animations{}.frames[].anchor.x` | 3 | number | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | -91 |
| `animations{}.frames[].anchor.y` | 3 | number | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | -152 |
| `animations{}.frames[].attackBoxes` | 3 | array(empty) | 1 | 2 | 0 | 2 | 2 | business whitelist (review pass 1) — Phase 3+ runt |  |
| `animations{}.frames[].delay` | 3 | number | 5 | 6 | 0 | 4 | 2 | runtime consumer: src/data/official/dnf/swordman/a | 10000 |
| `animations{}.frames[].imgId` | 3 | number | 4 | 2 | 0 | 1 | 1 | runtime consumer: src/dnf-native-combat/data/types | 0 |
| `animations{}.frames[].imgParam` | 3 | number | 4 | 3 | 0 | 1 | 2 | runtime consumer: src/data/official/dnf/swordman/a | 5 |
| `animations{}.frames[].index` | 3 | number | 17 | 25 | 1 | 9 | 6 | runtime consumer: src/combat/kernel/CombatSystem.t | 0 |
| `animations{}.frames[].sprite` | 3 | string | 4 | 8 | 0 | 5 | 4 | runtime consumer: src/data/official/dnf/swordman/a | monster/goblin/event/goblin.img |
| `animations{}.framesCount` | 3 | number | 5 | 5 | 0 | 5 | 2 | runtime consumer: src/data/official/dnf/swordman/a | 1 |
| `animations{}.loop` | 3 | boolean | 9 | 6 | 0 | 4 | 3 | runtime consumer: src/data/official/dnf/swordman/a | false |
| `animations{}.path` | 3 | string | 24 | 26 | 1 | 30 | 30 | runtime consumer: src/combat/damage/DamageFormula. | monster/goblin/animation_goblin2/damage1.ani |
| `animations{}.frames[].damageBoxes` | 2 | array(empty) | 1 | 2 | 0 | 2 | 2 | business whitelist (review pass 1) — Phase 3+ runt |  |
| `attacks{}.attackEnemy` | 2 | boolean | 1 | 3 | 1 | 3 | 0 | runtime consumer: src/data/official/dnf/swordman/a | true |
| `attacks{}.attackFriend` | 2 | boolean | 1 | 3 | 1 | 3 | 0 | runtime consumer: src/data/official/dnf/swordman/a | false |
| `attacks{}.attackKind` | 2 | string | 3 | 5 | 1 | 4 | 1 | runtime consumer: src/data/official/dnf/swordman/a | physic |
| `attacks{}.causesBounce` | 2 | boolean | 1 | 3 | 1 | 2 | 0 | runtime consumer: src/data/official/dnf/swordman/a | false |
| `attacks{}.causesDown` | 2 | boolean | 1 | 4 | 1 | 3 | 0 | runtime consumer: src/data/official/dnf/swordman/a | true |
| `attacks{}.causesStuck` | 2 | boolean | 1 | 3 | 1 | 2 | 0 | runtime consumer: src/data/official/dnf/swordman/a | false |
| `attacks{}.causesStun` | 2 | boolean | 1 | 3 | 1 | 2 | 0 | runtime consumer: src/data/official/dnf/swordman/a | false |
| `attacks{}.damageBonus.value` | 2 | number | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy | 90 |
| `attacks{}.element` | 2 | string | 3 | 5 | 1 | 6 | 3 | runtime consumer: src/data/official/dnf/swordman/a | none |
| `attacks{}.hitReaction` | 2 | string | 2 | 3 | 1 | 4 | 0 | runtime consumer: src/data/official/dnf/swordman/a | hit_lift_up |
| `attacks{}.hitWav` | 2 | null | 1 | 3 | 1 | 2 | 0 | runtime consumer: src/data/official/dnf/swordman/a |  |
| `attacks{}.ignoreWeight` | 2 | boolean | 1 | 3 | 1 | 2 | 0 | runtime consumer: src/data/official/dnf/swordman/a | false |
| `attacks{}.kind` | 2 | string | 12 | 22 | 1 | 20 | 4 | runtime consumer: src/data/official/dnf/swordman/m | atk |
| `attacks{}.knuckBack` | 2 | null | 1 | 3 | 1 | 3 | 0 | runtime consumer: src/data/official/dnf/swordman/a |  |
| `attacks{}.liftUp.value` | 2 | number | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy | 400 |
| `attacks{}.path` | 2 | string | 24 | 26 | 1 | 30 | 30 | runtime consumer: src/combat/damage/DamageFormula. | character/swordman/attackinfo/weaponcomboshort3.at |
| `attacks{}.pushAside.value` | 2 | number | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy | 40 |
| `attacks{}.pvpOnly` | 2 | boolean | 3 | 3 | 1 | 4 | 0 | runtime consumer: src/data/official/dnf/swordman/a | false |
| `attacks{}.raw.extract_timestamp` | 2 | string | 7 | 4 | 0 | 16 | 1 | runtime consumer: src/dnf-native-combat/data/types | 2026-05-27T03:45:20Z |
| `attacks{}.raw.path` | 2 | string | 24 | 26 | 1 | 30 | 30 | runtime consumer: src/combat/damage/DamageFormula. | character/swordman/attackinfo/weaponcomboshort3.at |
| `attacks{}.raw.sections[].attributes` | 2 | array(empty) | 10 | 4 | 1 | 11 | 1 | runtime consumer: src/data/official/dnf/swordman/c |  |
| `attacks{}.raw.sections[].name` | 2 | string | 19 | 31 | 1 | 22 | 15 | runtime consumer: src/combat/actions/FrameDataActi | hit lift up |
| `attacks{}.raw.source_pvf_hash` | 2 | string | 6 | 5 | 0 | 15 | 1 | runtime consumer: src/dnf-native-combat/data/pipel | crc32-head:c0779278\|size:205695984 |
| `attacks{}.raw.type` | 2 | string | 22 | 81 | 1 | 42 | 10 | runtime consumer: src/combat/actions/FrameDataActi | document |
| `attacks{}.sections[].attributes` | 2 | array(empty) | 10 | 4 | 1 | 11 | 1 | runtime consumer: src/data/official/dnf/swordman/c |  |
| `attacks{}.sections[].name` | 2 | string | 19 | 31 | 1 | 22 | 15 | runtime consumer: src/combat/actions/FrameDataActi | hit lift up |
| `attacks{}.weaponDamageApply` | 2 | boolean | 1 | 3 | 1 | 3 | 0 | runtime consumer: src/data/official/dnf/swordman/a | true |
| `chr.raw.sections[].attributes` | 2 | array(empty) | 10 | 4 | 1 | 11 | 1 | runtime consumer: src/data/official/dnf/swordman/c |  |
| `chr.sections[].attributes` | 2 | array(empty) | 10 | 4 | 1 | 11 | 1 | runtime consumer: src/data/official/dnf/swordman/c |  |
| `chr.weaponWav[]` | 2 | null | 1 | 1 | 1 | 4 | 0 | runtime consumer: src/dnf-native-combat/data/types |  |
| `skills{}.autoCoolTimeApply` | 2 | boolean | 1 | 2 | 1 | 3 | 0 | runtime consumer: src/dnf-native-combat/data/types | false |
| `skills{}.cancelWindow` | 2 | null | 1 | 3 | 1 | 3 | 0 | runtime consumer: src/data/official/dnf/swordman/c |  |
| `skills{}.castingTime.baseMs` | 2 | number | 1 | 2 | 1 | 0 | 0 | runtime consumer: src/dnf-native-combat/data/types | 300 |
| `skills{}.castingTime.lvl20Ms` | 2 | number | 1 | 2 | 1 | 0 | 0 | runtime consumer: src/dnf-native-combat/data/types | 300 |
| `skills{}.command[]` | 2 | string | 1 | 9 | 1 | 4 | 6 | runtime consumer: src/combat/input/BrowserInputSta | (right) |
| `skills{}.consumeItem` | 2 | null | 1 | 2 | 1 | 2 | 0 | runtime consumer: src/dnf-native-combat/data/types |  |
| `skills{}.consumeMp.baseMp` | 2 | number | 1 | 2 | 1 | 0 | 0 | runtime consumer: src/dnf-native-combat/data/types | 27 |
| `skills{}.consumeMp.lvlMaxMp` | 2 | number | 1 | 2 | 1 | 0 | 0 | runtime consumer: src/dnf-native-combat/data/types | 308 |
| `skills{}.coolTime.dungeonMs` | 2 | number | 1 | 2 | 1 | 0 | 1 | runtime consumer: src/dnf-native-combat/data/types | 7000 |
| `skills{}.coolTime.pvpMs` | 2 | number | 1 | 2 | 1 | 0 | 0 | runtime consumer: src/dnf-native-combat/data/types | 7000 |
| `skills{}.durabilityDecreaseRate.value` | 2 | number | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy | 25 |
| `skills{}.featureSkillIndex` | 2 | number | 1 | 3 | 1 | 2 | 0 | runtime consumer: src/data/official/dnf/swordman/s | 216 |
| `skills{}.growtypeMaximumLevel[]` | 2 | number | 1 | 2 | 1 | 3 | 0 | runtime consumer: src/dnf-native-combat/data/types | 0 |
| `skills{}.hasDeathTower` | 2 | boolean | 1 | 2 | 1 | 3 | 0 | runtime consumer: src/dnf-native-combat/data/types | true |
| `skills{}.hasDungeon` | 2 | boolean | 2 | 2 | 1 | 4 | 0 | runtime consumer: src/dnf-native-combat/data/types | true |
| `skills{}.hasPvp` | 2 | boolean | 3 | 2 | 1 | 4 | 0 | runtime consumer: src/dnf-native-combat/data/types | true |
| `skills{}.hasWarroom` | 2 | boolean | 1 | 2 | 1 | 3 | 0 | runtime consumer: src/dnf-native-combat/data/types | true |
| `skills{}.icon.atlasPath` | 2 | string | 1 | 2 | 1 | 0 | 0 | runtime consumer: src/dnf-native-combat/data/types | character/swordman/effect/skillicon.img |
| `skills{}.icon.frame` | 2 | number | 8 | 24 | 1 | 22 | 7 | runtime consumer: src/combat/actions/FrameDataActi | 0 |
| `skills{}.icon.litAtlasPath` | 2 | string | 1 | 2 | 1 | 0 | 0 | runtime consumer: src/dnf-native-combat/data/types | character/swordman/effect/skillicon.img |
| `skills{}.icon.litFrame` | 2 | number | 1 | 2 | 1 | 0 | 0 | runtime consumer: src/dnf-native-combat/data/types | 1 |
| `skills{}.kind` | 2 | string | 12 | 22 | 1 | 20 | 4 | runtime consumer: src/data/official/dnf/swordman/m | skl |
| `skills{}.levelInfo` | 2 | null | 1 | 2 | 1 | 2 | 0 | runtime consumer: src/dnf-native-combat/data/types |  |
| `skills{}.levelProperty[].t` | 2 | string | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | int |
| `skills{}.levelProperty[].v` | 2 | number|string | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | 1 |
| `skills{}.maintainMp` | 2 | null | 1 | 2 | 1 | 2 | 0 | runtime consumer: src/dnf-native-combat/data/types |  |
| `skills{}.maximumLevel.value` | 2 | number | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy | 70 |
| `skills{}.name.value` | 2 | string | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy |  |
| `skills{}.path` | 2 | string | 24 | 26 | 1 | 30 | 30 | runtime consumer: src/combat/damage/DamageFormula. | skill/swordman/icewave.skl |
| `skills{}.preRequiredSkill` | 2 | null | 1 | 3 | 1 | 2 | 0 | runtime consumer: src/data/official/dnf/swordman/s |  |
| `skills{}.purchaseCost.value` | 2 | number | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy | 25 |
| `skills{}.raw.extract_timestamp` | 2 | string | 7 | 4 | 0 | 16 | 1 | runtime consumer: src/dnf-native-combat/data/types | 2026-05-27T03:45:20Z |
| `skills{}.raw.path` | 2 | string | 24 | 26 | 1 | 30 | 30 | runtime consumer: src/combat/damage/DamageFormula. | skill/swordman/icewave.skl |
| `skills{}.raw.sections[].attributes` | 2 | array(empty) | 10 | 4 | 1 | 11 | 1 | runtime consumer: src/data/official/dnf/swordman/c |  |
| `skills{}.raw.sections[].attributes[]._note` | 2 | string | 3 | 1 | 0 | 1 | 0 | runtime consumer: src/dnf-native-combat/data/types | ref_ext_but_path_not_found |
| `skills{}.raw.sections[].name` | 2 | string | 19 | 31 | 1 | 22 | 15 | runtime consumer: src/combat/actions/FrameDataActi | skill preloading image |
| `skills{}.raw.source_pvf_hash` | 2 | string | 6 | 5 | 0 | 15 | 1 | runtime consumer: src/dnf-native-combat/data/pipel | crc32-head:c0779278\|size:205695984 |
| `skills{}.raw.type` | 2 | string | 22 | 81 | 1 | 42 | 10 | runtime consumer: src/combat/actions/FrameDataActi | document |
| `skills{}.requiredLevel.value` | 2 | number | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy | 30 |
| `skills{}.requiredLevelRange.value` | 2 | number | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy | 2 |
| `skills{}.sections[].attributes` | 2 | array(empty) | 10 | 4 | 1 | 11 | 1 | runtime consumer: src/data/official/dnf/swordman/c |  |
| `skills{}.sections[].attributes[]._note` | 2 | string | 3 | 1 | 0 | 1 | 0 | runtime consumer: src/dnf-native-combat/data/types | ref_ext_but_path_not_found |
| `skills{}.sections[].name` | 2 | string | 19 | 31 | 1 | 22 | 15 | runtime consumer: src/combat/actions/FrameDataActi | skill preloading image |
| `skills{}.skillClass.value` | 2 | number | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy | 0 |
| `skills{}.skillCommandAdvantage.advanced` | 2 | number | 1 | 2 | 1 | 1 | 0 | runtime consumer: src/dnf-native-combat/data/types | 40 |
| `skills{}.skillCommandAdvantage.normal` | 2 | number | 4 | 6 | 1 | 5 | 0 | runtime consumer: src/combat/motion/AirbornePhysic | 20 |
| `skills{}.skillFitnessGrowtype[]` | 2 | number | 1 | 2 | 1 | 3 | 0 | runtime consumer: src/dnf-native-combat/data/types | 4 |
| `skills{}.skillType` | 2 | string | 2 | 2 | 1 | 4 | 0 | runtime consumer: src/dnf-native-combat/data/types | active |
| `skills{}.weaponEffectType` | 2 | string | 2 | 3 | 1 | 3 | 0 | runtime consumer: src/data/official/dnf/swordman/s | unknown |
| `animations{}.frames[].damageBoxes[].raw[]` | 1 | number | 16 | 17 | 1 | 16 | 7 | business whitelist (review pass 1) — Phase 3+ runt | -9 |
| `animations{}.frames[].damageBoxes[].x1` | 1 | number | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | -9 |
| `animations{}.frames[].damageBoxes[].x2` | 1 | number | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | 31 |
| `animations{}.frames[].damageBoxes[].y1` | 1 | number | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | -5 |
| `animations{}.frames[].damageBoxes[].y2` | 1 | number | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | 10 |
| `animations{}.frames[].damageBoxes[].z1` | 1 | number | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | -1 |
| `animations{}.frames[].damageBoxes[].z2` | 1 | number | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | 59 |
| `attacks.attack1.attackEnemy` | 1 | boolean | 1 | 3 | 1 | 3 | 0 | runtime consumer: src/data/official/dnf/swordman/a | true |
| `attacks.attack1.attackFriend` | 1 | boolean | 1 | 3 | 1 | 3 | 0 | runtime consumer: src/data/official/dnf/swordman/a | false |
| `attacks.attack1.attackKind` | 1 | string | 3 | 5 | 1 | 4 | 1 | runtime consumer: src/data/official/dnf/swordman/a | physic |
| `attacks.attack1.causesBounce` | 1 | boolean | 1 | 3 | 1 | 2 | 0 | runtime consumer: src/data/official/dnf/swordman/a | false |
| `attacks.attack1.causesDown` | 1 | boolean | 1 | 4 | 1 | 3 | 0 | runtime consumer: src/data/official/dnf/swordman/a | false |
| `attacks.attack1.causesStuck` | 1 | boolean | 1 | 3 | 1 | 2 | 0 | runtime consumer: src/data/official/dnf/swordman/a | false |
| `attacks.attack1.causesStun` | 1 | boolean | 1 | 3 | 1 | 2 | 0 | runtime consumer: src/data/official/dnf/swordman/a | false |
| `attacks.attack1.damageBonus` | 1 | null | 1 | 3 | 1 | 4 | 0 | runtime consumer: src/data/official/dnf/swordman/a |  |
| `attacks.attack1.element` | 1 | string | 3 | 5 | 1 | 6 | 3 | runtime consumer: src/data/official/dnf/swordman/a | none |
| `attacks.attack1.hitReaction` | 1 | string | 2 | 3 | 1 | 4 | 0 | runtime consumer: src/data/official/dnf/swordman/a | hit_down |
| `attacks.attack1.hitWav.value` | 1 | string | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy | staff_hit |
| `attacks.attack1.ignoreWeight` | 1 | boolean | 1 | 3 | 1 | 2 | 0 | runtime consumer: src/data/official/dnf/swordman/a | false |
| `attacks.attack1.kind` | 1 | string | 12 | 22 | 1 | 20 | 4 | runtime consumer: src/data/official/dnf/swordman/m | atk |
| `attacks.attack1.knuckBack` | 1 | null | 1 | 3 | 1 | 3 | 0 | runtime consumer: src/data/official/dnf/swordman/a |  |
| `attacks.attack1.liftUp.value` | 1 | number | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy | 300 |
| `attacks.attack1.path` | 1 | string | 24 | 26 | 1 | 30 | 30 | runtime consumer: src/combat/damage/DamageFormula. | monster/goblin/attackinfo/attack1.atk |
| `attacks.attack1.pushAside.value` | 1 | number | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy | 100 |
| `attacks.attack1.pvpOnly` | 1 | boolean | 3 | 3 | 1 | 4 | 0 | runtime consumer: src/data/official/dnf/swordman/a | false |
| `attacks.attack1.raw.extract_timestamp` | 1 | string | 7 | 4 | 0 | 16 | 1 | runtime consumer: src/dnf-native-combat/data/types | 2026-05-27T03:45:20Z |
| `attacks.attack1.raw.path` | 1 | string | 24 | 26 | 1 | 30 | 30 | runtime consumer: src/combat/damage/DamageFormula. | monster/goblin/attackinfo/attack1.atk |
| `attacks.attack1.raw.sections[].attributes` | 1 | array(empty) | 10 | 4 | 1 | 11 | 1 | runtime consumer: src/data/official/dnf/swordman/c |  |
| `attacks.attack1.raw.sections[].name` | 1 | string | 19 | 31 | 1 | 22 | 15 | runtime consumer: src/combat/actions/FrameDataActi | no blood |
| `attacks.attack1.raw.source_pvf_hash` | 1 | string | 6 | 5 | 0 | 15 | 1 | runtime consumer: src/dnf-native-combat/data/pipel | crc32-head:c0779278\|size:205695984 |
| `attacks.attack1.raw.type` | 1 | string | 22 | 81 | 1 | 42 | 10 | runtime consumer: src/combat/actions/FrameDataActi | document |
| `attacks.attack1.sections[].attributes` | 1 | array(empty) | 10 | 4 | 1 | 11 | 1 | runtime consumer: src/data/official/dnf/swordman/c |  |
| `attacks.attack1.sections[].name` | 1 | string | 19 | 31 | 1 | 22 | 15 | runtime consumer: src/combat/actions/FrameDataActi | no blood |
| `attacks.attack1.weaponDamageApply` | 1 | boolean | 1 | 3 | 1 | 3 | 0 | runtime consumer: src/data/official/dnf/swordman/a | true |
| `chr.raw.sections[].attributes[].cols` | 1 | number | 3 | 5 | 1 | 4 | 2 | runtime consumer: src/data/official/dnf/swordman/c | 2 |
| `chr.raw.sections[].attributes[].item_type` | 1 | string | 3 | 1 | 0 | 4 | 0 | runtime consumer: src/dnf-native-combat/data/types | str |
| `chr.raw.sections[].attributes[].rows` | 1 | number | 6 | 5 | 1 | 5 | 2 | runtime consumer: src/data/official/dnf/swordman/c | 6 |
| `chr.sections[].attributes[].cols` | 1 | number | 3 | 5 | 1 | 4 | 2 | runtime consumer: src/data/official/dnf/swordman/c | 2 |
| `chr.sections[].attributes[].item_type` | 1 | string | 3 | 1 | 0 | 4 | 0 | runtime consumer: src/dnf-native-combat/data/types | str |
| `chr.sections[].attributes[].rows` | 1 | number | 6 | 5 | 1 | 5 | 2 | runtime consumer: src/data/official/dnf/swordman/c | 6 |
| `chr.weaponWav[].entries[].hit` | 1 | string | 5 | 22 | 1 | 11 | 2 | runtime consumer: src/combat/actions/FrameDataActi | r_dagger_hit |
| `chr.weaponWav[].entries[].swing` | 1 | string | 1 | 1 | 1 | 2 | 0 | runtime consumer: src/dnf-native-combat/data/types | r_dagger |
| `constants.defaultGravityAccel` | 1 | number | 0 | 5 | 0 | 1 | 1 | business whitelist (review pass 1) — Phase 3+ runt | -1500 |
| `constants.downParamType.bounce` | 1 | number | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | 4 |
| `constants.downParamType.bounceForce` | 1 | number | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | 3 |
| `constants.downParamType.bounceValue` | 1 | number | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | 2 |
| `constants.downParamType.force` | 1 | number | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | 1 |
| `constants.downParamType.value` | 1 | number | 18 | 33 | 1 | 23 | 8 | business whitelist (review pass 1) — Phase 3+ runt | 0 |
| `constants.forceToVelocityConst` | 1 | number | 0 | 3 | 0 | 0 | 1 | business whitelist (review pass 1) — Phase 3+ runt | 4000 |
| `constants.hitRecoveryStatusType` | 1 | number | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | 34 |
| `constants.knockBackType.custom` | 1 | number | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | 4 |
| `constants.knockBackType.none` | 1 | number | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | 3 |
| `constants.knockBackType.normal` | 1 | number | 4 | 6 | 1 | 5 | 0 | business whitelist (review pass 1) — Phase 3+ runt | 0 |
| `constants.knockBackType.strong` | 1 | number | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | 1 |
| `constants.knockBackType.weak` | 1 | number | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | 2 |
| `constants.lightObjectMaxWeight` | 1 | number | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | 60000 |
| `constants.meleeHitDelayStatusType` | 1 | number | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | 35 |
| `constants.middleObjectMaxWeight` | 1 | number | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | 100000 |
| `constants.speedValueDefault` | 1 | number | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | 1000 |
| `constants.xNormalMoveVelocity` | 1 | number | 0 | 3 | 0 | 0 | 1 | business whitelist (review pass 1) — Phase 3+ runt | 143 |
| `constants.yNormalMoveVelocity` | 1 | number | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | 114 |
| `constants.zAccelType.antiGravityObject` | 1 | number | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | 2 |
| `constants.zAccelType.gravityObject` | 1 | number | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | 1 |
| `constants.zAccelType.gravityWorld` | 1 | number | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | 0 |
| `dgn.backgroundPos.value` | 1 | number | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy | 80 |
| `dgn.basisLevel.value` | 1 | number | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy | 31 |
| `dgn.bossMap[]` | 1 | number | 1 | 2 | 1 | 2 | 0 | runtime consumer: src/dnf-native-combat/data/types | 0 |
| `dgn.championLevels[]` | 1 | number | 1 | 2 | 1 | 2 | 0 | runtime consumer: src/dnf-native-combat/data/types | 8 |
| `dgn.enteringTitleRefs[].targetKind` | 1 | string | 3 | 3 | 1 | 5 | 0 | runtime consumer: src/dnf-native-combat/data/types | ani |
| `dgn.enteringTitleRefs[].targetPath` | 1 | string | 3 | 3 | 1 | 6 | 0 | runtime consumer: src/dnf-native-combat/data/types | dungeon/act3/title/jungle.ani |
| `dgn.eventMonsters[]` | 1 | number | 2 | 2 | 1 | 2 | 0 | runtime consumer: src/dnf-native-combat/data/types | 1 |
| `dgn.experienceIncreasingPoint.value` | 1 | number | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy | 0.9 |
| `dgn.explain.value` | 1 | string | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy |  |
| `dgn.greedLayout` | 1 | string | 1 | 2 | 1 | 2 | 0 | runtime consumer: src/dnf-native-combat/data/types | bbnnnnee  jjhhhhmm  ddnnnngg  bbhhhhee |
| `dgn.imageRefs[].path` | 1 | string | 24 | 26 | 1 | 30 | 30 | runtime consumer: src/combat/damage/DamageFormula. | map/cutscene/behemoth.img |
| `dgn.imageRefs[].resolved` | 1 | boolean | 5 | 3 | 1 | 4 | 8 | runtime consumer: src/combat/damage/DamageResolver | false |
| `dgn.imageRefs[].section` | 1 | string | 14 | 9 | 1 | 13 | 1 | runtime consumer: src/data/official/dnf/swordman/c | cutscene image |
| `dgn.kind` | 1 | string | 12 | 22 | 1 | 20 | 4 | runtime consumer: src/data/official/dnf/swordman/m | dgn |
| `dgn.mapSpecification.cols` | 1 | number | 3 | 5 | 1 | 4 | 2 | business whitelist (review pass 1) — Phase 3+ runt | 3 |
| `dgn.mapSpecification.items[][]` | 1 | number | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | 1 |
| `dgn.mapSpecification.rows` | 1 | number | 6 | 5 | 1 | 5 | 2 | business whitelist (review pass 1) — Phase 3+ runt | 8 |
| `dgn.minimumRequiredLevel.value` | 1 | number | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy | 28 |
| `dgn.name.value` | 1 | string | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy |  |
| `dgn.path` | 1 | string | 24 | 26 | 1 | 30 | 30 | runtime consumer: src/combat/damage/DamageFormula. | dungeon/act3/jungle.dgn |
| `dgn.pathgateObjects[]` | 1 | number | 1 | 2 | 1 | 2 | 0 | runtime consumer: src/dnf-native-combat/data/types | 431 |
| `dgn.raw.maze info` | 1 | array(empty) | 0 | 1 | 0 | 1 | 0 | runtime consumer: src/dnf-native-combat/data/types |  |
| `dgn.sections[].attributes[].cols` | 1 | number | 3 | 5 | 1 | 4 | 2 | runtime consumer: src/data/official/dnf/swordman/c | 3 |
| `dgn.sections[].attributes[].item_type` | 1 | string | 3 | 1 | 0 | 4 | 0 | runtime consumer: src/dnf-native-combat/data/types | int |
| `dgn.sections[].attributes[].rows` | 1 | number | 6 | 5 | 1 | 5 | 2 | runtime consumer: src/data/official/dnf/swordman/c | 8 |
| `dgn.sections[].name` | 1 | string | 19 | 31 | 1 | 22 | 15 | runtime consumer: src/combat/actions/FrameDataActi | explain |
| `dgn.size.height` | 1 | number | 4 | 14 | 1 | 4 | 6 | runtime consumer: src/combat/types.ts, src/data/of | 4 |
| `dgn.size.width` | 1 | number | 7 | 17 | 1 | 5 | 6 | runtime consumer: src/combat/hit/HitResolver2D5.ts | 4 |
| `dgn.startMap[]` | 1 | number | 1 | 2 | 1 | 2 | 0 | runtime consumer: src/dnf-native-combat/data/types | 0 |
| `field_to_enum.attack type` | 1 | string | 1 | 1 | 0 | 1 | 0 | runtime consumer: src/data/official/dnfEnumTables. | ATTACKTYPE |
| `field_to_enum.custom attack info` | 1 | string | 1 | 1 | 0 | 0 | 0 | runtime consumer: src/data/official/dnfEnumTables. | CUSTOM_ATTACKINFO |
| `field_to_enum.damage reaction` | 1 | string | 1 | 1 | 0 | 0 | 0 | runtime consumer: src/data/official/dnfEnumTables. | DAMAGEACT |
| `field_to_enum.down param type` | 1 | string | 1 | 1 | 0 | 0 | 0 | runtime consumer: src/data/official/dnfEnumTables. | DOWN_PARAM_TYPE |
| `field_to_enum.elemental property` | 1 | string | 1 | 1 | 0 | 0 | 0 | runtime consumer: src/data/official/dnfEnumTables. | ELEMENT |
| `field_to_enum.knock back type` | 1 | string | 1 | 1 | 0 | 0 | 0 | runtime consumer: src/data/official/dnfEnumTables. | KNOCK_BACK_TYPE |
| `files[].kind` | 1 | string | 12 | 22 | 1 | 20 | 4 | runtime consumer: src/data/official/dnf/swordman/m | player |
| `files[].path` | 1 | string | 24 | 26 | 1 | 30 | 30 | runtime consumer: src/combat/damage/DamageFormula. | players/swordman.json |
| `maps[].animationRefs[].targetKind` | 1 | string | 3 | 3 | 1 | 5 | 0 | runtime consumer: src/dnf-native-combat/data/types | ani |
| `maps[].animationRefs[].targetPath` | 1 | string | 3 | 3 | 1 | 6 | 0 | runtime consumer: src/dnf-native-combat/data/types | map/jungle/animation/act3_vine.ani |
| `maps[].backgroundAnimation` | 1 | array(empty) | 1 | 2 | 1 | 3 | 0 | runtime consumer: src/dnf-native-combat/data/types |  |
| `maps[].dungeonId.value` | 1 | number | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy | 22 |
| `maps[].eventMonsterPositions[]` | 1 | number | 1 | 2 | 1 | 3 | 0 | runtime consumer: src/dnf-native-combat/data/types | 754 |
| `maps[].farSightScroll.value` | 1 | number | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy | 56 |
| `maps[].greed.value` | 1 | string | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy | nn nn |
| `maps[].kind` | 1 | string | 12 | 22 | 1 | 20 | 4 | runtime consumer: src/data/official/dnf/swordman/m | map |
| `maps[].mapType.value` | 1 | string | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy | [normal] |
| `maps[].middleSightScroll.value` | 1 | number | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy | 90 |
| `maps[].monsterAiHints[]` | 1 | string | 1 | 2 | 1 | 3 | 0 | runtime consumer: src/dnf-native-combat/data/types | [normal] |
| `maps[].monsterSpawns[].t` | 1 | string | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | int |
| `maps[].monsterSpawns[].v` | 1 | number | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | 500 |
| `maps[].name.value` | 1 | string | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy | PVP 킠쫁 |
| `maps[].nearSightScroll.value` | 1 | number | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy | 110 |
| `maps[].passiveObjects[].t` | 1 | string | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | int |
| `maps[].passiveObjects[].v` | 1 | number | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | 327 |
| `maps[].path` | 1 | string | 24 | 26 | 1 | 30 | 30 | runtime consumer: src/combat/damage/DamageFormula. | map/jungle/e3204(1,2).map |
| `maps[].pathgatePos[]` | 1 | number | 1 | 2 | 1 | 3 | 0 | runtime consumer: src/dnf-native-combat/data/types | 10 |
| `maps[].playerNumber[]` | 1 | number | 1 | 2 | 1 | 3 | 0 | runtime consumer: src/dnf-native-combat/data/types | 2 |
| `maps[].pvpStartArea` | 1 | array(empty) | 2 | 2 | 1 | 3 | 0 | runtime consumer: src/dnf-native-combat/data/types |  |
| `maps[].raw.extract_timestamp` | 1 | string | 7 | 4 | 0 | 16 | 1 | runtime consumer: src/dnf-native-combat/data/types | 2026-05-27T03:45:20Z |
| `maps[].raw.path` | 1 | string | 24 | 26 | 1 | 30 | 30 | runtime consumer: src/combat/damage/DamageFormula. | map/jungle/e3204(1,2).map |
| `maps[].raw.sections[].name` | 1 | string | 19 | 31 | 1 | 22 | 15 | runtime consumer: src/combat/actions/FrameDataActi | map name |
| `maps[].raw.source_pvf_hash` | 1 | string | 6 | 5 | 0 | 15 | 1 | runtime consumer: src/dnf-native-combat/data/pipel | crc32-head:c0779278\|size:205695984 |
| `maps[].raw.type` | 1 | string | 22 | 81 | 1 | 42 | 10 | runtime consumer: src/combat/actions/FrameDataActi | document |
| `maps[].sections[].name` | 1 | string | 19 | 31 | 1 | 22 | 15 | runtime consumer: src/combat/actions/FrameDataActi | map name |
| `maps[].sounds[]` | 1 | string | 1 | 2 | 1 | 3 | 0 | runtime consumer: src/dnf-native-combat/data/types | m_dendroid |
| `maps[].specialPassiveObjects[].t` | 1 | string | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | int |
| `maps[].specialPassiveObjects[].v` | 1 | number | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | 773 |
| `maps[].tiles[]` | 1 | string | 1 | 2 | 1 | 3 | 0 | runtime consumer: src/dnf-native-combat/data/types | tile/bigwindowbgplant.til |
| `mob.abilityCategory.value.equipment_magical_attack` | 1 | number | 0 | 0 | 0 | 0 | 1 | business whitelist (review pass 1) — Phase 3+ runt | 90 |
| `mob.abilityCategory.value.equipment_magical_defense` | 1 | number | 0 | 0 | 0 | 0 | 1 | business whitelist (review pass 1) — Phase 3+ runt | 90 |
| `mob.abilityCategory.value.equipment_physical_attack` | 1 | number | 0 | 1 | 0 | 0 | 1 | business whitelist (review pass 1) — Phase 3+ runt | 90 |
| `mob.abilityCategory.value.equipment_physical_defense` | 1 | number | 0 | 0 | 0 | 0 | 1 | business whitelist (review pass 1) — Phase 3+ runt | 90 |
| `mob.abilityCategory.value.hp max` | 1 | number | 4 | 2 | 0 | 7 | 1 | business whitelist (review pass 1) — Phase 3+ runt | 70 |
| `mob.animationRefs[].targetKind` | 1 | string | 3 | 3 | 1 | 5 | 0 | runtime consumer: src/dnf-native-combat/data/types | ani |
| `mob.animationRefs[].targetPath` | 1 | string | 3 | 3 | 1 | 6 | 0 | runtime consumer: src/dnf-native-combat/data/types | monster/goblin/animation_goblin2/damage1.ani |
| `mob.attackDelay.value` | 1 | number | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy | 1500 |
| `mob.attackInfo[].targetKind` | 1 | string | 3 | 3 | 1 | 5 | 0 | runtime consumer: src/dnf-native-combat/data/types | atk |
| `mob.attackInfo[].targetPath` | 1 | string | 3 | 3 | 1 | 6 | 0 | runtime consumer: src/dnf-native-combat/data/types | monster/goblin/attackinfo/attack1.atk |
| `mob.attackKind[].t` | 1 | string | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | float |
| `mob.attackKind[].v` | 1 | number | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | 15 |
| `mob.category[]` | 1 | string | 1 | 6 | 1 | 5 | 1 | runtime consumer: src/data/official/dnf/physics.ts | human |
| `mob.hitRecovery.values[]` | 1 | number | 14 | 17 | 1 | 16 | 3 | runtime consumer: src/combat/kernel/CombatKernel.t | 500 |
| `mob.hpMax` | 1 | null | 2 | 4 | 1 | 5 | 1 | business whitelist (review pass 1) — Phase 3+ runt |  |
| `mob.kind` | 1 | string | 12 | 22 | 1 | 20 | 4 | runtime consumer: src/data/official/dnf/swordman/m | mob |
| `mob.level.values[]` | 1 | number | 14 | 17 | 1 | 16 | 3 | runtime consumer: src/combat/kernel/CombatKernel.t | 1 |
| `mob.moveSpeed.values[]` | 1 | number | 14 | 17 | 1 | 16 | 3 | runtime consumer: src/combat/kernel/CombatKernel.t | 300 |
| `mob.name.value` | 1 | string | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy |  |
| `mob.path` | 1 | string | 24 | 26 | 1 | 30 | 30 | runtime consumer: src/combat/damage/DamageFormula. | monster/goblin/goblin.mob |
| `mob.raw.extract_timestamp` | 1 | string | 7 | 4 | 0 | 16 | 1 | runtime consumer: src/dnf-native-combat/data/types | 2026-05-27T03:45:20Z |
| `mob.raw.path` | 1 | string | 24 | 26 | 1 | 30 | 30 | runtime consumer: src/combat/damage/DamageFormula. | monster/goblin/goblin.mob |
| `mob.raw.sections[].attributes[].target_kind` | 1 | string | 2 | 2 | 0 | 4 | 1 | runtime consumer: src/dnf-native-combat/data/types | ani |
| `mob.raw.sections[].attributes[].target_path` | 1 | string | 2 | 1 | 0 | 4 | 0 | runtime consumer: src/dnf-native-combat/data/types | monster/goblin/animation_goblin2/damage1.ani |
| `mob.raw.sections[].name` | 1 | string | 19 | 31 | 1 | 22 | 15 | runtime consumer: src/combat/actions/FrameDataActi | speech on situation |
| `mob.raw.source_pvf_hash` | 1 | string | 6 | 5 | 0 | 15 | 1 | runtime consumer: src/dnf-native-combat/data/pipel | crc32-head:c0779278\|size:205695984 |
| `mob.raw.type` | 1 | string | 22 | 81 | 1 | 42 | 10 | runtime consumer: src/combat/actions/FrameDataActi | document |
| `mob.sections[].attributes[].target_kind` | 1 | string | 2 | 2 | 0 | 4 | 1 | runtime consumer: src/dnf-native-combat/data/types | ani |
| `mob.sections[].attributes[].target_path` | 1 | string | 2 | 1 | 0 | 4 | 0 | runtime consumer: src/dnf-native-combat/data/types | monster/goblin/animation_goblin2/damage1.ani |
| `mob.sections[].name` | 1 | string | 19 | 31 | 1 | 22 | 15 | runtime consumer: src/combat/actions/FrameDataActi | speech on situation |
| `mob.sight.value` | 1 | number | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy | 300 |
| `mob.stuckbonusOnDamage.values[]` | 1 | number | 14 | 17 | 1 | 16 | 3 | runtime consumer: src/combat/kernel/CombatKernel.t | 0 |
| `mob.warlike.value` | 1 | number | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy | 60 |
| `mob.weight.value` | 1 | number | 18 | 33 | 1 | 23 | 8 | runtime consumer: src/combat/buffs/BuffLifecycleSy | 45000 |
| `mob.weightDual.values[]` | 1 | number | 14 | 17 | 1 | 16 | 3 | runtime consumer: src/combat/kernel/CombatKernel.t | 45000 |
| `mob.widthBox.values[]` | 1 | number | 14 | 17 | 1 | 16 | 3 | runtime consumer: src/combat/kernel/CombatKernel.t | 40 |
| `monsterRefs[]` | 1 | string | 1 | 1 | 0 | 0 | 1 | runtime consumer: src/engine/schema/carbon-shade/e | goblin |
| `tables{}.0` | 1 | string | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | physical |
| `tables{}.1` | 1 | string | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | magical |
| `tables{}.2` | 1 | string | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | absolute |
| `tables{}.3` | 1 | string | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | light |
| `tables{}.4` | 1 | string | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | dark |
| `tables{}.5` | 1 | string | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | water |
| `tables{}.6` | 1 | string | 0 | 0 | 0 | 0 | 0 | business whitelist (review pass 1) — Phase 3+ runt | fire |

## 四、Shard 体积分布

| shard | bytes | fields |
|-------|-------|--------|
| players/demonicswordman.json | 2.19 MB | 394 |
| players/swordman.json | 2.19 MB | 394 |
| players/priest.json | 127.3 KB | 218 |
| players/atfighter.json | 124.0 KB | 226 |
| players/thief.json | 106.3 KB | 222 |
| players/fighter.json | 102.9 KB | 226 |
| players/atgunner.json | 93.4 KB | 218 |
| players/atmage.json | 91.1 KB | 218 |
| players/creatormage.json | 87.8 KB | 214 |
| players/mage.json | 85.5 KB | 218 |
| players/gunner.json | 78.0 KB | 218 |
| dungeons/jungle.json | 63.1 KB | 165 |
| monsters/goblin.json | 26.3 KB | 224 |
| manifest.json | 3.4 KB | 9 |
| shared/enums.json | 2.6 KB | 15 |
| shared/physics.json | 510 B | 23 |

## 五、heuristic 限制

- **业务白名单 override**: `chr.growth` / `mob.abilityCategory` / `constants.*` / `tables` / `damageBoxes/attackBoxes/anchor` / `maps[].*Objects` 等已硬编码归 keep, 因为 runtime 代码还没写但 Phase 3 确定要用. 来源: review pass 1 (2026-05-29).
- **OOS 黑名单**: `chr.awakening.*` (Lv75+ 觉醒) / `dgn.worldmapPatternInfo` (现代世界地图) 已硬编码归 delete, 70-cap PVE 范围外.
- **grep 是字面量匹配**: 字段名通过模板字符串、解构、动态 key 访问的, heuristic 检测不到.
- **producer 列表是白名单**: parsers/exporter/importer/validator + tools/dnf-porting-src. 这之外的写入点会被算成 consumer.
- **runtime 定义**: src/engine/ + src/game/ + src/combat/ + src/data/official/ + src/dnf-native-combat 内非 producer 文件. dnf-native runtime 子目录 (如 stateMachine, simulation) 还没建, 当前所有 dnf-native 都被算成 producer — Phase 2 起跑后这条会自动转好.
- **leaf key 太短的字段** (`raw` / `sections`) 已硬编码为 delete (实测无消费, 见 Stage 1 audit).
- **同名但语义不同的 key** (e.g. `value` 出现在 jumpPower / liftUp / coolTime / requiredLevel) heuristic 一律按命中文件聚合, 不分语义. 这通常没问题, 因为同名字段的消费策略一致 (要么都 runtime 要么都 sidecar).

## 六、下一步

1. **review 一节 delete 候选** — 标 false-positive (动态访问/未来要用) 改成 keep
2. **review 一节 sidecar 候选** — 决定是否真的搬到 dist/data/_provenance/ 单独存
3. **基于 keep 列表设计 Phase 2 .fbs** — 每个 root_type 字段必在 keep 列表里有对应路径
4. **裁过的 schema 不再有 71% metadata** — Phase 2 .bin 体积可压到 keep + 必要 audit gate
