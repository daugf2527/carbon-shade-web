# src/engine/workers — Phase 2 Day 1 Web Worker 骨架

> 2026-05-27 创建。用户决策 Q7 "Web Worker Day 1 就分"。
> 当前只是骨架，Stage 2 起步时再填充 simulation tick / state snapshot 逻辑。

## 文件结构

```
src/engine/workers/
├── README.md          (本文档)
├── sim-worker.ts      Simulation Logic Worker — 跑 13 system tick 闭环
├── sim-worker-host.ts 主线程 launcher — 启动 worker + 收发消息
└── (后续)
    ├── render-prep.worker.ts  渲染数据预处理 worker (Phase 2 后期)
    └── shared/                worker 间共享类型
```

## 当前职责（Phase 2 Day 1 起步）

- **sim-worker**: 跑 fixed-timestep accumulator loop (60Hz)，消费输入快照，
  产出 state snapshot 给主线程渲染。Worker 内独立 deterministic PRNG + 自己
  的 13 system tick 调度。
- **sim-worker-host**: 主线程通过 `new Worker(new URL("./sim-worker.ts",
  import.meta.url), { type: "module" })` 启动 worker。提供
  `postInputSnapshot()` / `onStateSnapshot()` 双向消息接口。

## Vite 配置

`vite.config.ts` 已加 `worker: { format: "es" }`，保证 worker 内能 import 其他
ES modules（关键：Stage 2 simulation kernel 可被 main thread + worker 共用）。

## 测试约束

- **静态测试**（`tests/static/*.test.ts`）不能直接测 worker — Node 没有 Worker API
  （Node 有 `worker_threads` 但语义跟 Web Worker 不同）。
- **Browser smoke test**（`tests/smoke/`）应包含 worker round-trip 验证：
  主线程 → worker → 主线程 message 链。
- 当前没 worker 测试，等 Stage 2 真用时补。

## 与 13 system 的关系

按 `docs/planning/2026-05-26-game-engine-architecture.md` §一 设计，combat
13 system 全部跑在 sim-worker 里；渲染层（Phaser）在主线程消费 snapshot。
两线程通过 immutable state snapshot postMessage 隔离，**确保渲染慢不影响
combat tick 稳定 60Hz**。

## 与 .nut 事件 lifecycle 的关系

按 `docs/engineering/nut-validation-2026-05-27.md` §十一 实测，DNF .nut 是
"事件 + 每帧 callback 混合模型"。JS/TS 引擎层的 sim-worker tick 调度对齐
.nut hook 顺序（checkExecutableSkill → onSetState → onProc/procAppend →
onKeyFrameFlag → onEndCurrentAni），不必硬抄 C++ 内部 tick（DNF.exe 黑盒）。

## 仍未做

- sim-worker.ts / sim-worker-host.ts 都还是空 skeleton（导出占位类型/函数，
  没真实 logic）。Stage 2 T3.1 Simulation Core 启动时填充。
- browser smoke worker round-trip test 待补。
- Worker → Worker（Logic Worker ↔ Render Prep Worker）的 transferable
  ArrayBuffer 桥接，留到性能瓶颈出现再做。
