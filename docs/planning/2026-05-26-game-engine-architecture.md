# Carbon Shade 游戏引擎架构 — 离线构建 + 在线仿真双系统

> 2026-05-26，从游戏工程师视角对项目完整工作流的拆解与重构。
> 核心结论：项目本质是两个系统——**离线资产构建管线**（Build Time）和**在线仿真循环**（Runtime, 60Hz）。
> 前者给后者提供稳定数据支撑，后者在浏览器中以固定时间步长消费这些数据。

> ⚠️ **2026-05-27 audit 警告 — 13-system 推导链：计数级已验证，聚类细节仍 inferred**
> 本文档 §一、§三 反复使用的"13 system"框架原本来自 `kernel-design.md` 一行结论。2026-05-27 在 Windows 上跑 `dnf-extract --filter ".nut"` 重做验证：**193 个 .nut + 478 case-sensitive 引擎 API + 443 case-normalized / 7,101 调用点** 全部 reproducible（剔除 5 个 user-defined function 后**精确匹配 md 478**）。v4 启发式分类划出 **22 个 system buckets**，可能是 md 13 的细分粒度版本（28% unclassified / call share 2.9%）。
> **新状态**：`sourceType: "counts_verified_clustering_inferred"` — 数字级证据真实，**但具体"13 个 system 各包含哪些 API"仍是 inference**（启发式分类 47% unclassified）。
> **完整 verification report**：[docs/engineering/nut-validation-2026-05-27.md](../engineering/nut-validation-2026-05-27.md)
> **解封剩余**：跑 LLM 深推导 / agent 协作把 47% unclassified 降到 < 5%，得到明确的 13 system × API 表，然后才能让 T3.1-T3.13 task breakdown 站住脚。

---

## 〇、核心思维转换

| Web 开发者视角 | 游戏工程师视角 |
|---------------|---------------|
| 数据管线 → 建模 → 引擎 → 游戏 | 仿真循环 (60Hz) ← 离线构建产出的参数 ← PVF 源资产 |
| SQLite 数据库 | 离线资产索引（构建时查询，运行时不用） |
| JSON shards | 源格式（需编译成 FlatBuffers 才能上线） |
| Stage 1 pipeline | Asset Build Pipeline（跟 Unreal Cooking / Unity AssetBundle 一回事） |
| 13 个战斗系统 | 仿真循环里 13 个 tick() 函数（按固定顺序执行，每帧） |
| 数据库建模 | Runtime Data Format Design（不是表关系，是内存布局） |
| 60fps 渲染 | Fixed Timestep + Variable Render（仿真 60Hz 固定，渲染可变） |
| 回放系统 | Deterministic Lockstep Replay（输入+种子→确定性重放，不是录像） |
| Web Worker | 多线程游戏引擎（Logic thread / Render thread 分离） |
| 性能优化 | Frame Budget 管理（每 16.67ms tick/render 分割，超了就降级） |
| .ani 帧数据 | 逐帧碰撞事件表（不只是动画，是 hitbox 时间线） |
| .atk 攻击参数 | 攻击属性模板（每个 attack motion 的参数预设） |

---

## 一、两个世界

### 离线世界 (BUILD TIME) — 资产构建管线

```
PVF/ → dnf-extract → parsers → validator → SQLite → FlatBuffers → .bin/
NPK/     (C++)         (TS)       (Zod)      (建模)     (序列化)     (运行时)

Source Assets ──────────────────────────────> Compiled Runtime Assets
(206MB, binary)                               (optimized, zero-copy)
```

这是 Unreal Cooking / Unity AssetBundle 的同构模式：构建时做所有重活（解析、校验、索引、编译），运行时直接 mmap 拿数据，零解析开销。

### 在线世界 (RUNTIME, 60Hz) — 仿真循环

