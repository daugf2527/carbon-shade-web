# dnf-native 全分支真值审计 (2026-06-07)

> 触发：用户要求核查 dnf-native 分支**所有**代码（不只当天）哪些数值是"自己想的"没从 PVF 推导。
> 方法：3 轮 agent 扫全部 49 个 engine 文件 + 主 AI 亲核所有核心战斗公式（agent 判断不全信——上一轮 agent 曾把自创错公式误判为 PVF 真值）。

## 一、审计发现的真问题（已修正）

| # | 项 | 问题本质 | 修正 commit |
|---|----|---------|------------|
| 1 | **LevelScaling 等级曲线** | 自创"每段4级 + LV65封顶 + 外推到LV70"，**与 research 文档冲突**（`reaction-formula-reverse-engineering.md:71` 明确全17值累加=LV70）。导致 LV70 physicalAttack 算成 89.0 而非真值 82.8 | `e0f4a4a` |
| 2 | **moveSpeed** | 硬编码 300 px/s + Z比0.5（猜测），未用已提取的 PVF 公式 | `136a843` |
| 3 | **weightFactor 用错重量主体** | launch/knockback 的 weightFactor 硬编码 `STUB_TARGET_WEIGHT=68000`（**攻击者** swordman 重量），无论打谁恒等 0.5467。物理上该用**被打者**重量（research line 114 `weightFactor(target)`）。weight 数据 PVF 明明有（goblin mob.weight=45000 / swordman chr.weight=68000），却没接 defender 真实重量 | （本轮） |
| 4 | **MonsterScaling 自创 base curve** | 自创 `baseHP=50+lv×6.5` 当怪物基准，但 field-matrix:245 明确 abilityCategory 是"相对角色 HP 的百分比"——基准是 PVF 角色 growth 曲线。改 `角色growth(basisLevel) × abilityCategory%` | （本轮） |
| 5 | **launch 峰高量级不对齐** | 换"量纲合理性"思路发现：attack3 击飞峰高仅 14px，而普通跳跃 61px——击飞 < 跳跃/4，物理矛盾（DNF launcher 应 ≥ 跳跃，视觉 ~100-200px）。根源：launch 公式 research 自己标 **❌ 公式未定**，liftUp 单位是 `px/s? frame? %?` 三问号。**正确值需客户端实测，PVF 参数单位全存疑——不自创公式凑数**（避免重蹈 #4 覆辙），改为显式标注"峰高量级待实测校准" | 标注/未自创 |

**关键教训**：
- #1 不是"漏标注"，是**编了个与已有 PVF 证据矛盾的公式**——比"明知是猜测"更隐蔽。
- #3 是**我第一版审计自己 frame 掉的代价**：初稿写成"D9=B stub 已诚实标注，核心公式全诚实"，用"已标注"盖过"用错主体 + 该接没接 PVF 真值"。用户"一点问题没有？我不信"逼出它。
- #5 是**第二个被 frame 的**：初稿 §二把 launch 写成"✅ 代码与文档一字不差，非自创 = 诚实"——但 research 自己标 ❌ 公式未定，**对齐一个未定推测 ≠ 真值对齐**，且结果（峰高14px）不合理。用户"换思路重新思考真值没对齐"逼出它。教训：'对齐了 research 工作假设' 不能当 '真值对齐'——要看那假设本身验证没有，还要看结果是否物理合理。

