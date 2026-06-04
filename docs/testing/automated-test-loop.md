# 自动化测试循环

**版本**: 2026-05-31  
**目标**: 每 10 分钟自动运行浏览器测试，发现问题自动修复

---

## 快速开始

```bash
# 启动 10 分钟测试循环
/loop 10m npm run test:loop

# 手动运行一次
npm run test:loop

# 只运行 QA 测试
npm run browser:qa

# 只运行 smoke 测试
npm run browser:smoke
```

---

## 测试套件

### 1. Smoke 测试 (`combat-smoke.spec.ts`)
- **7 个 chain 测试** + macro health 检查
- 覆盖：动作链、反应系统、护甲、buff、状态效果、边界、replay 导出
- 运行时间: ~30 秒

### 2. QA 测试 (`combat-qa.spec.ts`)
- **14 个测试**，覆盖人工质检清单的关键场景
- 分组：
  - 基础移动 (4 个) - walk/dash/jump/gravity
  - 普通攻击 (3 个) - 帧数/伤害/取消
  - 受击反应 (3 个) - stagger/launch/down
  - 边界测试 (2 个) - 墙壁/地图边缘
  - 性能测试 (2 个) - FPS/多敌人
- 运行时间: ~60 秒

---

## 测试循环工作流

```
每 10 分钟:
  1. 启动 Vite dev server (localhost:5173)
  2. 运行 Playwright 测试 (smoke + qa)
  3. 收集结果和诊断信息
  4. 失败时:
     - 生成截图 (verification/*.png)
     - 导出 runtime evidence (verification/*.json)
     - 分析失败原因
     - 如果是新 bug → 派 agent 修复
     - 如果是已知问题 (Stage 3 BLOCKED) → 记录并继续
  5. 停止 Vite server
  6. 等待下一轮
```

---

## 失败处理策略

### 自动修复
- **类型错误**: 立即修复
- **简单逻辑错误**: 派 agent 修复
- **测试断言错误**: 检查 PVF 真值，调整预期值

### 跳过条件
- 任务超过 30 分钟未解决 → 标记为 BLOCKED，记录到 `docs/testing/blocked-issues.md`
- Stage 3 已知问题（如 HitResolutionSystem 覆盖率 16.2%）→ 跳过

### 已知问题清单
1. **HitResolutionSystem 覆盖率 16.2%** (Stage 3 Phase B BLOCKED)
   - 原因: 缺少 81 个 attacks 的 attackBoxes 数据
   - 影响: 部分攻击判定测试会失败
   - 跳过: 是

2. **Reaction D9 系数 = B stub** (Stage 3 Phase C)
   - 原因: PVF 未提供完整的 weight factor 表
   - 影响: Launch 高度可能与真实 DNF 有偏差
   - 跳过: 否（使用 baseline 系数）

---

## 诊断文件

测试失败时生成以下文件（位于 `verification/`）：

| 文件 | 内容 |
|------|------|
| `browser-smoke.json` | 完整测试结果 + 诊断信息 |
| `runtime-evidence.json` | CombatKernel 运行时证据 |
| `browser-smoke.png` | 测试前截图 |
| `scenario-screenshot.png` | 场景运行后截图 |
| `qa-test-*.png` | QA 测试失败截图 |

---

## 性能基准

| 指标 | 目标 | 容差 |
|------|------|------|
| FPS | 60 | ±5 fps |
| 多敌人 FPS (5+) | 45+ | - |
| Walk 速度 | 121.55 px/s | ±5% |
| Jump 高度 | 100-120 px | ±5% |
| Gravity | -1500 px/s² | ±5% |
| Attack1 帧数 | 10-15 帧 | ±1 帧 |

---

## 扩展测试

未来可添加的测试场景（从 117 个检查点中）：

- [ ] 技能释放 (F/G/H 键)
- [ ] 暴击系统
- [ ] 属性伤害
- [ ] 怪物 AI (巡逻/追击)
- [ ] 视觉反馈 (命中闪白/HP 条)
- [ ] CD 和 MP 消耗
- [ ] 连招取消链
- [ ] 空中攻击
- [ ] 倒地保护

---

## 故障排查

### 测试超时
```bash
# 增加超时时间
PLAYWRIGHT_TIMEOUT=180000 npm run browser:qa
```

### Vite 启动失败
```bash
# 检查端口占用
netstat -ano | findstr :5173

# 手动启动 Vite
npm run dev
```

### 截图缺失
```bash
# 确保 verification/ 目录存在
mkdir verification
```

### 测试不稳定
- 检查 FPS 是否稳定（F1 调试面板）
- 检查是否有其他进程占用 CPU
- 尝试 `--headed` 模式观察浏览器行为

---

## 循环控制

```bash
# 停止循环
# 按 Ctrl+C 或在 Claude Code 中发送 "停止循环"

# 查看当前循环状态
/tasks

# 手动触发一次测试
npm run test:loop
```
