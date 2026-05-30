# Stage 3 Manifest Survey — T-A.5 砍掉 default.json 前置调研

调研日期：2026-05-30  
目标：为 Stage 3 Phase A T-A.5（移除 `src/data/manifest/actions/default.json`）提供完整影响分析。

---

## 1. manifest 目录全景

```
src/data/manifest/
├── actions/
│   └── default.json          348 KB   ← 调研主体，38 个 action 的 JSON 序列化
├── ai/
│   ├── boss-patterns.json      1 KB
│   └── enemy-default.json     16 KB
├── buffs/
│   └── default.json            2 KB
├── damage/
│   └── classic-profile.json    2 KB
├── status/
│   ├── default.json           23 KB
│   └── pve-profile.json        1 KB
├── ai.ts                       ← 直接 import enemy-default.json（with { type: "json" }）
├── aiTypes.ts
├── buffs.ts                    ← 直接 import buffs/default.json
├── hash.ts                     ← computeActionsHash / computeDamageManifestHash 等
├── loader.ts                   ← loadActionsManifest() 的唯一入口
├── schema.ts                   ← Zod-style 运行时校验
├── sources.ts                  ← ACTION_MANIFEST_DATA_SOURCE 常量
└── status.ts                   ← 直接 import status/default.json
```

注：其他 manifest（ai/buffs/status/damage）均已在 TS 文件里直接 import，**只有 actions/default.json 走 loader.ts 的双路径加载（Vite + Node fallback）**。

---

## 2. default.json 结构剖析

顶层结构：`Record<ActionName, FrameDataAction>`（无包装对象，直接是 38 个 key）。

每个 `FrameDataAction` 的字段层级：

```
{
  actionName: string
  totalFrames: number
  startup: FrameWindow[]          // [{start, end}]
  active: HitBoxFrameWindow[]     // 命中判定窗口，含 hitbox 几何 + baseDamage + reactionProfile
  emitters: HitBoxFrameWindow[]   // 同 active（引用同一数组）
  recovery: FrameWindow[]
  timeline: { startup, emitters, recovery }
  cancelPolicy: {
    hitCancelFrom?: number
    whiffCancelFrom: number
    into: ActionName[]
  }
  hitStopProfile: { frames, bossCapFrames, buildingCapFrames }
  recoilProfile: { frames, canCancelRecoil }
  rootMotion?: { frames?: RootMotionStep[], speedXPerTick?, appliesEveryFrame? }
  feedbackProfile: { sound, vfx, cameraShake }
  costProfile?: { mpCost, cubeCost?, costTiming }
  cooldownProfile?: { actionName, independentCooldownFrames, globalCooldownFrames, cooldownStartsAt, freezesDuringHitStop, canBeReducedByFrenzy? }
  maxHoldFrames?: number
  invulnerableWindows?: FrameWindow[]
  sourcePolicy: Provenance
  fieldProvenance: FieldProvenanceMap   // 每个字段独立 Provenance 记录
}
```

`fieldProvenance` 是 default.json 体积膨胀的主因（每个 action 约 10 个字段 × 6 个 Provenance 子字段 = ~60 行 JSON）。

---

## 3. action 命名全集（38 个）

| # | ActionName | 类型 | 有 hitbox | 有 costProfile | 有 cooldownProfile |
|---|-----------|------|-----------|---------------|-------------------|
| 1 | Idle | 状态 | 否 | 否 | 否 |
| 2 | Walk | 移动 | 否 | 否 | 否 |
| 3 | Run | 移动 | 否 | 否 | 否 |
| 4 | NormalBasic1 | 普攻 | 是 | 否 | 否 |
| 5 | NormalBasic2 | 普攻 | 是 | 否 | 否 |
| 6 | NormalBasic3 | 普攻 | 是 | 否 | 否 |
| 7 | DashAttack | 普攻 | 是 | 否 | 否 |
| 8 | Jump | 移动 | 否 | 否 | 否 |
| 9 | JumpAttack | 普攻 | 是 | 否 | 否 |
| 10 | FrenzyToggle | 状态 | 否 | 否 | 否 |
| 11 | FrenzyBasic1 | 狂暴普攻 | 是 | 否 | 否 |
| 12 | FrenzyBasic2 | 狂暴普攻 | 是 | 否 | 否 |
| 13 | FrenzyBasic3 | 狂暴普攻 | 是 | 否 | 否 |
| 14 | UpwardSlash | 技能 | 是 | 是 | 是 |
| 15 | MountainousWheel | 技能 | 是 | 是 | 是 |
| 16 | RagingFury | 技能 | 是 | 是 | 是 |
| 17 | Bloodlust | 技能 | 是（grab） | 是 | 是 |
| 18 | Backstep | 移动 | 否 | 是 | 否 |
| 19 | QuickRebound | 移动 | 否 | 是 | 是 |
| 20 | Derange | 状态 | 否 | 否 | 是 |
| 21 | Diehard | 状态 | 否 | 是 | 是 |
| 22 | DebugReset | 调试 | 否 | 否 | 否 |
| 23 | ForceDownPlayer | 调试 | 否 | 否 | 否 |
| 24 | ForceBleed | 调试 | 否 | 否 | 否 |
| 25 | SpawnTargets | 调试 | 否 | 否 | 否 |
| 26 | RunScreenshotScenario | 调试 | 否 | 否 | 否 |
| 27 | GoreCross | 技能 | 是（3 hit） | 是 | 是 |
| 28 | OutrageBreak | 技能 | 是 | 是 | 是 |
| 29 | ExtremeOverkill | 技能 | 是（2 hit） | 是 | 是 |
| 30 | RagingFury2 | 技能 | 是（14 hit） | 是 | 是 |
| 31 | BloodRuin | 技能 | 是 | 是 | 是 |
| 32 | BloodSword | 技能 | 是 | 是 | 是 |
| 33 | BurstFury | 技能 | 是 | 是 | 是 |
| 34 | EarthShatter | 技能 | 是 | 是 | 是 |
| 35 | Thirst | 技能 | 否 | 是 | 是 |
| 36 | BloodMemory | 技能 | 否 | 是 | 是 |
| 37 | VimAndVigor | 技能 | 否 | 是 | 是 |
| 38 | EnemyBasic | 敌方 | 是 | 否 | 否 |

