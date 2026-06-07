# Stage 4-6 路线图 (2026-06-07)

> **前置**：Stage 1（PVF 管线）✅、Stage 2（22-system 引擎）✅、Stage 3（真值驱动重构）✅ 均已完成。
> engine 16 系统全部实现、CombatScene 已切到 EngineKernel、CI 全绿（104 静态测试 + 浏览器 QA）。

---

## Stage 4：游戏性补全（预计 3-4 周）

**目标**：从"战斗引擎验证原型"升级为"可完整操作的战斗场景"。填补 P4 标记的 gameplay 缺口。

### Phase A — 基础移动 + 跳跃（1 周）

| # | 任务 | 真值来源 | 验证 |
|---|------|---------|------|
| A1 | **MoveSystem** — intent.dir → actor.x 位移 | ActorStats.moveSpeed (PVF: swordman=300, goblin=350) | engine-movement.test.ts + combat-qa 1.x 解禁 |
| A2 | **JumpSystem** — intent.button="jump" → airborne 主动跳跃 | chr.jumpPower (PVF: swordman=430) | engine-jump.test.ts |
| A3 | **DashSystem** — 双击方向 → 冲刺 | chr.moveSpeed × dash 倍率 (local_baseline) | engine-dash.test.ts |
| A4 | **ZMovement** — intent.dir 上下 → actor.z 深度移动 | moveSpeed × Z 系数 (local_baseline) | 追加 z 轴移动测试 |

**里程碑 M8**：玩家 WASD 全方向移动 + 跳跃 + 冲刺可操作。

### Phase B — 战斗完善（1-1.5 周）

| # | 任务 | 真值来源 | 验证 |
|---|------|---------|------|
| B1 | **DownSystem** — 击倒累计计数器 + 起身动作 | hit_down causesDown 路由 (已有) | engine-down-counter.test.ts |
| B2 | **QuickRebound** — 倒地快速起身 (KeyZ) | 固定帧数 (local_baseline) | engine-quick-rebound.test.ts |
| B3 | **hitGroup 真值** — .atk hitGroup id 接入防多段 | dnf-extract 重提取 | engine-hitgroup-truth.test.ts |
| B4 | **多怪物种类** — skeleton/imp/boss 接入 | mob shards (已提取) | actor-init 扩展 |
| B5 | **cancel-window 运行时** — ActionSystem 消费 cancelWindow | skill shard 19/205 (已解析) | engine-action-cancel 扩展 |

**里程碑 M9**：击倒/起身/快速恢复完整循环 + 3+ 种怪物可战斗。

### Phase C — 等级 / 装备模型（1 周）

| # | 任务 | 真值来源 | 验证 |
|---|------|---------|------|
| C1 | **等级公式** — chr.growth 17 段曲线插值到 LV70 | PVF growth arrays (base + per-level) | engine-level-scaling.test.ts |
| C2 | **装备加成框架** — weapon attack / armor defense | weapon shard 字段 (部分可得) | engine-equipment.test.ts |
| C3 | **physicalAttack 真值切换** — 从占位 45 切到公式计算 | growth + equipment | 伤害数值回归测试 |

**里程碑 M10**：伤害数值由等级+装备驱动，非硬编码。

### 非目标（Stage 4 排除）
- ❌ 多职业切换（仅 swordman）
- ❌ 副本/关卡流程
- ❌ VFX/音效/镜头特效
- ❌ PvP
- ❌ 网络同步
- ❌ 技能树/被动技能

---

## Stage 5：表现层 + 多职业（预计 4-6 周）

**目标**：从"功能正确"升级为"视觉可信"。接入 DNF 原始精灵帧 + 扩展职业。

### Phase A — 精灵渲染管线（2 周）

| # | 任务 | 依赖 |
|---|------|------|
| A1 | **NPK→PNG 帧提取管线** — dnf-extract --npk 批量导出 | dnf-extract 已支持 |
| A2 | **SpriteRenderer** — 替换占位矩形，用 .ani 帧序列渲染 | NPK 帧 + .ani offset 对齐 |
| A3 | **装备层叠渲染** — body→shoes→pants→coat→hair Z-order | equipment avatar .ani |
| A4 | **武器渲染** — 独立武器 timeline 精灵叠加 | weaponTimeline flatten (已有) |

