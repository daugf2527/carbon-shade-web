# 游戏架构师学习路线图 — 基于 2026-05-26 对话诊断

> 今天全天讨论暴露的知识结构画像：强 web 开发背景（TypeScript/管线/数据库），自信的架构直觉（DAG/质疑精神），但游戏引擎领域知识和量化思维有明显缺口。

> ⚠️ **2026-05-27 audit 边界提醒** — 本诊断基于 2026-05-26 **上午对话片段**做出，特别是"不量化"那条评判（§二、§五）。但**同一天下午就发生了量化转换**——[`game-engine-architecture.md`](2026-05-26-game-engine-architecture.md) 自己给 13 个 system 各自标注了帧预算（State Machine 3ms / Hit 2ms / Physics 1ms / ... / combat tick ~10ms / render ~6ms / 总预算 16.67ms）。所以"全是定性判断、没数字"这条 5/26 上午成立、5/26 下午已被打破。读本文档时把它当**那一刻的快照**而不是**对人的永恒诊断**。

---

## 你现在的水平定位

```
Web 架构师 ────────────── 你在这里 ────────────── 游戏架构师
   │                                                    │
   │   ✅ 数据管线设计                                   │
   │   ✅ 系统分层思维                                   │
   │   ✅ 质疑与验证习惯                                 │
   │   ✅ 从第一性原理推导                               │
   │                                                    │
   │   ⚠️ 用 web 术语描述游戏问题                        │
   │   ⚠️ 线性思维（管线→建模→系统）                     │
   │   ❌ 不以仿真循环为思考原点                          │
   │   ❌ 没有帧预算概念                                 │
   │   ❌ 不熟悉游戏专用数据结构                          │
   │   ❌ 不量化（全定性，无数字）                        │
```

差距不在智商或方法论，在**领域经验的三个维度**：仿真思维、量化习惯、游戏专用知识。

---

## 一、仿真思维 — 把"循环"刻进本能

### 你现在的思维模式
```
数据 → 建模 → 字段 → 系统 → 渲染 → 游戏
（线性的，像 web request → database → response）
```

### 专业游戏架构师的思维模式
```
每 16.67ms:
  Input     → 读了什么键？
  State     → 当前状态允许什么操作？
  Physics   → 位置/速度变化了多少？
  Hit       → 攻击框和受击框重叠了吗？
  Damage    → 造成了多少伤害？
  Reaction  → 受击者进入什么状态？
  Resource  → HP/MP/CD 变了多少？
  AI        → 怪物下一步做什么？
  Snapshot  → 打包状态发给渲染线程
  Render    → 画这一帧
  Next frame...
（循环的，以 tick 为原点的向外辐射）
```

