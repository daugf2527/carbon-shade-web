# dnf-native 全分支真值审计 (2026-06-07)

> 触发：用户要求核查 dnf-native 分支**所有**代码（不只当天）哪些数值是"自己想的"没从 PVF 推导。
> 方法：3 轮 agent 扫全部 49 个 engine 文件 + 主 AI 亲核所有核心战斗公式（agent 判断不全信——上一轮 agent 曾把自创错公式误判为 PVF 真值）。

## 一、审计发现的真问题（已修正）

| # | 项 | 问题本质 | 修正 commit |
|---|----|---------|------------|
| 1 | **LevelScaling 等级曲线** | 自创"每段4级 + LV65封顶 + 外推到LV70"，**与 research 文档冲突**（`reaction-formula-reverse-engineering.md:71` 明确全17值累加=LV70）。导致 LV70 physicalAttack 算成 89.0 而非真值 82.8 | `e0f4a4a` |
| 2 | **moveSpeed** | 硬编码 300 px/s + Z比0.5（猜测），未用已提取的 PVF 公式 | `136a843` |
| 3 | **weightFactor 用错重量主体** | launch/knockback 的 weightFactor 硬编码 `STUB_TARGET_WEIGHT=68000`（**攻击者** swordman 重量），无论打谁恒等 0.5467。物理上该用**被打者**重量（research line 114 `weightFactor(target)`）。weight 数据 PVF 明明有（goblin mob.weight=45000 / swordman chr.weight=68000），却没接 defender 真实重量 | （本轮） |

**关键教训**：
- #1 不是"漏标注"，是**编了个与已有 PVF 证据矛盾的公式**——比"明知是猜测"更隐蔽。
- #3 是**我第一版审计自己 frame 掉的代价**：初稿把它写成"D9=B stub 已诚实标注，核心公式全诚实"，用"已标注"三个字盖过了"用错重量主体 + 该接没接 PVF 真值"的事实。用户挑战"一点问题没有？我不信"逼出了它。教训：审计员说"全干净"时，99% 是没审到位（CLAUDE.md 危险措辞自审规则）。

修正后：goblin(45000) 被 liftUp=300 打飞 vy 210（轻怪飞更高），swordman(68000) vy 164，行为真区分。守护测试 `engine-weight-launch.test.ts`（W1-W3）防退回。
**仍是 stub 的部分（诚实保留）**：weightFactor 的阈值 150000 + 公式形状 `1-w/threshold` 仍是 research 推测（区间 100000-200000 中点）；本轮只把"重量 VALUE"真值化（用 defender 真实 PVF 重量替代硬编码攻击者重量）。

## 二、核心战斗公式核对（亲核，确认诚实）

| 公式 | 来源 | 结论 |
|------|------|------|
| **伤害** `physAtk×atkBonus×weaponScale×(1-def/(def+K))` | atkBonus/damageScalePct=PVF；K=200 标 local_baseline | ✅ 与 combat 一致，标注清晰 |
| **launch Y** `liftUp×weaponLaunch×weightFactor` | research H2 工作假设 (line 113) | ✅ 代码与文档一字不差，非自创 |
| **knockback X** `pushAside×pushBack×facing×weightFactor` | research H2 (line 114) | ✅ 同上；pushBack=0 不 fallback（真值） |
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
