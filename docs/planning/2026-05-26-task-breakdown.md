# 完整任务拆解 — 从现状到完整可玩游戏

> 基于 [`2026-05-26-game-engine-architecture.md`](2026-05-26-game-engine-architecture.md) 的游戏引擎双系统架构。
> 每个任务标注目的、输入、输出、依赖、验收标准。

---

## 前置盘点：我们已经有什么

```
✅ dnf-extract (C++)          — aarch64 + Windows 双平台，PVF→PvfDocument[]
✅ 9 TS parsers               — Chr/Mob/Atk/Skl/Ani/Dgn/Etc/Map/Img + 3 standalone
✅ Zod validator              — .finite()/.max()/.strict() 已加固
✅ SQLite Mirror + 10 VIEWs   — 写入 + 跨域查询
✅ JSON shard export          — 11 player + 1 monster + 1 dungeon + shared
✅ 10 swordman .ani inline    — attack1/2/3 dashattack hardattack jumpattack jump dash damage1 down
✅ SklParser 12 raw → typed   — CD/MP/command/casting/icon/coolTime/levelProperty/...
✅ MobParser 9 fields         — abilityCategory/level/attackDelay/moveSpeed/hitRecovery/...
✅ ChrParser awakening 4 sections
✅ Carbon harness             — hooks/skills/agents/statusline/notify/git hooks
✅ Audit 48 findings P0       — C++ UB/ Zod/ 事务/ .ani abort 已修
✅ baseline 可重跑             — 4s sample / 10min PVE-full
```

```
❌ LFS 二进制未上传            — Script.pvf + stage1-baseline.db 404
❌ .gitignore memory 未白名单  — 多层记忆系统无法同步
❌ notify.mjs Windows-only    — Termux termux-notification 未对接
❌ .equ parser                — 67777 文件，装备系统基础数据
❌ .stk parser                — 10402 文件，技能树基础数据
❌ character/common/ 动画     — 11 职业共享倒地/死亡/起身
❌ 3-5 怪物全量               — 只有 goblin
❌ P1 审计修复 (14项)          — spawn timeout/原子写/finishedAt/N+1 SELECT/...
❌ P2 审计修复 (16项)          — C++ 边界/TS 窄化
❌ Runtime Schema 设计         — 从 13 system 反推字段，定义 .fbs
❌ 离线编译器                  — JSON → FlatBuffers .bin
```

---

## Phase 0：环境同步 + 工具链

### T0.1 — .gitignore 白名单修复

- **目的**：让 Windows 上建的 `.claude/memory/` 记忆文件能通过 git 同步到 Termux
- **改动**：`.gitignore` 加一行 `!.claude/memory/`
- **验收**：`git add .claude/memory/` 能跟踪文件，`git push` 后 Termux 侧 `git pull` 能拿到

### T0.2 — notify.mjs 跨平台兼容

- **目的**：桌面通知在 Windows (BurntToast) 和 Android/Termux (termux-notification) 都能工作
- **改动**：`notify.mjs` 加 `process.platform === 'android'` 分支
- **验收**：Termux 上模拟 Claude 事件触发通知弹窗

### T0.3 — LFS 二进制补传

- **目的**：`Script.pvf` (206MB) 和 `stage1-baseline.db` 真正上传到 GitHub LFS
- **命令**：`git lfs push origin --all`
- **验收**：Termux 侧 `git lfs pull` 成功，`data/Script.pvf` 从 134 字节变成 206MB

### T0.4 — FlatBuffers 工具链

- **目的**：安装 `flatc` 编译器，建立 `.fbs` → `.ts` + `.bin` 的编译链
- **改动**：`npm install flatbuffers`，配置 `scripts/compile-schema.mjs`
- **验收**：手写一个测试 `.fbs`，跑编译输出 `.bin`，浏览器端能零拷贝读取

### T0.5 — Web Worker 构建配置

- **目的**：Vite 支持 Web Worker 打包，Logic Worker 和 Render Worker 独立 bundle
- **改动**：`vite.config.ts` 加 worker 配置，建 `src/engine/workers/` 目录骨架
- **验收**：主线程 postMessage → Worker 收到 → Worker postMessage → 主线程收到

---

## Phase 1b：Runtime Schema 设计 ★ 最优先

> 这是整个项目最重要的一步。"数据库没建好"的本质就是缺这一步。
> 不是设计 SQLite 表结构，而是设计仿真循环每帧读什么数据、什么布局。

### T1.1 — 13 system 逐系统字段清单