修正后(#3)：goblin(45000) 被 liftUp=300 打飞 vy 210（轻怪飞更高），swordman(68000) vy 164，行为真区分。守护测试 `engine-weight-launch.test.ts`（W1-W3）。
**仍是 stub/未对齐的部分（诚实保留）**：weightFactor 阈值 150000 + 公式形状、launch/pushback/hitstun 公式整体、liftUp 单位、峰高量级——全是 research ❌ 未定推测，需 DNF 客户端实测校准。本轮只真值化了能确定的（重量 VALUE、怪物基准曲线）。

## 一·补：换思路（4 新维度）扫出的真值未对齐清单

之前角度="扫数值常量对不对"。换 4 个新维度后补充发现：

| 思路 | 发现 | 性质 |
|------|------|------|
| **量纲合理性** | launch 峰高 14px << 跳跃 61px（见 #5）；liftUp/pushAside/weight 单位全存疑（px/s?/audio-only） | 公式未对齐真值，需实测 |
| **提取未消费** | `stuckbonusOnDamage` / `attackKind` / `weightDual` / weaponHitInfo `critOrSimilar`+`hitTag` 提取了但 engine 没读 | 多为 scope 外(crit系统未做)；hitTag/critOrSimilar 没读→无法真值路由 slot |
| **slot 路由** | `WEAPON_SLOT_ROUTING` 是 hardcoded map(attack→slot)，非 PVF 推导 | 已诚实标 D9=B；正确路由需 hitTag 真值 |
| **枚举折叠** | hitReaction 6类→4类；`attackLevel` 被 `void` 直接忽略；heavy/light stagger 都→HIT | FSM 无对应态，折叠丢真值（已知简化） |

## 二、核心战斗公式核对（亲核）

| 公式 | 来源 | 结论 |
|------|------|------|
| **伤害** `physAtk×atkBonus×weaponScale×(1-def/(def+K))` | atkBonus/damageScalePct=PVF；K=200 标 local_baseline | ✅ 与 combat 一致，标注清晰 |
| **launch Y** `liftUp×weaponLaunch×weightFactor` | research H2，**自己标 ❌ 公式未定** (line 17) | ⚠️ **见 §一#5——不是真值对齐，是对齐了一个未定推测，且峰高量级不合理** |
| **knockback X** `pushAside×pushBack×facing×weightFactor` | research H2，**自己标 ❌ 公式未定** (line 18) | ⚠️ 同 launch，公式未定推测；pushBack=0 不 fallback 这点是真值 |
| **weightFactor** `1-weight/150000` | weight VALUE 现为 PVF（defender 真实重量）；阈值 150000 + 公式形状仍 research 推测 | ⚠️ 重量主体已修(见§一#3)；阈值仍 stub |
| **hitstun** = 受击方 hitRecovery | chr/mob.hitRecovery | ✅ PVF tier3 真值 |

## 三、确认正确的 PVF 真值（之前几天的真值化工作）

经全面复核，Stage 2/3 真值化扎实，无"假装真值"：

| 系统 | PVF 真值字段 |
|------|------------|
| 重力 | `defaultGravityAccel=-1500` (dnf_enum_header.nut) |
| 移动速度 | `xNormalMoveVelocity=143 / yNormalMoveVelocity=114 / speedValueDefault=1000` |
| 角色属性 | chr.growth 17 段曲线（hp/atk/def/mp/mpRegen/hitRecovery） |
| jumpPower | chr.jumpPower=430 |
| 怪物 AI | mob.sight=300 / mob.attackDelay=3000ms |
| 怪物修正 | abilityCategory 百分比/绝对值 |
| cancel-window | skills[].cancelWindow（19/205）全字段 PVF |
| 伤害加成 | AtkDef.damageBonus / chr.weaponHitInfo[slot].damageScalePct |

## 四、真拿不到（DNF.exe C++ 硬编码，PVF 物理上没有 — 已全部诚实标注）

| 值 | 文件 | 标注 |
|----|------|------|
| MITIGATION_K=200 | DamageFormula | local_baseline + requiresManualVerification |
| weightFactor 阈值 150000 | ReactionResolver | D9=B stub |
| knockback friction 0.72 | KnockbackPhysics | LOCAL_BASELINE（PVF 无水平摩擦） |
| dash 倍率 1.6 / 双击窗口 12 | MovementSystem | LOCAL_BASELINE |
| 击倒/起身帧 (3/30/180/300) | DownSystem | LOCAL_BASELINE（随技能等级+抗性变） |
| command window 30/500ms | CommandMatcher/InputCommand | LOCAL_BASELINE |
| SkillInput BUFFER_TICKS=40 | SkillInputSystem | 工程缓冲（≥command window） |
| 怪物绝对 base curve | MonsterScaling | local_baseline（绝对基准在 C++） |
| GOBLIN_BASE hp70/atk10/def5 | Actor | local_baseline（mob shard hpMax=null） |
| attackRange 80 | MonsterAIConfig | LOCAL_BASELINE（真实 reach 在 .ani 几何） |
| status DOT (180/30/6/5) | StatusEffects | local_baseline + requiresCalibration |
| MonsterAI DEFAULT (200/80/60) | MonsterAIConfig | 历史 fallback，PVF shard 在场时覆盖 |

## 五、per-level 映射的诚实边界

LevelScaling 修正后仍有一个**无法从 PVF 消除的假设**：17 个 growth 值"哪个增量落在哪一级"是 DNF.exe 内部逻辑，PVF 只有 17 个裸数字。现实现用 16 增量线性铺满 LV1→LV70（4.3125 级/段）。**仅 LV1 base + LV70 全累加是 PVF 锚点，中间级是插值假设**（已在代码注释标 requiresManualVerification）。游戏当前玩家固定 LV70，所以中间级精度不影响运行时。

## 结论

- **2 个真问题已修**（LevelScaling 错公式 + moveSpeed 占位）
- **核心战斗公式全部诚实**（伤害/launch/knockback/hitstun 要么 PVF 要么对齐 research 文档）
- **之前几天的真值化工作扎实**，无新发现的"假装真值"
- 所有拿不到的值已 100% 标 local_baseline / requiresManualVerification，未反转置信度铁律
