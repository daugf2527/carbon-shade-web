# 待定缺口清单 — 需外部数据或进一步研究

> 生成日期: 2026-05-13
> 来源: 6 个 Agent 对 7 条链路的全量审计
> 这些项不能 100% 确定修复方案，需要你提供数据、决策、或进一步验证

---

## A. 需要 DNF 客户端数据

### A1. .skl 字节码 string 提取
- **位置**: `PvfScriptParser.ts:46-66`
- **现状**: 所有 `cmd.value` 永远是 number，string 类型命令（type 7/9/10）持有的是 string table index
- **需要**: .skl 格式规范 — string 是如何编码的？inline 还是需要查 stringtable.bin？

### A2. .ani 版本覆盖不全
- **位置**: `AniAnalyzer.ts:40-47`
- **现状**: 只有 6/15+ 版本有 record size 映射；坐标偏移量来自少量样本文件的猜测
- **需要**: 更多 .ani 样本文件（不同 version + sub-version 组合）来完善 record layout

### A3. .ani hitbox 元数据提取缺失
- **位置**: `AniAnalyzer.ts:322-340`
- **现状**: `damageRate/hitType/elementType/attackCategory` 从未被提取
- **需要**: DNF .ani 格式文档或社区参考 — 这些字段在 binary 的哪个 offset？

### A4. SklAnalyzer 属性 ID 映射不完整
- **位置**: `SklAnalyzer.ts:18-39`
- **现状**: KNOWN_PROPERTY_IDS 只有 18 个，实际 .skl 有数百个
- **需要**: 社区 PVF property ID 表，或 DNF 私服文档

### A5. .skl 时间单位不确定
- **位置**: `SklAnalyzer.ts:173-174`
- **现状**: coolTime/castTime 直接当毫秒用，但可能是 game tick 或其他单位
- **需要**: .skl 时间单位文档，或对照 Neople API 的已知冷却值做反向验证

### A6. actionName 映射不完整 (Gap #6)
- **位置**: `berserkerSkillFacts.ts` 的 skillId hashes
- **现状**: 55 个 Neo Berserker 技能，仅 21+ 完成映射
- **需要**: Neople API `_skill_list.json` 完整数据 + API key 验证

### A7. ImgParser V6 不支持
- **位置**: `ImgParser.ts:54-60`
- **现状**: V6 格式直接抛错
- **需要**: V6 IMG 样本文件或格式规范

---

## B. 需要 DNF 参考数据（数值/机制）

### B1. AI 参数全部 confidence=low
- **位置**: `src/data/manifest/ai/enemy-default.json`
- **现状**: 5 种敌人的 AI 参数（aggressiveness, sightRange, hit-reaction timers）都是本地调参
- **需要**: DNF 客户端 AI 数据表（Batch C PVF 提取）

### B2. 状态 breakThreshold 从未设置
- **位置**: 所有 status profile JSON
- **现状**: `breakThreshold` 字段存在但无配置
- **需要**: DNF 元素破防阈值数据

### B3. 物理常量与引擎不一致
- **位置**: `dnfPhysicsConstants.ts` vs `CombatKernel.ts:769`
- **现状**: 提取了 DEFAULT_GRAVITY_ACCEL=-1500 但引擎用硬编码 0.56
- **需要**: 确认 DNF 物理常量的单位系统和 Combat Lab 单位系统的转换关系

### B4. boss-patterns.json phase 2 HP 阈值=0
- **位置**: `boss-patterns.json`
- **现状**: 愤怒阶段在 hpPercent ≤ 0 时触发（濒死/已死）
- **需要**: DNF Bull Boss 的实际狂暴阈值（通常是 20-30%）

### B5. Buff 数值无外部验证
- **位置**: `BuffLifecycleSystem.ts` 的硬编码常量
- **现状**: Frenzy/Derange/Diehard 等 buff 的数值是本地 tuning
- **需要**: Neople API 或 DFO Wiki 的 buff 数值参考

---

## C. 需要设计决策

### C1. sweep 碰撞的实际语义
- **位置**: `HitResolver2D5.ts:103-109`
- **现状**: sweep 和 rect 用同一套碰撞逻辑
- **问题**: DNF 的 sweep 是什么？射线检测？扇形区域？多帧投影？需要确定后再实现

### C2. 技能取消链的严格程度
- **位置**: `FrameDataAction.ts:5` — `combatCancelTargets` = 全部 38 个动作
- **现状**: 所有技能可取消到所有技能（太宽松）
- **问题**: DNF 70-85 版本的取消规则是什么？需要精确的 per-skill cancelPolicy

### C3. 哪些未接入动作应该开放
- **位置**: `CombatKernel.ts:190` — allowed set 仅 18 个
- **现状**: 13 个有完整定义的 FrameDataAction 无法触发
- **问题**: 是故意锁定的（因为没调好/缺 sprite）还是遗漏？
  - GoreCross, OutrageBreak, ExtremeOverkill
  - RagingFury2, BloodRuin, BloodSword
  - BurstFury, EarthShatter
  - FrenzyBasic1/2/3, NormalBasic2/3
  - BloodyCross

### C4. 渲染层 @ts-nocheck 移除
- **位置**: `CombatScene.ts:1`
- **现状**: 整个渲染层文件绕过类型检查
- **问题**: 移除后预计有大量类型错误（Phaser API 类型兼容性）。需要逐个修复还是渐进开启？

### C5. tsconfig strict:true
- **位置**: `tsconfig.json:9`
- **现状**: `strict: false`
- **问题**: 82 个 TS 文件无 null safety。渐进开启策略？先 strictNullChecks？

---

## D. 需要资源文件

### D1. 音效素材
- **现状**: 只有 6 个 Web Audio oscillator tone，无 .mp3/.ogg
- **需要**: 打击音效（sword swing, impact, whoosh, explosion），或接受合成音

### D2. 角色 sprite 补充
- grab pose（Bloodlust 抓取姿态）
- 玩家 airborne frames（launch/fall/jump）
- building spritesheet（建筑目前用矩形）
- 状态效果图标/overlay

### D3. 动作对应的 sprite 映射
- `SpriteFrameLibrary.ts` 中多个 reaction/action 缺少 sprite 映射
- armor_feedback_only, getting_up (goblin), grabbed 等

---

## E. 架构矛盾待解决

### E1. 规划文档 vs 代码：.skl 格式不一致
- **规划文档** (`pvf-skl-extraction-plan.md`) 假设 .skl 解密后是纯文本 key=value
- **代码实现** (`PvfScriptParser.ts`) 解析的是二进制 bytecode (magic 0xB0 0xD0)
- **问题**: 两者之间存在一个缺失的"反编译"步骤，还是文档过期了？
- **需要**: 确认你的 PVF 数据源格式

### E2. MappedFrameDataAction → FrameDataAction 的 gap
- `SklToActionMapper` 输出 `MappedFrameDataAction`（约 15 字段）
- 战斗引擎需要 `FrameDataAction`（约 30 字段）
- 缺少约 15 个字段的映射：emitters, timeline, recovery, cancelPolicy, rootMotion, hitStopProfile, recoilProfile, armorWindows, costProfile, feedbackProfile
- **问题**: 这些字段从哪里来？PVF 数据？本地 tuning？还是需要设计中间的 fallback 层？
