# 接力交接 — dnf-native 真值修复（2026-06-07）

> 给新窗口接力用。读完这份 + `C:\Users\newwo\.claude\plans\delightful-enchanting-kay.md`（已批准的计划）即可上手。

## 0. 起手式（新窗口先做这 5 步）
```
1. 读 C:\Users\newwo\.claude\plans\delightful-enchanting-kay.md  （6-Batch 计划 + 决策记录）
2. 读 memory: feedback-red-root-cause-needs-runtime-evidence / feedback-audit-own-conclusions-not-just-code / feedback-qa-break-the-frame-not-just-rescan
3. git log --oneline -10   （看已推 commit）
4. git status              （看未提交改动 = Batch 2 半成品）
5. node scripts/static-test.mjs 2>&1 | grep '"passed": false'   （看当前 5 个 fail）
```

## 1. 总进度

**已推送 + CI 绿**（真值审计 5 问题，commit `136a843`→`1475ee1`）：LevelScaling / moveSpeed / weightFactor / MonsterScaling / launch-framing。详见 `docs/engineering/2026-06-07-dnf-native-truth-audit.md`。

**Batch 进度**：
| Batch | 内容 | 状态 |
|-------|------|------|
| 1 | 枚举折叠真值修 | ✅ 结论**跳过**（attackLevel PVF 0/81 没提取，伪真值修不做；causesDown 已用对，击退物理已在） |
| 2 | hitstop 命中停帧 | ✅ **完成** (commit `83a0abe`) — 4 测试补注册 HitStopSystem，115 静态全绿 0 回归，diag 已删 |
| 3 | superArmor + i-frame | ⬜ pending（蓝本+步骤见 §4） |
| 4 | combo counter | ⬜ pending（§5） |
| 5 | slot 路由 + 字段清理 | ⬜ pending（§6） |

## 2. ⚠️ 全局诚实纪律（必守，前几轮踩过坑）
- hitstop/armor/combo 的**数值**全是 **local_baseline**（DNF.exe 硬编码，PVF 拿不到）。commit/注释**不准写"真值化"**，只能写"机制移植，值 local_baseline + requiresManualVerification"。
- 改完别说"修好了"——每个失败必须**运行时实证**根因（用诊断脚本逐 tick），不靠读代码猜（教训：之前把 attack3 误判为 RED 根因）。
- 测试变绿不等于对——可能是盲区/作弊改断言。区分"基线重定"（时序变了，旧数字过时）vs"真 bug"，别盲调断言糊弄绿。

## 3. Batch 2 — hitstop（✅ 已收尾 commit `83a0abe`）

> **收尾完成 2026-06-07**：4 个失败测试(airborne / input-action / scenario-replay / two-way)
> 全部仅靠补注册 `HitStopSystem` 即变绿，**未改任何断言**（纯机制修复）。交接预估的两个代价
> **均未发生**：(1) airborne maxY 检测窗口够用——受击方解冻后 maxY=23.8>0；(2) scenario-replay
> 无硬编码 golden hash，确定性靠 live 双跑比对，所谓 **"replay 基线重定"未发生**。diag-hs.mjs 已删。
> 115 静态测试全绿 0 回归 + typecheck 绿（pre-commit hook 已验证）。下方为收尾前历史快照，存档作 audit trail。

### ⚠️ 当前 git 未提交快照（半成品边界，全留给新窗口收尾）
所有 hitstop 改动都**未提交**，工作区现状（`git status -s`）：
```
新增（?? 未跟踪）:
  src/engine/core/HitStop.ts                         ← hitstop 纯逻辑(profiles 值 local_baseline)
  src/engine/kernel/systems/HitStopSystem.ts         ← FLUSH phase 递减
  tests/static/engine-hitstop.test.ts                ← HS1-6 全绿
  scripts/diag-hs.mjs                                ← 临时诊断脚本(收尾前删,别提交)
  docs/engineering/2026-06-07-batch234-handoff.md    ← 本文档
修改（M）:
  src/engine/core/Actor.ts                           ← +frozenFrames 字段
  src/engine/kernel/EngineKernel.ts                  ← computeStateHash +fz fingerprint
  src/engine/kernel/systems/{Animation,Movement,Airborne,Knockback,Status,Resource,EnemyAI,Action}System.ts  ← 各 +frozen skip
  src/engine/kernel/systems/CombatResolutionSystem.ts ← 命中设双方 frozen + frozen attacker 不出 hitbox
  src/game/CombatScene.ts                            ← 注册 HitStopSystem
  tests/static/engine-combat-loop.test.ts            ← 已补 HitStopSystem 注册(验证修复用,已绿)
```
**注意**：combat-loop 已改好+验证绿，但**还没 commit**。剩 4 个失败测试（airborne-loop/two-way-fight/input-action-loop/scenario-replay）**还没动**。typecheck 当前是绿的。

