# GameLoop 60Hz 验证工具

Phase 0 T0.4 的验证工具集。

## 快速验证

### 1. 自动化测试（推荐）

```bash
node scripts/verify-gameloop.mjs
```

运行 6 个测试用例，验证：
- 60Hz 稳定性
- RAF 抖动容忍度
- 长帧处理
- 慢动作
- 暂停/恢复
- 单步执行

预期输出：
```
✅ 所有测试通过 — GameLoop 60Hz 稳定性验证完成
```

### 2. 浏览器可视化 Demo

```bash
npm run dev
```

然后打开浏览器访问：
```
http://localhost:5173/carbon-shade-web/demo-gameloop.html
```

观察指标：
- **仿真帧率 (Tick)**: 应稳定在 60 tps
- **实际帧率 (RAF)**: 根据浏览器刷新率
- **渲染插值因子 (alpha)**: 在 [0, 1) 范围内

Console 每秒输出一次统计：
```
tick=60, elapsed=1.00s, tickRate=60tps, fps=60, alpha=0.123
```

## 文件说明

| 文件 | 用途 |
|------|------|
| `scripts/verify-gameloop.mjs` | Node.js 自动化测试脚本 |
| `demo-gameloop.html` | 浏览器可视化 demo |
| `docs/verification/gameloop-60hz-verification.md` | 完整验证报告 |

## 验收标准

- [x] 固定步长累加器正常工作
- [x] 60Hz tick 稳定输出
- [x] RAF 抖动容忍度良好
- [x] 长帧 / 慢动作 / 暂停 / 单步功能正常
- [x] alpha 插值因子在有效范围内

## 实现位置

`src/engine/core/GameLoop.ts` (commit 95eb84c)