- **目的**：搞清楚每个 system 的 `tick()` 函数需要读取哪些字段、什么类型、多大
- **方法**：从 DNF v2 design doc §2 各模块真值分析 + brainstorm §2 各系统 unknown 出发
- **输出**：每个 system 一张 `字段名 | 类型 | 来源PVF文件 | 访问频率(HOT/WARM/COLD) | 备注` 表
- **依赖**：无（纯分析工作）
- **验收**：13 张表覆盖所有 system，跟 Stage 1.5 revised plan §五 的矩阵交叉验证无矛盾

### T1.2 — 字段引用链建模

- **目的**：建立跨文件的引用关系图
- **输出**：
  ```
  ChrDef.motionRefs[<motion>] → AtkDef (via .atk path)
  AtkDef.attackInfo[i] → AniDef (via motion name)
  AniDef.frames[j].sprite → ImgDef (via .img path + frame index)
  SklDef → AtkDef (via skill → attack mapping)
  ```
- **验收**：baseline 里 `swordman.chr → dashattack.atk → dashattack.ani` 引用链可逐级 tracer

### T1.3 — HOT/WARM/COLD 数据分层

- **目的**：决定哪些数据在仿真循环里 flat array、哪些 lazy load
- **HOT** (>10次/帧)：actor.position, actor.facing, hitbox.active, hitbox.coords → `Float32Array` flat buffer
- **WARM** (1-10次/帧)：skill.cooldown, mob.hp, status.stacks, atk.damage → typed struct
- **COLD** (<1次/帧)：skill.icon, chr.awakening, dgn.roomGraph, equipment → IndexedDB lazy
- **验收**：HOT 数据完全在 Worker 内存内，COLD 数据不进热路径

### T1.4 — FlatBuffers .fbs schema 编写

- **目的**：把 T1.1-T1.3 的结论编译成 `.fbs` schema 文件
- **输出**：
  ```
  src/engine/schema/
  ├── chr.fbs        (角色运行时参数)
  ├── skl.fbs        (技能运行时参数)
  ├── atk.fbs        (攻击运行时参数)
  ├── mob.fbs        (怪物运行时参数)
  ├── ani.fbs        (逐帧数据)
  ├── dgn.fbs        (副本结构)
  ├── physics.fbs    (物理常数)
  └── manifest.fbs   (内容索引)
  ```
- **依赖**：T1.1, T1.2, T1.3
- **验收**：`flatc --ts *.fbs` 生成 TypeScript 类型，`flatc --binary` 生成空 `.bin` 骨架

### T1.5 — Schema 版本化机制

- **目的**：运行时检测 `.bin` 的 schema version 跟引擎期望 version 是否匹配
- **设计**：每个 `.fbs` 文件带 `version: uint16` 字段，引擎启动时做 `assert(loaded.version === expected)`
- **验收**：版本不匹配 → 控制台明确报错（不是静默崩溃）

---

## Phase 1c：离线编译器

### T2.1 — JSON → FlatBuffers 编译器

- **目的**：把 Stage 1 产出的 JSON shards 编译成 FlatBuffers `.bin`
- **改动**：`scripts/compile-runtime-assets.mjs`
  ```
  for each .json shard:
    1. read JSON
    2. validate against .fbs schema
    3. flatc --binary → .bin
    4. compute sha256
  ```
- **依赖**：T1.4
- **验收**：baseline 的 `verification/baseline-shards/players/swordman.json` → `dist/engine-data/players/swordman.bin`，浏览器端零拷贝读取

### T2.2 — Texture Atlas 打包

- **目的**：NPK .img 帧 → 打包成 sprite sheet PNG + 元数据
- **改动**：扩展 dnf-extract + 新增 `scripts/pack-atlas.mjs`
- **依赖**：dnf-extract NPK 支持（已有）
- **验收**：swordman 的 `sm_body%04d.img` 全部帧打成一个 atlas PNG

### T2.3 — Audio 资产提取

- **目的**：PVF 内 .wav → Web Audio API 可用格式
- **改动**：扩展 dnf-extract binary extraction + `scripts/pack-audio.mjs`
- **验收**：swordman 武器音效可在浏览器播放

### T2.4 — Content Manifest 生成

- **目的**：所有 `.bin` 的索引文件（path + sha256 + size + version）
- **改动**：扩展 `RuntimeExporter.ts`，产出 `dist/engine-data/manifest.bin`
- **验收**：引擎启动时读 manifest，按需从 IndexedDB 拉 `.bin`

---

## Phase 2：运行时仿真循环

> 所有 combat 代码在 Web Worker 里跑。主线程只处理 Input + requestAnimationFrame + UI 渲染。

### T3.1 — Simulation Core（最优先，所有 system 的架子）

