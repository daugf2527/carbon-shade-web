# Carbon Shade 架构纵览

> Combat Lab 0.3 | 目标: 70-85-classic-pre-metastasis | 2026-05-12
>
> Status: supporting snapshot
> Authoritative successor: `docs/planning/2026-06-04-engine-native-rewrite-roadmap.md`
> Notes: keep for historical layer mapping, not for current migration status.

## 10层架构

| 层 | 说明 | 核心模块 |
|----|------|----------|
| 运行时 | Vite + Phaser 3 | BootScene, CombatScene, Scale.FIT 1920×1080 |
| 战斗核心 | Pure TS, 无Phaser依赖, 确定性 | CombatKernel, HitResolver2D5, DamageFormula(10乘数链), StatusEffectSystem(14状态), EnemyAI(FSM 9状态+行为树), FrameDataAction(38动作), ReplayRecorder |
| 数据 | 版本化Manifest + FNV-1a哈希 | actions/default.json, status/default.json, damage/classic-profile.json, ai/enemy-default.json, ai/boss-patterns.json |
| 提取 | Phase A-D, PVF/ANI/SKL解析 | PvfParser→PvfScriptParser→SklAnalyzer, AniAnalyzer(v1-v15), SklToActionMapper, dnfPhysicsConstants, generate-actions.mjs |
| 证据 | 3层金标准 | L1 Neople API(11技能), L2 Wiki(公式/状态), L3 PVF/ANI/NPK(客户端提取) |
| 测试 | 41/41, node:assert | 37 static .test.ts + 4 static-js .test.mjs, fuzz/确定性/replay/提取管线 |
| 文档 | ~60文件 | design/engineering/changelog/planning/research |
| CI/CD | GitHub Actions | typecheck → static:test → build, matrix node[20,22] |
| CRT | 1/6 resolved | CRT-001✅ 版本冻结, CRT-002~006⬜ 帧/碰撞/AI/护甲/回放 |

## 核心数据流

```
Script.pvf → PvfParser → SklAnalyzer ──┐
            → AniAnalyzer ─────────────▶ SklToActionMapper → FrameDataAction → CombatKernel → CombatScene(Phaser)
ImagePacks2 → NpkParser → ImgParser ──┘                            ↑ Neople API / Wiki
```

## 关键数据

- 38个动作帧数据, 14种状态, 5种敌人
- 战斗管线: Input → Hit(4形状) → Reaction(9状态FSM) → Replay(确定性hash)
- 4条伤害路径: direct_hit / status_tick / bleed / reflect
- 226µs/tick, 4412 ticks/s
- PVF 196MB 37万文件, NPK 8.7G 4085个
- cancel窗口9个section ID已解码
- 无Math.random(), 全部FNV-1a确定性hash
- combatSchemaHash: 795cd4e9
