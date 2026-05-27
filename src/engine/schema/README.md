# src/engine/schema — FlatBuffers Runtime Schema (Phase 2 Day 1 骨架)

> 2026-05-27 创建。用户决策 Q3 "FlatBuffers Phase 2 Day 1 切"。

## 当前状态

| 组件 | 状态 |
|------|------|
| `flatbuffers` npm 包 | ✅ 已装（`npm install flatbuffers --save`） |
| `flatc` CLI 编译器 | ❌ **待装**（网络断时无法下载，本机网络通后做） |
| `physics.fbs` schema | ✅ 第一个 schema 已写（12 物理常数） |
| `chr.fbs` / `skl.fbs` / `atk.fbs` / `ani.fbs` / `dgn.fbs` | ❌ 待写（Phase 2 T1.4） |
| `scripts/compile-schema.mjs` 编译器入口 | ✅ 骨架已写（检测 flatc + 编译 / 提示安装） |
| Round-trip 验证（JSON → .bin → 浏览器读） | ❌ 等 flatc 装好做 |

## flatc CLI 安装

flatc 是把 `.fbs` 编译成 `.ts` typed accessor 的官方 CLI。**项目假定开发机有 flatc**。
缺它，本目录的 `.fbs` 只是源代码不会自动生成 TS。

### Windows 安装步骤

1. 下载 prebuilt binary: https://github.com/google/flatbuffers/releases
   找 `Windows.flatc.binary.zip`（约 3MB）
2. 解压 `flatc.exe` 到 `C:\Users\<you>\bin\` 或加 PATH 的任意目录
3. 验证：`flatc --version` 应输出 `flatc version 23.x.x` 之类

### 备选（包管理器）

- **scoop**: `scoop install flatbuffers`
- **chocolatey**: `choco install flatbuffers`

### CI 装法

GitHub Actions 用 `apt-get install flatbuffers-compiler`（Linux）或 download release 流水线。

## 编译流程

```bash
node scripts/compile-schema.mjs
```

预期产出（flatc 装好后）：
```
src/engine/schema/
├── physics.fbs            ← 手写源
├── physics_generated.ts   ← flatc 编译，gitignored
├── ...
```

编译产物（`*_generated.ts`）应该被 gitignore — derivable from .fbs。

## 设计原则（按 task-breakdown T1.3 HOT/WARM/COLD 分层）

| 层级 | 数据 | 布局策略 |
|------|------|----------|
| **HOT** (>10次/帧) | actor pos/facing, hitbox active, attack box coords | Float32Array flat buffer + SoA |
| **WARM** (1-10次/帧) | skill CD, mob HP, status stack count | FlatBuffer `table` (typed struct) |
| **COLD** (<1次/帧) | skill icon, awakening, dgn room graph, equipment | IndexedDB lazy load + 不装 worker |

**physics.fbs** 属于 HOT 中的 HOT（每 tick 6+ 次读取），但常数实际只读一次后cache 在 worker 全局，所以用 simple `table` 就够（不需要 SoA）。

## 关联文档

- 数据来源：`verification/baseline-shards/shared/physics.json` （12 个常数实测）
- 设计依据：`docs/planning/2026-05-26-game-engine-architecture.md` §二
- 用户决策：`docs/planning/2026-05-27-resolved-decisions.md` Q3
- Stage 2 task: `docs/planning/2026-05-26-task-breakdown.md` T1.4 (.fbs 写)
  / T2.1 (JSON → .bin 编译)

## 仍未做

- chr.fbs / skl.fbs / atk.fbs / ani.fbs / mob.fbs / dgn.fbs / manifest.fbs
- compile-schema.mjs 实际编译执行（需 flatc 装好）
- JSON shard → .bin 转换器（task T2.1）
- 浏览器 runtime loader 验证零拷贝读取