### 已完成的代码（git status 里的未提交改动）
- **新文件** `src/engine/core/HitStop.ts`：HIT_STOP_PROFILES（attack1=4/attack2=5/attack3=7 等，**值 local_baseline**）+ `hitStopFor()` + `applyHitStop()`（frames+1 偏移补偿 tick 末递减）
- **新文件** `src/engine/kernel/systems/HitStopSystem.ts`：FLUSH phase，每 tick 末递减所有 actor.frozenFrames，归 0 emit `HitStopEnded`
- **Actor.ts**：加 `frozenFrames = 0` 字段（per-actor work-state，同 reaction/airborne）
- **EngineKernel.computeStateHash**：加 `fz=` fingerprint，**append-when-nonzero**（没触发 hitstop 的 replay hash 不变）
- **8 个 system 加 `if(actor.frozenFrames>0) continue`**：Animation/Movement/Airborne/Knockback/Status/Resource/EnemyAI + ActionSystem（冻结不接新 action）+ CombatResolution（冻结的 attacker 不出 hitbox）
- **CombatResolutionSystem**：命中后 `attacker.frozenFrames=applyHitStop(...,hs.frames)`，`defender=...×1.5`（受击方冻更久），emit `HitStopStarted`
- **CombatScene.ts**：注册了 HitStopSystem
- **新测试** `tests/static/engine-hitstop.test.ts`：HS1-6 **全绿**（含命中冻结/动画暂停/确定性）

### 🔑 卡点根因（已用 `scripts/diag-hs.mjs` 实证定位，不是猜）
全量回归 **5 个测试 FAIL**：combat-loop / airborne-loop / two-way-fight / input-action-loop / scenario-replay。

**根因不是 hitstop 机制 bug，也不是单纯基线重定，而是：这 5 个测试是 hitstop 之前写的，它们的 `buildScene`/kernel 没注册 HitStopSystem。** CombatResolution 现在命中会设 `frozenFrames=4`，但没有 HitStopSystem 去递减它 → **永久冻结 → 攻击者再也不出手 → goblin hp 卡住打不死**。

诊断证据（`node scripts/diag-hs.mjs`）：注册了 HitStopSystem 时 goblin 每 7 tick 命中一次、稳定递减会死（机制完全正确）。

### ✅ 修复方法（已在 combat-loop 验证有效）
给 5 个失败测试的 kernel 补 `registerSystem(new HitStopSystem())` + import。
- **combat-loop 已修+验证**：补注册后绿（goblin 43 tick 死，原 19 tick——hitstop 让战斗变慢是**预期**，D1 断言"1200 tick 内死"仍满足，无需改断言）。
- **剩 4 个照做**：airborne-loop / two-way-fight / input-action-loop / scenario-replay 各补 import + register。
  - airborne-loop 可能还要注意：命中后 victim 先冻 6 帧才起飞，若断言 maxY 检测窗口太短要放宽 tick（先 diag 实证再改）。
  - scenario-replay 的 finalStateHash 断言：frozenFrames 进 hash 了，**若该测试触发命中**则 hash 变，需重定（先确认是基线重定不是 bug）。

### 收尾步骤
```
1. 4 个测试补 HitStopSystem import+register（仿 combat-loop 改法）
2. 逐个 node .tmp/test-js/tests/static/<t>.test.js 看绿（先 run-tsc -p tsconfig.test.json 编译）
   — 若某个不是单纯补注册能绿，用 scripts/diag-hs.mjs 套路写 diag 实证根因，别盲改断言
3. 删 scripts/diag-hs.mjs（临时诊断，别提交）
4. npm run static:test 全绿 0 fail
5. git add 相关文件; commit:
   "feat(engine): hitstop 命中停帧机制移植 (Batch 2) — 值 local_baseline + replay 基线重定"
   注明：机制移植自 combat HitStopController；帧数 local_baseline+requiresManualVerification；
        老命中测试补注册 HitStopSystem；replay hash 含 frozenFrames(append-when-nonzero)
6. 推送（见 §7 代理坑）
```

## 4. Batch 3 — superArmor 霸体 + i-frame 通用无敌

**蓝本**（旧内核，照搬机制，值 local_baseline）：
- `src/combat/armor/ArmorResolver.ts`（13 行核心）：`decide()` 返回 hitStopAllowed / controlBlocked
- `src/combat/types.ts:202-213` `ArmorProfile`：`baseType: "none"|"super_armor"|"boss_super_armor"|"building_armor"` + immunities{grab/control/damage} + temporaryFlags{invulnerableUntilTick/getUpArmorUntilTick} + hitStopCapFrames + reactionOverride
- `src/combat/actors/ActorFactory.ts:29-82`：三种霸体的 profile 常量（building: 不能 launch/knockdown/knockback, hitStopCap=1; boss: hitStopCap=2; super: 可 knockback, cap=3）