```
┌─────────────────── GAME LOOP (16.67ms budget) ──────────────────────┐
│                                                                     │
│  Input Snapshot                                                      │
│      ↓                                                              │
│  State Machine Arbitrate (5-level priority)    ← [3ms budget]       │
│      ↓                                                              │
│  Physics Integrator (gravity, velocity, force)  ← [1ms]             │
│      ↓                                                              │
│  Hit Detection (AABB/Sweep on atk[] vs dmg[])  ← [2ms]              │
│      ↓                                                              │
│  Damage Formula (element, crit, defense)        ← [0.5ms]           │
│      ↓                                                              │
│  Reaction State Machine (stagger/knock/launch)  ← [1ms]             │
│      ↓                                                              │
│  Resource System (HP/MP/CD tick)                 ← [0.5ms]          │
│      ↓                                                              │
│  MonsterAI Poll (threshold check → state trans) ← [1ms]             │
│      ↓                                                              │
│  Status Effect Tick (18 status types)            ← [0.5ms]          │
│      ↓                                                              │
│  FrameEventBus Dispatch (onHit/onFrame/onCancel) ← [0.5ms]          │
│      ↓                                                              │
│  Simulation State Snapshot (immutable copy)                          │
│      ↓                                                              │
│  Render Prep (sprite select, y-sort, batch)     ← [in Worker]       │
│      ↓                                                              │
│  WebGL Draw (sprite batch, particles, UI)        ← [in Worker]      │
│                                                                     │
│  Combat tick: ~10ms | Render tick: ~6ms | Frame budget: 16.67ms     │
└─────────────────────────────────────────────────────────────────────┘

Runtime data (loaded once, cached in IndexedDB):
- chr.bin (角色参数: growth vectors, motion refs, awakening)
- skl.bin (技能参数: CD/MP/cancel/command/icon)
- atk.bin (攻击参数: damage/lift/knockback/reaction)
- mob.bin (怪物参数: abilityCategory/level/ai thresholds)
- ani.bin (逐帧数据: sprite/delay/hitbox/dmgbox)
- dgn.bin (副本结构: room graph, monster spawns)
- physics.bin (物理常数: gravity, force-to-velocity, etc.)
```

### 原则

- **仿真状态完全独立于渲染**。渲染只是消费仿真快照。
- 所有 combat 代码跑在 Web Worker，主线程只管 Input + RAF + UI。
- 确定性：fixed-point 或确定性 float + seeded PRNG + ordered iteration。保证 replay 可复现。

---

## 二、Runtime Data Format Design（你说的"数据库建模"）

这有两层：

### 第一层：Authoring Format（源格式）

Stage 1 产出的 JSON shards。人类可读、可 diff、可 review。

### 第二层：Runtime Format（运行时格式）

**不能是 JSON。** JSON 在浏览器里每帧解析会直接把 GC 打爆。游戏引擎用 FlatBuffers 或自定义 flat binary：

```
源格式 (JSON, git-friendly)          运行时格式 (FlatBuffers, cpu-friendly)
─────────────────────────────        ─────────────────────────────────────
{                                     offset 0: header (magic, version)
  "hpMax": {                          offset 8: chrId: uint32
    "value": 80,                      offset 12: hpMax: float32
    "unit": "percent"                 offset 16: mpMax: float32
  },                                  offset 20: physAtk[17]: float32[17]
  "growth": {                         offset 88: ...
    "physAtk": [1.2, 1.5, ...]        
  }                                   // 零解析开销：直接 reinterpret_cast
                                      // 零 GC 压力：没有 JS 对象创建

解析：JSON.parse() ≈ 2-5ms          解析：0ms (mmap / zero-copy)
内存：嵌套对象 + 字符串 key           内存：纯数值数组，紧凑排列
```

### 字段按访问频率分层

| 层级 | 频率 | 例子 | 布局 |
|------|------|------|------|
| HOT | >10次/帧 | position, facing, hitbox.active | flat array (SoA) |
| WARM | 1-10次/帧 | skill.cooldown, mob.hp, status.stacks | typed struct |
| COLD | <1次/帧 | skill.icon, chr.awakening, dgn.roomGraph | lazy load from IndexedDB |

---

## 三、完整 DAG — 全部节点

### [PHASE 0] 基础建设 — 1-2 天

```
[0a] LFS + .gitignore 同步 (Windows↔Termux)
[0b] FlatBuffers schema 工具链 (flatc 编译器, .fbs schema 定义)
[0c] Web Worker 构建工具链 (vite worker config)
```

### [PHASE 1] 离线资产构建管线