### 怎么练
- 每设计一个系统，开口第一句话必须带毫秒数："这个系统的 tick() 预计耗时 ___ms"
- 把 16.67ms 贴在显示器旁边。超过 10ms 的 combat tick 就是失败
- 读 [Fix Your Timestep](https://gafferongames.com/post/fix_your_timestep/) — 游戏循环的经典文章
- 读 [Game Programming Patterns](https://gameprogrammingpatterns.com/) 的 Game Loop 章

---

## 二、量化习惯 — 把"大概"换成"数字"

### 你今天说的
> "这个系统数据够用"
> "应该能跑起来"
> "性能会受影响"

### 专业架构师说的
> "该系统的 tick() 需要读 3 个 Float32Array、做 2 次 AABB 检测、写 1 个结果——预计 0.3ms。13 个系统合计约 8ms。剩余 8.67ms 给渲染，在 60fps 下安全。降至 30fps 阈值为 11ms combat tick。"

### 差距在哪
全是定性判断。没有一次提到帧预算、内存占用、加载时间的具体数字。

### 怎么练
- 用 `performance.now()` 或 `console.time()` 测量你现在的 pipeline 每一步耗时
- 拿 swordman.json 实测 `JSON.parse()` 耗时 → 这就是为什么不能用 JSON 做运行时格式的数字证据
- 每做一个架构决策，附带一个数字理由："选方案 A 因为它的 hot 路径比方案 B 少 2 次数组遍历"
- 读 [Data-Oriented Design](https://www.dataorienteddesign.com/) 的前三章

---

## 三、游戏专用知识 — 几个硬骨头

### 1. State Machine 作为内核

**你现在知道的**：29 个状态，5 级优先级

**你缺的**：
- 状态转移表怎么设计（二维表：currentState × input → nextState）
- enter/exit/tick 回调的生命周期
- 状态层叠（子状态机、并发状态）
- 优先级仲裁的实现方式（不是 if-else，是查表）

**怎么学**：
- 读 [State Pattern in Game Programming Patterns](https://gameprogrammingpatterns.com/state.html)
- 研究 MUGEN 引擎的状态机（开源格斗引擎，状态定义很接近 DNF）
- 画一张 swordman 的 24 个 motion 之间的状态转移图

### 2. Data-Oriented Design

**你现在知道的**：HOT/WARM/COLD 分层（今天刚学的）

**你缺的**：
- Struct of Arrays vs Array of Structs — 为什么 `Float32Array` 比 `{x,y,z}[]` 快 10 倍
- 缓存行（cache line）的概念 — 读一个字段会把相邻 64 字节全拉进 CPU 缓存
- 为什么游戏引擎把数据按"访问模式"组织，而不是按"业务含义"

**怎么学**：
- 读 Mike Acton 的 [CppCon 2014 talk on DOD](https://www.youtube.com/watch?v=rX0ItVEVjHc)（经典，1 小时）
- 把 swordman.json 的 growth 表（9×17 数组）想象成 SoA 布局，对比 JSON 的嵌套对象布局
- 算一算：读 swordman 的 hpMax 需要解析多少层嵌套？SoA 呢？

### 3. 确定性系统

**你现在知道的**：seeded PRNG + ordered iteration = replay

**你缺的**：
- IEEE 754 浮点在浏览器里到底是不是确定的？（答案是"看引擎"——V8 下基本确定，但有坑）
- 为什么集合的迭代顺序重要（`Map` 的插入顺序是确定的，`Object.keys()` 不一定是）
- 怎么做 state hash 验证（每帧把所有状态值拼成 string，hash 一把，跟录制对比）

**怎么学**：
- 读 [Deterministic Lockstep](https://gafferongames.com/post/deterministic_lockstep/)
- 看 GGPO 的源码（开源格斗游戏回滚网络库）
- 写一个简单的：两个 actor 各自随机走，record → replay → 逐帧对比坐标

### 4. 资产管线

**你现在知道的**：离线构建 → FlatBuffers → 运行时加载

**你缺的**：
- 构建时的依赖追踪（改了一个 .chr → 哪些 .bin 需要重编？）
- 内容哈希（sha256 → 文件名 → 浏览器永久缓存）
- 增量构建（只重编改过的文件，而不是全量重编）
- 资产流式加载（boot 只拉 2MB，其余按需从 IndexedDB 取）

**怎么学**：
- 读 Unreal Engine 的 [Asset Registry and Cooking](https://dev.epicgames.com/documentation/en-us/unreal-engine/asset-management-in-unreal-engine) 文档
- 看你的 baseline 脚本——它的 19 个 CURATED_FILES 就是雏形，缺的是增量检测和依赖追踪
- 设计一个 `.bin` 文件命名规则：`<type>_<name>_<sha256前8位>.bin`

### 5. 渲染管线基础

**你现在知道的**：Phaser 3 封装了 WebGL，不用自己写

**你缺的**：
- Draw call 是什么，为什么越少越好（每次 `gl.drawElements()` 都是一次 CPU→GPU 通信）
- 纹理图集（Texture Atlas）为什么重要（全部帧打一张大图 = 1 次 draw call，各自小图 = N 次）
- 渲染排序（Y-sort：按 Y 坐标排序 → 远的先画，近的后画 → 正确的遮挡关系）
- 帧时间线：主线程做输入+UI → Worker 做 combat → Worker 做 render prep → GPU 画

**怎么学**：
- 读 [WebGL Fundamentals](https://webglfundamentals.org/) 的前 5 章
- 打开 Phaser 3 源码，找到它的 batch renderer，看它怎么把多个 sprite 合并成一次 draw call
- 在 Chrome DevTools → Performance → 录一帧 Phaser 游戏，看 GPU 耗时分布

---

## 四、你现在就该做的，按优先级排

| 优先 | 做什么 | 多久 | 为什么 |
|------|--------|------|--------|
| 1 | 读 Fix Your Timestep（一篇文章 15 分钟） | 今晚 | 明天写 T3.1 Simulation Core 直接用到 |
| 2 | 读 Game Programming Patterns 的 State 章 | 今晚 | T3.2 State Machine 直接用到 |
| 3 | 拿 swordman.json 实测 JSON.parse 耗时 | 明天 | 有数字才能决定 Q3（FlatBuffers 何时切） |
| 4 | 画 swordman 24 个 motion 的状态转移图 | 本周 | T3.2 的基础输入 |
| 5 | 看 Mike Acton 的 DOD 演讲 | 本周 | 理解为什么要 HOT/WARM/COLD 分层 |
| 6 | 读 Unreal Cooking 文档（概述部分） | 下周 | 理解资产管线的标准做法 |
| 7 | 读 GGPO 源码或文章 | Phase 2 中后期 | T3.13 Replay 需要 |
| 8 | 读 WebGL Fundamentals | Phase 3 前 | 渲染层对接需要 |

---

## 五、你不需要学的

以下领域跟你这个项目没关系，不要浪费时间：
- 3D 数学（四元数、矩阵变换）—— 你是 2.5D，Z 轴是深度切片
- 网络同步（客户端预测、服务器裁决）—— 你是单体 PVE
- 程序化生成（PCG、Houdini）—— DNF 副本是手摆的
- 着色器编程（GLSL/HLSL）—— Phaser 封装好了，除非做自定义后处理
- C++ 游戏引擎开发 —— dnf-extract 只是提取工具，不需要深入

---

## 六、一句话定位

**你是 web 架构师跨界做游戏架构，方法论 80 分，领域知识 40 分，量化习惯 20 分。** 好消息是量化习惯和领域知识可以在边做项目边补——今天已经开始了。一个月后，等你写完了 Simulation Core，这些概念就不再是纸上的，是手里跑着的代码。

---

*2026-05-26，基于全天讨论诊断产出。*