- **目的**：Fixed timestep loop + deterministic PRNG + state snapshot
- **产出**：
  ```
  src/engine/simulation/
  ├── GameLoop.ts          (accumulator pattern, 60Hz fixed + variable render)
  ├── DeterministicPRNG.ts (seeded mulberry32 or xoshiro128)
  ├── TickOrdering.ts      (13 system 的固定执行顺序)
  └── StateSnapshot.ts     (immutable copy → render thread via postMessage)
  ```
- **依赖**：T0.5 (Worker 骨架), T1.4 (schema)
- **验收**：
  - 空循环（无 system）稳定 60Hz
  - 同一输入 + 同一种子 → 两次运行 state hash 完全一致
  - postMessage(snapshot) → 主线程能渲染

### T3.2 — State Machine

- **目的**：DNF 5 级优先级仲裁 + 29 个角色状态 + 状态转移表
- **依赖**：T3.1
- **核心逻辑**：
  ```
  onInput(input) → stateTable.lookup(currentState, input) → proposedState
    → priorityArbitrate(currentState.priority, proposedState.priority) → nextState
    → currentState.exit() → nextState.enter()
  ```
- **数据消费**：`.skl` 的 cancelWindow + cancelGroup + cancelWeaponMask
- **验收**：swordman idle → walk → dash → attack1 → attack2 → attack3 连段跑通

### T3.3 — Animation Playback

- **目的**：消费 `.ani` 帧序列，每帧 emit 事件
- **依赖**：T3.1, Phase 1d (AniDef inline)
- **核心逻辑**：frameCursor → delay tick → advance frame → emit atkBox/dmgBox/sound/vfx events → FrameEventBus
- **数据消费**：`swordman.animations[<motion>].frames[]` (已 inline 10 motions)
- **验收**：attack3 的 frame[2] 触发 attackBox = `[-32,-13,0,179,26,94]`的事件

### T3.4 — Hit Detection

- **目的**：攻击帧的 atk[] box vs 受击方的 dmg[] box，AABB 重叠检测
- **依赖**：T3.3 (animation emit hitbox events)
- **核心逻辑**：atkBox vs dmgBox AABB test → hit → apply MaxHitPerObject + sameTargetCooldown → emit HitEvent
- **验收**：两个 actor 的 hitbox 重叠时检测到命中，无重叠时不误报

### T3.5 — Physics Integrator

- **目的**：重力、速度积分、击飞/击退力 → 速度转换
- **依赖**：T3.1
- **数据消费**：`physics.bin` (DEFAULT_GRAVITY_ACCEL=-1500, FORCE_TO_VELOCITY_CONST=4000), `chr.jumpPower`
- **验收**：角色跳起 → 上升减速 → 顶点 → 下落加速 → 落地

### T3.6 — Damage Formula

- **目的**：命中后计算最终伤害
- **依赖**：T3.4 (hit event)
- **公式**：`baseDamage × elementMultiplier × critMultiplier × defenseMultiplier × skillLevelBonus`
- **数据消费**：`atk.damageBonus`, `chr.growth.physicalAttack[level]`, `mob.abilityCategory`
- **验收**：swordman attack1 打 goblin → 一个合理的伤害数字

### T3.7 — Reaction State Machine

- **目的**：受击后决定角色进入什么受击状态
- **依赖**：T3.6 (damage result, liftUp/pushAside/knuckBack values)
- **状态**：micro_stagger → light_stagger → heavy_stagger → knockback → launch → air_hitstun → falling → downed → getting_up → quick_rebound
- **验收**：不同 attack 产生不同 reaction（attack1 → light stagger, hardattack → knockback, jumpattack → launch）

### T3.8 — Resource System

- **目的**：HP/MP 消耗与恢复 + CD 计时
- **依赖**：T3.1
- **数据消费**：`.skl` coolTime/consumeMp/maintainMp, `.chr` growth.hpMax[level]/mpMax[level]
- **验收**：放技能 → MP 扣减 + CD 开始计时 → CD 归零后可用

### T3.9 — Monster AI

- **目的**：怪物 FSM，按阈值触发行为
- **依赖**：T3.1, T3.2 (可复用 State Machine)
- **数据消费**：`mob.sight/warlike/attackDelay/abilityCategory`
- **验收**：goblin idle → player 进入 sight 范围 → 追击 → 近身 → attack

### T3.10 — Status Effect System

- **目的**：18 种异常状态的施加、堆叠、持续时间、效果 tick
- **依赖**：T3.1
- **验收**：poison 每秒扣血、freeze 暂停动画、stun 禁止输入

### T3.11 — Frame Event Bus

- **目的**：帧标记事件分发（onKeyFrameFlag → 触发音效/VFX/攻击判定）
- **依赖**：T3.3
- **验收**：.ani delay=10000 sentinel → 触发对应引擎 hook

### T3.12 — Camera