---

## 4. 引用点清单

### 4.1 直接引用 default.json 文件路径的代码点

| 文件 | 行号 | 引用方式 | 说明 |
|------|------|---------|------|
| `src/data/manifest/loader.ts` | 36 | `import("./actions/default.json")` | Vite 路径（动态 import） |
| `src/data/manifest/loader.ts` | 43 | `readFileSync(join(__dirname, "actions", "default.json"))` | Node 路径（fs fallback） |
| `src/data/manifest/sources.ts` | 1 | 字符串常量 `"src/data/manifest/actions/default.json#actions"` | ACTION_MANIFEST_DATA_SOURCE |

### 4.2 通过 loader.ts API 间接消费 default.json 的代码点

| 文件 | 行号 | 调用 | 说明 |
|------|------|------|------|
| `src/game/bootActionManifest.ts` | 20 | `loadActionsManifest()` | 游戏启动时加载并注入 FrameDataAction |
| `src/game/bootActionManifest.ts` | 21 | `loadFromManifest(actions)` | 注入到 FrameDataAction 内存缓存 |
| `tests/static/manifest-provenance.test.ts` | 25, 36, 104 | `loadActionsManifest()` | **关键**：断言 JSON 与 TS ACTIONS 结构一致 + hash 相等 |
| `tests/static/schema-hash-freshness.test.ts` | 10 | `loadActionsManifest()` | 断言 ReplayRecorder hash 与 manifest hash 一致 |

### 4.3 通过 ACTION_MANIFEST_DATA_SOURCE 常量引用路径字符串的代码点

| 文件 | 行号 | 说明 |
|------|------|------|
| `src/game/bootActionManifest.ts` | 5, 14, 25 | 返回值类型 + 赋值 |
| `src/combat/replay/ReplayRecorder.ts` | 12, 70 | dataSources.actions 字段 |
| `tests/static/schema-hash-freshness.test.ts` | 39 | 断言 `dataSources.actions === "src/data/manifest/actions/default.json#actions"` |
| `tests/static/manifest-provenance.test.ts` | 42 | 断言 `result.dataSource === "src/data/manifest/actions/default.json#actions"` |

### 4.4 action 名称硬编码引用（非 default.json 直接引用，但砍掉后需关注）

| 文件 | 行号 | 引用的 action 名 | 说明 |
|------|------|----------------|------|
| `src/combat/actions/FrameDataAction.ts` | 5 | 全部 24 个 combatCancelTargets | TS 硬编码 ACTIONS 表 |
| `src/combat/actions/FrameDataAction.ts` | 125–167 | 全部 38 个 | ACTIONS 对象定义（TS 真值源） |
| `src/combat/kernel/CombatKernel.ts` | 581 | `"Bloodlust"` | 直接字符串引用 |
| `src/game/CombatScene.ts` | 715 | 12 个攻击 action 名 | isAttackAction 判断列表 |
| `src/game/CombatScene.ts` | 722, 742 | RagingFury/UpwardSlash/NormalBasic2/3 | 武器弧度渲染分支 |
| `src/game/CombatScene.ts` | 1065–1067 | NormalBasic1/2/3 | 调试按钮 |
| `tests/static/action-cancel-probe.test.ts` | 32–59 | Bloodlust/RagingFury/NormalBasic1 | 取消帧测试 fixture |
| `tests/static/fuzz-combat.test.ts` | 19–23 | 13 个 action 名 | fuzz 测试 action 池 |
| `tests/static/config-validate.test.ts` | 145–157 | 17+9 个 action 名 | PLAYER_COMBAT_ACTIONS + NON_SPRITE_ACTIONS |

---

## 5. 影响清单（按修改成本排序）

### Trivial（改 1 行或删文件即可）

