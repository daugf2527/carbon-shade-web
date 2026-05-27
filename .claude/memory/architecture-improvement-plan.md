# 架构改进方案速查 (2026-05-12 — 5-21 pivot 后大部分入 backlog)

> ⚠️ **Pivot 警告（2026-05-23 加注）**：本研究在 5-12 完成，5-21 项目 pivot 到 DNF 真值对齐后（见 [[combat-lab-dnf-alignment-pivot-2026-05-21]]），11 项里大部分变成"Combat Lab 1.0 后再考虑"的 backlog：
>
> | 项 | post-pivot 状态 |
> |---|---|
> | P0-#1 CombatKernel 子系统管道 | ✅ **相容** — 跟 Phase 4 物理引擎重写方向一致，可并行做 |
> | P0-#2 Fixed Timestep + 渲染插值 | ✅ **相容** — 速度积分 + 真重力的前提，Phase 4 大概率需要 |
> | P0-#3 Hit Stop 冻结帧 | 🟡 backlog（手感包装，非真值对齐） |
> | P0-#4 摄像机系统 | 🟡 backlog |
> | P0-#5 输入系统重构 | 🟡 backlog |
> | P1-#6~#9 全部 | 🟡 backlog（手感打磨） |
> | P2-#10 Rollback Netcode | 🟡 backlog（多人预备，PvP 已 OOS 见 [[feedback-dnf-pve-scope-only]]） |
> | P2-#11 CI/CD 增强 | 部分已落（npm run analyze 8 gate） |
>
> 决策时不要默认要推进这 11 项；先看 pivot 后状态。

> 基于 7 个并行 agent（1 Explore + 6 Research）的完整研究成果

## 改进清单（11项，3个Phase）

**P0 手感地基（8-13天）**：
1. CombatKernel → 15子系统管道（System接口 + 固定执行顺序）
2. Fixed Timestep + 渲染插值（60Hz 锁步，Gaffer on Games 累加器）
3. Hit Stop 冻结帧（kernel内 hitStopRemaining，2-20帧分级）
4. 摄像机系统（震屏/闪屏，UI独立摄像机）
5. 输入系统重构（环形缓冲 + SOCD + 指令预判）

**P1 手感打磨（6-11天）**：
6. 动画混合（Alpha交叉淡入淡出 + DNF取消层级利用）
7. 音频管线（优先级抢音 + z轴低通滤波 + HitStop同步）
8. 特效层（残影/轨迹线/伤害数字）
9. UI/HUD（浮动战斗文字/冷却指示器/连击计数）

**P2 多人预备（设计阶段）**：
10. Rollback Netcode 接口预留（saveState/restoreState）
11. CI/CD 增强（截图对比 + 性能回归 + 资源校验）

## 研究来源

- 本地文档：Explore Agent 扫描 docs/（33篇 research/combat + planning + changelog）
- 网络研究：5 个并行 Research Agent（GGPO、Gaffer on Games、DNF Duel Dustloop、Phaser 3 API、Web Audio API）

## 完整文档

`docs/engineering/architecture-improvement-plan.md`（含接口定义、代码示例、迁移策略、验证方案）