```
[1a] 源资产提取
 ├── dnf-extract (C++) — PVF → PvfDocument[]            ✅ 完成
 ├── 9 TS parsers — PvfDocument → typed Def             ✅ 完成
 └── Zod validator — 完整性校验                          ✅ 完成

[1b] ★ Runtime Schema 设计 ★
 │   不是"数据库表结构"，是"仿真循环里每个系统读什么字段、多大、什么布局"
 │
 ├── 从 13 system 反推字段需求 (每个 tick 需要什么数据)
 ├── 字段按 HOT/WARM/COLD 分层
 ├── FlatBuffers .fbs schema 定义
 └── 字段引用链: .skl → .atk → .ani → .img

[1c] 离线编译
 ├── JSON shards → flatc → .bin (FlatBuffers binary)
 ├── Texture atlas: .img → packed sprite sheet (NPK → PNG atlas)
 ├── Audio pack: .wav → Web Audio buffer
 └── Content hash manifest (每个 .bin 的 sha256 + version)

[1d] 数据补件
 ├── P0: 48 audit findings                          ✅ 完成
 ├── P0: MobParser/SklParser/ChrParser 扩展         ✅ 完成
 ├── P0: AniDef inline (10 swordman motions)        ✅ 完成
 ├── P1: .equ parser (67777 files)                  ❌ 待做
 ├── P1: .stk parser (10402 files)                  ❌ 待做
 ├── P1: character/common/ 共享动画                  ❌ 待做
 ├── P1: 3-5 种怪物全量数据                          ❌ 待做
 ├── P2: DgnDef 完善 / MapDef unpacker               ❌ 待做
 └── P2: ChrParser 高级字段 / .ai parser             ❌ 待做

[1e] 资产验证
 ├── Schema 版本检查 (运行时 .bin version ≠ 期望 → 明确报错)
 ├── 引用完整性 (每个 atkRef 都有对应 .atk)
 └── 逐帧 budget profiling (加载阶段测 GC)
```

### [PHASE 2] 运行时仿真循环 — 4-6 周

```
仿真核心原则:
- Fixed Timestep Loop (accumulator pattern, 60Hz fixed, variable render)
- Deterministic PRNG (seeded, per-tick reproducible)
- Ordering Contract (每 tick 内 13 system 执行顺序固定)
- State Snapshot (immutable copy → render thread)
- 所有 combat 代码跑在 Web Worker

[2a] Simulation Core (最先做 — 其他 12 个系统依赖它)
 ├── Fixed timestep accumulator loop
 ├── Deterministic PRNG + ordering contract
 └── State snapshot producer

[2b] State Machine (DNF 5 级优先级仲裁)
 │   AUTO < USER < HALF_FORCE < FORCE < IGNORE_FORCE
 │
 ├── 29 个角色状态 (IDLE→WALK→DASH→JUMP→ATTACK1...→DOWN→GETUP)
 ├── 状态转移表 (input → arbitrate → next state)
 ├── Cancel 规则 (cancelWindow + cancelGroup + cancelWeaponMask)
 └── 每个状态的 enter/exit/tick 回调

[2c] Animation Playback
 ├── Frame cursor: currentFrame, frameDelay, speedRate
 ├── Frame events: onFrame(i) → emit atk box, dmg box, sound, vfx
 ├── DNF 是 hard-cut（非 blend），独立动画时钟
 └── 消费 AniDef (已 inline 10 swordman motions)

[2d] Hit Detection
 ├── AABB/Sweep: atk[] box vs opponent dmg[] box, per frame
 ├── .atk 反推 (design choice A): 无 atk hitbox 时从 AtkDef 反推
 ├── 2.5D Z-axis: 深度切片，非投影层
 └── MaxHitPerObject + sameTargetCooldown

[2e] Physics Integrator
 ├── Gravity: -1500 (dnf_enum_header.nut)
 ├── Force-to-velocity: 4000
 ├── Launch curve: liftUp → velocity → gravity decay → land
 ├── Knockback: pushAside/knuckBack → horizontal force
 ├── 5 down-bounce variants (DOWN_PARAM_TYPE)
 └── PAUSETYPE_OBJECT vs PAUSETYPE_WORLD

[2f] Damage Formula
 ├── ATTACKTYPE × 防御表 × 元素 × crit
 ├── Damage bonus chain: skill level → equipment → status → passive
 └── PvE-only (PvP multipliers stripped)

[2g] Reaction State Machine
 ├── 12 reaction states: stagger/knockback/launch/air_hitstun/
 │   falling/downed/getting_up/quick_rebound/grabbed/dead
 ├── Hitstun table: Tier-3 local_baseline (DNF.exe hardcoded)
 └── Recoil: 攻击后摇 + cancel 窗口

[2h] Resource System
 ├── HP/MP tick + per-level growth
 ├── Cooldown: dungeon_ms / pvp_ms
 ├── Consume: MP cost + casting time
 └── ChangeStatus 4-depth stack: base→equip→status→skill

[2i] Monster AI
 ├── Threshold poll: sight/warlike/attackDelay → state transition
 ├── Category-driven: melee/caster/boss FSM sub-graphs
 └── .aic parser deferred (Stage 3)

[2j] Status Effect System
 ├── 18 ACTIVESTATUS types
 ├── Tolerance accumulation + resistance formula
 └── Dispel/immunity rules

[2k] Frame Event Bus
 ├── onKeyFrameFlag: .ani 帧标记触发 named events
 ├── onHit/onCancel/onStateChange
 └── Same-tick priority resolution

[2l] Camera
 ├── 3-level scroll (MapDef)
 ├── Screen shake (tiny/light/medium)
 └── Target tracking + boundary clamp

[2m] Deterministic Replay
 ├── Record: input snapshot + initial PRNG seed
 ├── Playback: same input + same seed → same state
 └── State hash per tick for debugging
```

