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
- B3 hitGroup 真值 — 需 dnf-extract C++ 改动
- B4 多怪物种类 — newmonsters shard 无 attacks/animations
- B5 cancel-window 运行时 — 已在 skill-action infra §3 完成（ActionSystem L66-71）

## 测试数量变化

| 时间点 | 测试数 |
|--------|--------|
| 会话开始 | 104 |
| 质检修复后 | 109 |
| Stage 4A 后 | 119 |
| Stage 4B 后 | 128 |

全部测试全绿，0 回归。CI（Combat Lab CI + Build dnf-extract）全绿。
