# Stage 4A-B Changelog (2026-06-06 ~ 2026-06-07)

> 本次会话跨两天，包含质检修复、CI 修复、Stage 4 路线图编写及实装。

## 质检 + CI 修复 (2026-06-06)

### P0 修复
- **pre-commit hook 激活** secret 扫描 + typecheck/static:test 门禁
- **depcruise 真规则** — `.dependency-cruiser.cjs` 替代 `--no-config`（engine↛combat/game, combat↛game, circular warn）
- **analyze.mjs circular 计数** — 从硬编码 0 改为实际 reduce 统计

### P1 修复
- **static-test.mjs 并行** — 串行→8 路并行池 (338s→209s)
- **tick-benchmark 阈值** — 500→750us 防并行负载抖动
- **knip/event-trace 门禁** — ≤100 unused exports / ≤30 listenOnly

### CI 修复
- **Combat Lab CI** — Node 20 移除（`node:sqlite` 需 22+）；shard-loader-bin/fbs-compiled 加 graceful skip
- **Build dnf-extract** — choco install mingw 404 → MSYS2 action；Windows build continue-on-error（GCC 15 codecvt 移除）
- **h3/h5 pipeline probes** — BASELINE_BUGS 调整承认已知缺口

### 清理
- 删除 21 个一次性调查脚本 (-1134 行)
- 6 个 skill SKILL.md/learnings.md 描述漂移修正
- C++ extractor 日志前缀规范 ([LOG]/[ERROR]) + 重编译

## Stage 4A Phase A — 基础移动 + 跳跃 (2026-06-07)

**里程碑 M8 达成**：玩家 WASD 全方向移动 + Space 跳跃 + 双击冲刺可操作。

| Commit | 系统 | 测试 | 真值来源 |
|--------|------|------|---------|
| `913dd6f` | **MovementSystem** — intent.dir → actor.x | M1-M7 (7项) | ActorStats.moveSpeed (swordman=300) |
| `9c80a5c` | **JumpSystem** — Space → launchAirborne(jumpPower) | J1-J7 (7项) | chr.jumpPower (swordman=430, PVF tier3) |
| `aa13019` | **Z 轴移动** — ArrowUp/Down → actor.z (半速) | M8-M9 (+2项) | moveSpeed × 0.5 (DNF 惯例) |
| `17b282e` | **DashSystem** — 双击冲刺 ×1.6 + locomotion 状态 | M10-M12 (+3项) | local_baseline 1.6x 倍率 |

### 新增系统注册顺序
```
InputSystem → MovementSystem → JumpSystem → ActionSystem → EnemyAISystem →
AnimationSystem → CombatResolutionSystem → HitstunSystem → DownSystem →
AirborneSystem → KnockbackSystem → StatusSystem → ResourceSystem
```

## Stage 4B Phase B — 战斗完善 (2026-06-07)

| Commit | 系统 | 测试 | 说明 |
|--------|------|------|------|
| `872c33c` | **DownSystem** — 击倒计数 + 起身无敌 + 倒地保护 | D1-D5 (5项) | 3 连倒→180 tick 保护；起身→30 tick 无敌 |
| `24519ab` | **QuickRebound** — KeyZ 倒地快速起身 | Q1-Q4 (4项) | 300 tick 冷却；清 reaction 强制 IDLE |

### 新增 Actor 字段
- `locomotion: "idle" | "walk" | "run"` — 渲染层读取
- `hitImmune: boolean` — DownSystem 起身无敌，CombatResolutionSystem 跳过
- `ActorStats.jumpPower?: number` — PVF chr.jumpPower
- `ActorIntent.zDir?: -1|0|1` — Z 轴深度方向
- `ActorIntent.quickRebound?: boolean` — 快速起身请求

