# 完整任务拆解 — 从现状到完整可玩游戏

> 基于 [`2026-05-26-game-engine-architecture.md`](2026-05-26-game-engine-architecture.md) 的游戏引擎双系统架构。
> 每个任务标注目的、输入、输出、依赖、验收标准。

---

## 前置盘点：我们已经有什么

```
✅ dnf-extract (C++)          — Windows 仓库内（.exe）；Linux/aarch64 ELF 仅 CI 构建未落产物
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
✅ stand/walk inline 黑洞      — 已修复（DNF 韩语命名 stay/move，commit 045d451）
✅ Runtime Schema 部分          — vite worker 配置 + physics/chr/skl/atk 4 个 .fbs 已写（commit 2c4d016 + 后续）
✅ Web Worker 骨架              — sim-worker + host skeleton 已就位（commit 2c4d016）
✅ FlatBuffers npm              — flatbuffers 包已装；scripts/compile-schema.mjs 已写（commit 2c4d016）
✅ Q9 swordman 全量             — 81 atk + 205 skl + 161 ani（commit 33192d9）
✅ goblin/jungle 数据完备       — goblin 0→1 atk / 0→8 ani; jungle 0→3 maps / 0→1 monsterRef（commit 4796ed0）
✅ dgn stale mapId 检测         — RuntimeExporter warn + 全副本扫描脚本（49.8% 双峰分布）
❌ LFS 二进制未上传            — Script.pvf + stage1-baseline.db 仅本地有，未 push origin
❌ notify.mjs Windows-only    — Termux termux-notification 未对接
❌ .equ parser                — 67777 文件，装备系统基础数据
❌ .stk parser                — 10402 文件，技能树基础数据
❌ character/common/ 动画     — 11 职业共享倒地/死亡/起身
❌ 3-5 怪物全量               — 只有 goblin
❌ P1 审计修复 (14项)          — spawn timeout/原子写/finishedAt/N+1 SELECT/...
❌ P2 审计修复 (16项)          — C++ 边界/TS 窄化
❌ 离线编译器                  — JSON → FlatBuffers .bin 仍未写（需 flatc CLI 装好）
❌ flatc CLI                  — github release 下载，本地网络问题待恢复
❌ mob/ani/dgn/manifest .fbs   — 剩余 4 个 schema（physics/chr/skl/atk 已写）
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

### T0.4 — ~~FlatBuffers 工具链~~ ✅ **部分完成（2026-05-27 commit 2c4d016）**

- **目的**：安装 `flatc` 编译器，建立 `.fbs` → `.ts` + `.bin` 的编译链
- **已落地**：✅ flatbuffers npm 包已装；✅ scripts/compile-schema.mjs 已写（含 flatc 检测器 + Windows 安装步骤提示）
- **仍待**：❌ flatc CLI 安装（需 github release 下载，本地网络问题待恢复）

### T0.5 — ~~Web Worker 构建配置~~ ✅ **已完成（2026-05-27 commit 2c4d016）**

- **目的**：Vite 支持 Web Worker 打包，Logic Worker 和 Render Worker 独立 bundle
- **已落地**：✅ vite.config.ts 加 `worker: { format: "es" }`；✅ src/engine/workers/{sim-worker.ts, sim-worker-host.ts, README.md} 骨架；✅ TypeScript lib reference directive 精确启 DOM/WebWorker 不污染全局
- **仍待**：❌ Browser smoke test 验证 worker round-trip（等 Stage 2 真用时补）

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

### T1.4 — FlatBuffers .fbs schema 编写 ⏳ **半完成（2026-05-27，4/8）**

- **目的**：把 T1.1-T1.3 的结论编译成 `.fbs` schema 文件
- **输出 + 状态**：
  ```
  src/engine/schema/
  ├── chr.fbs        ✅ 已写（含 GrowthRow / Awakening / WeaponHitInfoRow / WidthBox struct / PvfRef）
  ├── skl.fbs        ✅ 已写（含 CoolTime / ConsumeMp / CastingTime / CancelWindow dual-semantics / SkillIcon）
  ├── atk.fbs        ✅ 已写（22 字段含 liftUp/pushAside/knuckBack Tier-3 + element/hitReaction + 5 个 causes* bool）
  ├── mob.fbs        ❌ 待写（参照 goblin.json 反推）
  ├── ani.fbs        ❌ 待写（帧序列 + atk/dmg box）
  ├── dgn.fbs        ❌ 待写（**关键**：含 staleMapIds 字段处理 49.8% stale）
  ├── physics.fbs    ✅ 已写（12 常数 + DownParamType + KnockBackType + ZAccelType）
  └── manifest.fbs   ❌ 待写（path + sha256 + version 索引）
  ```
- **依赖**：T1.1, T1.2, T1.3
- **验收**：`flatc --ts *.fbs` 生成 TypeScript 类型，`flatc --binary` 生成空 `.bin` 骨架（等 flatc CLI 装好做）

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

> ⚠️ **2026-05-27 audit 警告 — Phase 2 T3.1-T3.13 任务拆解：计数精确匹配 md，聚类粒度差异**
> "13 system" 在 2026-05-27 用 dnf-extract --filter ".nut" + v4 noun classifier 验证：193 .nut + **478 case-sensitive 引擎 API（剔除 5 个 user-defined function 后精确匹配 md 478）+ 443 case-normalized + 7,101 调用点**（[验证报告](../engineering/nut-validation-2026-05-27.md)）。v4 启发式分类划出 **22 个 system buckets**（vs md 13，是粒度差异，量级相符；28% unclassified 但 **call share 仅 2.9%**——剩余全是 long-tail）。
> Q21 决策修正：.nut **不能**反推 C++ tick 顺序（DNF.exe 黑盒），但**能反推**引擎→脚本 12 步事件 lifecycle graph。Phase 2 JS/TS 实现先对齐 hook 顺序。
> T3.1-T3.13 各 system 包含的具体 API 子集见 [verification report §十](../engineering/nut-validation-2026-05-27.md)。

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

### T4.0 — ~~RuntimeExporter stand/walk inline 修复~~ ✅ **已修复 2026-05-27**

- **真实根因**（2026-05-27 audit）：不是 exporter 黑洞，是 CURATED_FILES 把 idle/walk 用了**英文意译命名**（stand.ani/walk.ani），但 **DNF PVF 实际用韩语习惯命名**——idle 叫 `stay`、walk 叫 `move`。dnf-extract 返回 `type:"error"/"not_found"`，被 `extractAndParseAnis` 静默跳过，最终只剩 10 个 .ani 进 shard。
- **修复**：[`scripts/stage1-baseline.mjs:77-82`](../../scripts/stage1-baseline.mjs) — `stand.ani` → `stay.ani`，`walk.ani` → `move.ani`
- **验收结果**：重跑 baseline 后 `swordman.json.animations` 有 12 个 key（含 stay / move）✅
- **附加产出**：CLAUDE.md "Known pitfalls" 段加 DNF motion 命名约定（避免其他职业重蹈覆辙）

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

### T4.5 — dgn shape 加 staleMapIds 字段 + Stage 2 副本系统优先 0% stale dgn ⚠️ **新增（2026-05-27）**

- **背景**：2026-05-27 全副本 stale mapId 扫描发现 338 dgn / 89 有 mapSpec / **49.8% 全局 stale rate**，且**双峰分布**——37 dgn 完全 OK / 42 dgn 81-100% stale（deprecated dungeon）。详见 [dgn-stale-mapids-2026-05-27.md](../engineering/dgn-stale-mapids-2026-05-27.md)。
- **修复 1**：exporter 已加 console.warn 检测（commit 33192d9）+ 全副本扫描脚本 `scripts/scan-dgn-stale-mapids.mjs`
- **修复 2（待做）**：在 DungeonRuntimeShape 加 `staleMapIds: number[]` 字段，让 Stage 2 引擎能感知
- **Stage 2 副本系统决策**：**不要用 jungle 作首选副本**（75% stale），优先用 0% stale 的核心副本：
  - dungeon/act3/goddesstemple.dgn (10 refs)
  - dungeon/act3/bloodhell.dgn (7 refs)
  - dungeon/act3/breeding.dgn (9 refs)
  - dungeon/act7/gentdefence.dgn (20 refs)
  - dungeon/act6/danceingbutterfly.dgn (77 refs)
- **验收**：dgn shape 含 staleMapIds 字段；Stage 2 task breakdown 副本选择以 0% stale 为白名单
- **优先级**：Stage 2 副本系统启动前必须解决（否则 jungle 之类的副本数据会半残）

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