- **目的**：3 级滚动、屏幕震动、目标追踪
- **依赖**：Phase 3d (Dungeon System)
- **数据消费**：`MapDef` 3-level scroll
- **验收**：角色移动时镜头平滑跟随

### T3.13 — Deterministic Replay

- **目的**：录制输入序列 + PRNG seed → 回放得到完全一致的战斗
- **依赖**：T3.1 (deterministic PRNG), T3.2-T3.11 (所有 system 确定性)
- **核心逻辑**：`record: store input[0..N] + seed → replay: feed same input + seed`
- **验收**：同一场战斗跑两次，逐帧 state hash 完全一致

---

## Phase 1d 补件：P1 数据补全（与 Phase 2 并行）

### T4.1 — .equ parser
- 装备属性：武器基础攻击力/防具防御力/属性加成
- 67777 文件，为 Phase 3a 装备系统提供数据

### T4.2 — .stk parser
- 技能树：技能归属/解锁顺序/tab 组织
- 10402 文件，为 Phase 3b 技能树提供数据

### T4.3 — character/common/ 共享动画
- death/getup/quickstanding 等 11 职业共享动画
- 为 Phase 3c 多职业支持提供动画基础

### T4.4 — 3-5 怪物全量数据
- goblin/投掷哥布林/牛头兵/1 boss/1 精英
- 为 T3.9 MonsterAI 跨 archetype 验证提供数据

---

## Phase 3-5 概览（远期待拆解）

| Phase | 内容 | 前置 |
|-------|------|------|
| Phase 3a | Equipment System | T4.1 |
| Phase 3b | Skill Tree | T4.2 |
| Phase 3c | Multi-Job (11职业) | T4.3 |
| Phase 3d | Dungeon System | T1.4 (dgn.fbs) |
| Phase 3e | Boss Patterns | T4.4 |
| Phase 4a-f | 渲染/音频/VFX/UI | Phase 2 核心完成 |
| Phase 5a-g | 浏览器优化 | 随 Phase 2 逐步集成 |

---

## 依赖关系总图

```
T0.1 .gitignore ──┐
T0.2 notify      ──┤
T0.3 LFS         ──┼── Phase 0 可并行
T0.4 flatc       ──┤
T0.5 Worker      ──┘
                    │
                    ▼
T1.1 字段清单 ──► T1.2 引用链 ──► T1.3 分层 ──► T1.4 .fbs ──► T1.5 版本化
                                                                    │
                                                    ┌───────────────┘
                                                    ▼
                                            T2.1 JSON→FlatBuffers
                                            T2.2 Texture Atlas
                                            T2.3 Audio Extract
                                            T2.4 Content Manifest
                                                    │
                                                    ▼
                                            T3.1 Simulation Core
                                                    │
                    ┌───────────────────────────────┤
                    ▼                               ▼
            T3.2 State Machine              T3.5 Physics
                    │                               │
                    ▼                               │
            T3.3 Animation ─────────────────────┐   │
                    │                            │   │
                    ▼                            ▼   │
            T3.4 Hit Detection ◄──────── T3.11 FrameEventBus
                    │
                    ▼
            T3.6 Damage Formula
                    │
                    ▼
            T3.7 Reaction SM
                    
            T3.8 Resource  ──── 可并行 ────┐
            T3.9 MonsterAI                  │
            T3.10 StatusEffect              │
            T3.12 Camera                    │
            T3.13 Replay                    │
                    │                       │
                    └───────┬───────────────┘
                            ▼
                    T4.1-T4.4 P1 补件 (并行)
                            │
                            ▼
                    Phase 3 扩展系统
                            │
                            ▼
                    Phase 4 表现层
                            │
                            ▼
                    Phase 5 浏览器优化
```

---

## 执行建议

**第一步（明天）**：
- Phase 0 全部 (T0.1-T0.5)，1-2 小时

**第二步（本周核心）**：
- T1.1 → T1.2 → T1.3 → T1.4 → T1.5，这是整个项目最关键的 5 步，决定了后续所有东西长什么样
- 预计 2-3 天集中做

**第三步（下周）**：
- T2.1-T2.4 离线编译器 + T3.1 Simulation Core 骨架
- 管线能跑通：JSON → .bin → Worker 加载 → 空循环 60Hz

**第四步（第 3-4 周）**：
- T3.2 State Machine → T3.3 Animation → T3.4 HitDetection → T3.6 Damage → T3.7 Reaction
- 此时 swordman 能在浏览器里出招、命中 goblin、产生伤害和击退

**第五步（第 5-6 周）**：
- T3.8-T3.13 其余 system + Phase 5 优化
- 完整战斗闭环 + 性能达标

---

*2026-05-26，基于 game-engine-architecture.md 拆解。每个 T 编号对应具体可执行、可验证的任务。*