### [PHASE 3] 扩展系统 & 内容 — 4-6 周

```
[3a] Equipment System (.equ data → 武器/防具/属性加成)
[3b] Skill Tree (.stk data → 技能归属/解锁/tab)
[3c] Multi-Job Support (11 职业, common 动画)
[3d] Dungeon System (房间连接图, monster spawn, gate trigger)
[3e] Boss Patterns (.aic 解析, multi-phase boss AI)
[3f] Growth System (exp curve, 转职, awakening)
```

### [PHASE 4] 表现层 — 4-6 周

```
[4a] Sprite Renderer (WebGL batching, texture atlas, y-sort)
[4b] Animation Player (frame sequence, equip layering)
[4c] Audio Engine (Web Audio API, weaponWav/skillWav)
[4d] VFX System (GPU particles, hit sparks, screen flash)
[4e] UI/HUD (HP/MP bar, skill slots, damage numbers, combo counter)
[4f] Camera + PostFX (scroll interpolation, screen shake, bloom)
```

### [PHASE 5] 浏览器优化 — 贯穿 Phase 2-4

```
[5a] Web Worker 分离: Logic Worker (combat tick) + Render Worker (WebGL)
[5b] Object Pool: Entity/Hitbox/Particle/DamageNumber → 零 GC
[5c] IndexedDB Cache: 预缓存所有 .bin shards, Service Worker
[5d] FlatBuffer 零拷贝: 不 parse, 不 allocate, 直接读
[5e] RAF throttle: tab hidden → pause loop
[5f] Frame budget monitor: combat > 10ms → 降画质/降粒子
[5g] Asset streaming: boot(<2MB) → char select → stage → on-demand
```

---

## 四、执行顺序

### 当前状态

| Phase | 状态 |
|-------|------|
| Phase 0 | 部分完成（LFS 未上传、.gitignore memory 未白名单） |
| Phase 1a | ✅ 完成 |
| Phase 1b | **未开始 — 这是下一步最重要的事** |
| Phase 1c | 未开始 |
| Phase 1d | P0 ✅ / P1/P2 ❌ |
| Phase 1e | 未开始 |
| Phase 2-5 | 未开始 |

### 建议的下一步

1. **[1b] Runtime Schema Design** — 从 13 system 反推字段需求，定义 .fbs schema。这是所有后续工作的基础。建模完成之前不要写 Phase 2 代码。

2. **[1c] 离线编译器** — JSON → FlatBuffers .bin 的编译工具链

3. **[2a] Simulation Core** — Fixed timestep loop + deterministic PRNG + state snapshot。这是仿真循环的骨架，Phase 2 的其他 12 个系统都挂在它上面。

4. **[2b] State Machine** — DNF 5 级优先级仲裁。这是战斗的"调度器"，Phase 2 的其他系统（animation/hit/damage/reaction）都通过它串联。

5. **[2c→2m] 其余 11 个系统** — 按依赖顺序逐个实现。

6. **[Phase 5] 浏览器优化** — 随 Phase 2 进度逐步集成，不要最后才做。Day 1 就应该有 Object Pool 和 Web Worker 骨架。

---

## 五、项目成败关键

两件事决定一切：

1. **离线管线能不能产出正确的运行时数据**（Phase 1，特别是 1b Runtime Schema Design）
2. **仿真循环能不能在 16.67ms 内稳定跑完**（Phase 2 + Phase 5）

其他所有工作都是围绕这两件事的支撑。

---

*2026-05-26，从游戏工程师视角重构。替代此前所有以"Stage"命名的线性计划。*