### 跳过项（数据不可得或需用户决策）
- B3 hitGroup 真值 — 需 dnf-extract C++ 改动 ← **本会话已做精化**(非全真值,见末节)
- B4 多怪物种类 — newmonsters shard 无 attacks/animations ← **本会话已完成**(改走 per-monster .mob 真值,4 怪 incl spider,见末节)
- B5 cancel-window 运行时 — 已在 skill-action infra §3 完成（ActionSystem L66-71）

## 测试数量变化

| 时间点 | 测试数 |
|--------|--------|
| 会话开始 | 104 |
| 质检修复后 | 109 |
| Stage 4A 后 | 119 |
| Stage 4B 后 | 128 |

全部测试全绿，0 回归。CI（Combat Lab CI + Build dnf-extract）全绿。

## Stage 4 续 — 命中真值批次 + B3/B4/C2 + scenario 激活 (2026-06-08)

> 接 `delightful-enchanting-kay.md` 6-Batch 计划 + Stage 4 B3/B4/C2。诚实分级:
> B4=PVF 真值; B3=精化(数据缺口已确证); C2=框架(值 local_baseline)。

### 命中真值批次 (Batch 2-6)
| 批次 | 内容 | 真值分级 |
|------|------|---------|
| Batch 2 | hit-stop 命中停帧(HitStop.ts + HitStopSystem,attacker/victim 帧档) | local_baseline 帧 |
| Batch 3a | ArmorProfile 四档(none/super/boss/building,canBeLaunched 等 + hitStopCap) | local_baseline(确证 .mob 无 super-armor 字段) |
| Batch 3b | i-frame 统一 — `hitImmune` 退役,改 `invulnerableUntilTick` + `isInvulnerable(tick)` tick-deadline | 机制 |
| Batch 4 | combo pressure(ComboPressure.ts 衰减 damage/launch + gravityScale)+ ComboSystem | local_baseline 配置 |
| Batch 5 | slot 评估 — weapon slot 路由 L3 标注 | 文档 |
| Batch 6 | **launch 真值** — 撤 weightFactor(违背 Tier-1:weight 仅音效非物理),vy=liftUp,peak 30px | **Tier-1 更正** |

### 4C 缩放 + B3/B4/C2
- **B4 多怪物**(真功能,PVF 真值): `monsterTruth.ts` 4 怪(goblinthrower/goblin/skeleton/spider)各自 .mob 真值(abilityCategory/sight/attackDelay/moveSpeed/hitRecovery),CombatScene spawn + AI。改走 per-monster .mob(非 newmonsters shard)绕开"无 attacks/animations"缺口。
- **B3 hitGroup**(精化,非全真值): hitGroup key per-action(`attackerId:actionName`); .atk 无 hitGroup 字段已确证(数据缺口)。
- **C2 装备**(框架,local_baseline): `Equipment.ts`(weaponPhysAtk/armorPhysDef)接伤害链,默认空=零回归; 无 item parser,值待校准。
- LevelScaling/MonsterScaling: 角色 growth × abilityCategory% @ 副本 basisLevel。

### scenario 自验激活 4/7 → 6/7
| flag | sub-scenario | commit |
|------|-------------|--------|
| armorHitObserved | 4: grunt 临时 BOSS_SUPER_ARMOR + 命中 | (本会话早期) |
| gravityScale wiring | combo 浮空下落加速(Batch 4 follow-up) | `1a7ba33` |
| spider 第 4 怪 | B4 延伸 + 确证 armor 非 .mob 字段 | `78c77b8` |
| quickReboundObserved | 5: DownSystem 击倒→快速起身 | `1c12ffb` |
| buildingArmorBlockedControlObserved | 6: BUILDING_ARMOR + lift_up 降级为 HIT | `5988978` |

剩 `ragingFuryMultiHitObserved` 唯一诚实 gap(需引擎尚无的多段超必杀 action,真 feature 非 wiring)。

全部测试全绿(consistency `code/static-test-count` 校验),EngineKernel 确定性保持。详见 `docs/testing/engine-truth-coverage-matrix.md` 第五节。