| 文件 | 改动内容 |
|------|---------|
| `src/data/manifest/sources.ts` | 删除或改写 ACTION_MANIFEST_DATA_SOURCE 常量（或改为指向 TS 模块） |
| `src/data/manifest/actions/default.json` | 直接删除文件 |

### Moderate（需要协调逻辑，但改动范围明确）

| 文件 | 改动内容 | 原因 |
|------|---------|------|
| `src/data/manifest/loader.ts` | 删除 `loadActionsManifest()` 中的双路径 JSON 加载逻辑，改为直接返回 `ACTIONS`（或删除整个函数） | 唯一加载入口 |
| `src/game/bootActionManifest.ts` | 简化 `initializeActionManifestForRuntime()`：不再需要 async 加载，直接用 `ACTIONS` | 依赖 loadActionsManifest |
| `src/combat/replay/ReplayRecorder.ts` | 更新 `dataSources.actions` 默认值（从 JSON 路径改为 TS 模块路径或移除） | 路径字符串硬编码 |
| `tests/static/schema-hash-freshness.test.ts` | 更新 `dataSources.actions` 断言（第 39 行） | 路径字符串断言 |

### Heavy（测试逻辑需要重写，不只是改字符串）

| 文件 | 改动内容 | 原因 |
|------|---------|------|
| `tests/static/manifest-provenance.test.ts` | **核心障碍**：第 25–31 行断言"JSON manifest 与 TS ACTIONS 结构一致 + hash 相等"。砍掉 JSON 后这个测试的前提消失，需要重写为"TS ACTIONS 自身满足 runtime provenance gates"（validateManifest 已有，第 20 行已测） | 测试存在意义依赖 JSON 文件 |
| `tests/static/manifest-provenance.test.ts` | 第 42 行 `result.dataSource === "src/data/manifest/actions/default.json#actions"` 断言需更新 | 路径字符串断言 |

---

## 6. 推荐砍切方案

### 背景约束

`manifest-provenance.test.ts` 第 30–31 行有一个**结构一致性守卫**：
```ts
assert.deepEqual(loadedStripped, actionsStripped, "JSON actions manifest should remain in JSON-structural parity with ACTIONS");
assert.equal(computeActionsHash(loaded), computeActionsHash(ACTIONS), "JSON actions manifest hash should match ACTIONS hash");
```
这个测试的存在意义是防止 JSON 与 TS 漂移。砍掉 JSON 后，这个守卫本身就消失了——**这是设计意图的变化，不是 bug**。

### 方案 A：一次性砍（推荐）

适合 T-A.5 作为单一 commit 完成：

1. 删除 `src/data/manifest/actions/default.json`
2. 修改 `loader.ts`：`loadActionsManifest()` 改为直接 `return ACTIONS`（保留函数签名，不破坏调用方）
3. 修改 `sources.ts`：常量改为 `"src/combat/actions/FrameDataAction.ts#ACTIONS"`
4. 修改 `bootActionManifest.ts`：去掉 async 加载，直接 `loadFromManifest(ACTIONS)`
5. 修改 `ReplayRecorder.ts`：`defaultActionDataSource` 直接用新常量，去掉 `loadedManifestHash` 分支判断
6. 修改 `manifest-provenance.test.ts`：删除 JSON 结构一致性断言（第 25–31 行），保留 validateManifest(cloneActions()) 断言
7. 修改 `schema-hash-freshness.test.ts`：更新 `dataSources.actions` 断言字符串

**优点**：一次清干净，无中间状态。  
**风险**：loader.ts 改为同步后，调用方 `await loadActionsManifest()` 仍然有效（Promise.resolve 包装），无破坏性。

### 方案 B：分步砍（保守）

- Step 1：让 `loadActionsManifest()` 优先返回 `ACTIONS`（JSON 加载降级为 fallback），更新 sources.ts 常量
- Step 2：确认测试全绿后，删除 JSON 文件，清理 loader.ts 中的 JSON 加载路径

**优点**：每步可独立验证。  
**缺点**：Step 1 之后 JSON 文件变成死代码，容易遗忘 Step 2。

### 推荐

选**方案 A**。改动点明确（7 个文件），无隐藏依赖，一次 commit 可完整交付。

---

## 关键数字汇总

- **action 数量**：38 个
- **直接引用 default.json 的代码点**：3 处（loader.ts ×2 + sources.ts ×1）
- **间接消费（通过 loader API）**：4 处（bootActionManifest + 3 个测试文件）
- **路径字符串断言（测试）**：2 处（schema-hash-freshness.test.ts:39 + manifest-provenance.test.ts:42）
- **需要重写逻辑的测试**：1 处（manifest-provenance.test.ts 第 25–31 行结构一致性守卫）
- **action 名硬编码引用（不受 JSON 砍切直接影响）**：分布在 5 个文件，砍 JSON 后无需改动
- **总需修改文件数**：7 个（loader.ts / sources.ts / bootActionManifest.ts / ReplayRecorder.ts / manifest-provenance.test.ts / schema-hash-freshness.test.ts + 删除 default.json）
