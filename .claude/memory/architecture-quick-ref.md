# Carbon Shade 架构速查 (2026-05-12 — STALE)

> ⚠️ **STALE 警告（2026-05-23 加注）**：下面数据流图引用的 `PvfParser / SklAnalyzer / AniAnalyzer / SklToActionMapper` 等 TS 提取栈 **已废弃**（5-19 commit `e1f3e0f`），当前提取必走 `tools/dnf-extract.exe` C++ 工具——见 [[feedback-dnf-extract-mandatory]]。
>
> "Test 41/41" / "combatSchemaHash: 795cd4e9" 都是 0.3 时代数字。当前：static:test **66/66**（含 H1-H11 dnf-native probe），manifest 多次改动后 hash 已变。
>
> 真实数据流（2026-05-23）：
> ```
> Script.pvf → tools/dnf-extract.exe (C++) → typed JSON {t,v}
>                                            ↓
>                                    PvfDocumentLoader.ts (--pipe)
>                                            ↓
>                              parseStage.ts dispatch (.chr/.mob/.atk/.skl/.dgn/.etc)
>                                            ↓
>                  ChrParser / MobParser / AtkParser / SklParser / DgnParser / EtcParser → ParsedPvfDocument
>                  + AniParser / NutExtractor / ImgParser (standalone, input shape 非 document)
> ```
>
> 本 memory 仅作历史参考。当前权威：CLAUDE.md "Current state" 段 + `docs/plans/2026-05-22-stage1-data-pipeline-design.md`。

## 10层架构（0.3 快照）

| 层 | 核心 |
|----|------|
| 运行时 | Vite + Phaser 3 Scale.FIT 1920×1080 |
| 战斗核心 | CombatKernel → HitResolver2D5 → DamageFormula(10乘数) → StatusEffect(14状态) → EnemyAI(FSM9+行为树) → FrameDataAction(38动作) → ReplayRecorder |
| 数据 | 5个manifest JSON + schema/hash/loader, FNV-1a确定性 |
| 提取(Phase A-D) | PvfParser → SklAnalyzer + AniAnalyzer(v1-v15) → SklToActionMapper + dnfPhysicsConstants + generate-actions.mjs |
| 证据 | L1 Neople API(11技能) / L2 Wiki / L3 PVF客户端提取 |
| 测试 | 41/41, node:assert, 独立子进程 |
| 文档 | ~60文件, design/engineering/changelog/planning/research |
| CI/CD | GH Actions: typecheck→static:test→build, matrix[20,22] |
| CRT | 1/6 resolved (CRT-001✅ 版本冻结) |

## 数据流

```
Script.pvf → PvfParser → SklAnalyzer ──┐
            → AniAnalyzer ─────────────▶ SklToActionMapper → CombatKernel → Phaser渲染
ImagePacks2 → NpkParser → ImgParser ──┘        ↑ Neople API / Wiki
```

## 核心数字

- 38动作 / 14状态 / 5敌人 / 226µs/tick
- 4伤害路径 / 4碰撞形状 / 9取消窗口section ID
- combatSchemaHash: 795cd4e9
- PVF 196MB 37万文件 / NPK 8.7G 4085个
- 全确定性, 无Math.random()
- 校验通过: typecheck✅ static:test 41/41✅ build✅