**步骤**：
1. 新 `src/engine/core/ArmorProfile.ts`：移植 ArmorProfile 接口 + 三种 profile 常量（值 local_baseline）+ `decideArmor(profile, reactionKind)` 纯函数（返回 canLaunch/canKnockdown/hitStopCap）
2. `Actor.ts` 加 `armorProfile: ArmorProfile`（默认 none）
3. `CombatResolutionSystem`：命中时查 defender.armorProfile —— 霸体则 reaction 降级（不 launch/knockdown）、hitStop 用 cap 截断（接 §3 的 hs.bossCapFrames/buildingCapFrames，**已在 HitStop.ts 预留这俩字段**）
4. **i-frame 统一**：现在 `Actor.hitImmune`（bool）只在 DownSystem getup 用。升级为 tick-based `invulnerableUntilTick`（仿 temporaryFlags）：DownSystem getup / QuickRebound 都改用它；CombatResolution 命中检查 `tickCount < defender.invulnerableUntilTick` 跳过
5. 接 `ScenarioBooleans.armorHitObserved`（当前标 ❌ P4 gap，实现后转 true）
6. 测试 `engine-armor.test.ts`：boss 霸体不被 launch、hitStop 截到 cap、i-frame 期间免伤
7. 值全标 local_baseline

**坑**：armor 改了命中链，combat-loop 等测试若给 actor 设了 armorProfile 会变行为——默认 none 不影响现有。

## 5. Batch 4 — combo counter 连击修正

**蓝本**：`src/combat/combo/ComboCorrection.ts`（130 行）+ `src/combat/types.ts:151-167` `ComboCorrectionState`
- 压力条：standGauge/airGauge/downGauge（每 hit +固定值 barMax=10000）
- 影响：damageScale（随条上升衰减，min 0.15）/ gravityScale（airGauge→最大2.4×）/ launchResistance（→1.8×）/ stunRelief / 强制苏醒（downGauge 满→forcedWake）
- comboResetFrames=180（条衰减）—— **旧代码没显式 reset logic，移植时要补**

**步骤**：
1. 新 `src/engine/core/ComboCorrection.ts`：移植 state + 压力条累加 + 衰减 + 倍率计算（值全 local_baseline）
2. `Actor.ts` 加 `combo: ComboCorrectionState`（per-actor 受击累计）
3. `CombatResolutionSystem`：命中时 `damage *= combo.damageScale`；launch vy `*= 1/launchResistance`；airborne gravity `*= gravityScale`
4. 新 ComboSystem（CLEANUP phase）：每 tick 衰减压力条 + framesSinceLastHit++，超 comboResetFrames 清零
5. 测试：连击 N 下后 damageScale 下降、浮空抗性上升、reset 后恢复
6. 值 local_baseline

**坑**：damageScale 衰减会改伤害数值 → 现有 damage 测试（swordman-attack1-truth 等）若多段命中会变。先 diag 看影响，单段命中 combo 几乎不影响（条还没涨）。

## 6. Batch 5 — slot 路由 + 提取未消费字段

- **slot 路由**：当前 `CombatResolutionSystem.WEAPON_SLOT_ROUTING` 是 hardcoded map（attack1-3→slot0, hardattack→slot3）。真值化需 PVF `hitTag` 决定 slot——但**先查 .atk 有没有提取 hitTag**（AtkParser.ts）。若没有 → 这是 L3（数据缺），保持 hardcoded + 标注，别硬做。
- **提取未消费字段**：`attackKind`/`stuckbonusOnDamage`/`weightDual`/weaponHitInfo `critOrSimilar`/`hitTag`——多数是 scope 外（crit 系统没做）。逐个评估：有真值用途的接，纯 scope 外的在审计文档登记"已知未消费"即可，不强接。

## 7. 坑速查
- **推送代理**：FlClash 监听 **47890**（不是默认 7890，git 配置的 7890 是死的）。最稳：`git -c http.proxy= -c https.proxy= -c http.https://github.com.proxy= push --no-verify origin dnf-native`（清空代理直连 + --no-verify 跳过慢 pre-push hook，github 直连国内间歇通，重试 2-3 次）。代码 commit 要过门禁则去掉 --no-verify（pre-push 跑全量 analyze ~3min）。
- **测试编译**：改 `tests/static/*.test.ts` 后必须 `node scripts/run-tsc.mjs -p tsconfig.test.json` 重编译，再跑 `.tmp/test-js/tests/static/<t>.test.js`。
- **AniBox 格式**：`{x1,y1,z1,x2,y2,z2}`（角点对），不是 {x,y,w,h}。造命中盒抄 engine-combat-loop（attacker.x=0, defender.x=30, attackBox frame1 `{x1:0,y1:0,z1:-30,x2:50,y2:80,z2:30}`）。
- **per-actor 模式**：engine 用 actor 字段 + System tick（reaction/airborne/knockback/frozenFrames），不用中心化 controller。新机制照这个模式。
- **diag 参数要贴真实**：诊断脚本的 stats 要用真实测试的来源（statsFromPlayerShard 等），否则掩盖 bug（我第一版 diag 用 atk45 一击秒，掩盖了"只命中一次"）。

## 8. 验证基线
- 每 Batch：`npm run typecheck` + 新守护测试 + `npm run static:test` 全绿 0 回归
- 独立 commit + 直连 push + 等 CI 绿（gh run list --branch dnf-native）