### Phase B — 表现系统（1.5 周）

| # | 任务 | 22-system 对应 |
|---|------|---------------|
| B1 | **15-VFX** — 命中/技能特效粒子 | 15-VFX |
| B2 | **16-CameraFX** — 震屏/zoom | 16-CameraFX |
| B3 | **音效框架** — 武器 wav + 命中音 | weapon wav shard |
| B4 | **伤害数字浮出** — 经典 DNF 数字弹出 | DamageFormula 输出 |

### Phase C — 多职业扩展（2 周）

| # | 任务 | 数据状态 |
|---|------|---------|
| C1 | **Fighter 接入** — 格斗家动画 + 技能 | shard 已提取 (108KB) |
| C2 | **Gunner 接入** — 枪手动画 + 技能 | shard 已提取 (82KB) |
| C3 | **Mage 接入** — 魔法师动画 + 技能 | shard 已提取 (90KB) |
| C4 | **职业选择 UI** — 开场选职业 | 依赖 A-B 完成 |

**里程碑 M11**：4 个职业可选，DNF 原始精灵渲染，有音效和特效。

### 非目标（Stage 5 排除）
- ❌ 二次觉醒 / 转职
- ❌ 技能完整实装（仅基础攻击 + 1-2 个签名技能）
- ❌ 城镇/NPC/商店
- ❌ 存档/进度

---

## Stage 6：副本系统（预计 3-4 周）

**目标**：从"单场战斗"升级为"可推图的副本体验"。

### Phase A — 地图系统（1.5 周）

| # | 任务 | 数据状态 |
|---|------|---------|
| A1 | **DungeonFlow** — 房间→清怪→下一房→Boss | dgn shards (jungle/bloodhell) |
| A2 | **MapRenderer** — 地图背景渲染 | dgn mapSpecification |
| A3 | **房间切换过渡** — 清怪后开门动画 | local_baseline |

### Phase B — 波次 / 怪物配置（1 周）

| # | 任务 |
|---|------|
| B1 | **WaveSpawner** — 按副本定义刷怪 |
| B2 | **怪物多样化** — 远程/近战/精英怪行为差异 |
| B3 | **Boss 机制** — 超级护甲 + 专属行为模式 |

### Phase C — UI / 体验（1 周）

| # | 任务 |
|---|------|
| C1 | **小地图** — 副本进度可视化 |
| C2 | **结算界面** — 通关统计 |
| C3 | **死亡/重试** — 玩家阵亡处理 |

**里程碑 M12**：完整推图体验——选职业→进副本→清房→打 Boss→结算。

### 非目标（Stage 6 排除）
- ❌ 多人组队
- ❌ 疲劳值 / 每日限制
- ❌ 掉落 / 装备获取
- ❌ 排行榜

---

## 技术风险与应对

| 风险 | 影响 | 应对 |
|------|------|------|
| moveSpeed 单位歧义 | PVF 850 是百分比还是 px/s | 真值覆盖矩阵已标注，先用 PVF 原值/100×基准速度 |
| NPK 精灵帧量巨大 | 11 职业 × 数百帧 → 包体爆炸 | 按需加载 + sprite atlas 打包 |
| growth 曲线外推 | 17 段到 LV70 的插值精度 | 线性插值 + 与 wiki 交叉验证 |
| weaponTimeline 数据缺口 | 16.2% 覆盖率 BLOCKED | 改进 dnf-extract 提取 weapon .ani |
| GCC 15 codecvt 移除 | CI Windows build 失败 | continue-on-error 暂缓，后续改用 icu 替代 |

---

## 优先级总览

```
现在 ─► Stage 4A: 移动+跳跃 (1w)
         ↓
       Stage 4B: 战斗完善 (1.5w)
         ↓
       Stage 4C: 等级模型 (1w)
         ↓
       Stage 5A: 精灵渲染 (2w)     ← 视觉大跃进
         ↓
       Stage 5B: 表现系统 (1.5w)
         ↓
       Stage 5C: 多职业 (2w)
         ↓
       Stage 6: 副本系统 (3-4w)    ← 完整游戏体验
```

**预计总周期**：10-14 周（个人开发，含迭代）。
