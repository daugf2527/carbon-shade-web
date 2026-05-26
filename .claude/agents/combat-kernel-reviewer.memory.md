# Combat Kernel Reviewer Memory

> Subagent memory file (v2.1.33+ auto-loaded).
> 提炼自 `combat-kernel-reviewer.md` + 项目 hook 守卫 + 历史 review 经验。

## Invariants (硬规则,违反必报红)

### 1. Phaser-isolation 边界
- `src/combat/` 中**绝对不允许** `import * from 'phaser'` 或 `from '../game/...'`
- 战斗内核 = 纯 TypeScript + `src/data/` + Node built-in；Phaser 只在 `src/game/` 渲染层
- hook 守卫：`.claude/hooks/guard-phaser-boundary.mjs` 已在 PreToolUse 拦
- 违规模式：`import { Scene } from 'phaser'` / `import { Sprite } from '../game/render/Sprite'`

### 2. Velocity 写入白名单
只有这 4 个文件可以写 `.velocity.x` / `.velocity.y` / `.velocity.z`：
- `src/combat/actors/ActorFactory.ts`（初始化）
- `src/combat/kernel/CombatKernel.ts`（物理更新）
- `src/combat/reaction/ReactionResolver.ts`（击退 / 浮空）
- `src/combat/ai/EnemyAI.ts`（AI 移动）

任何其它文件写入 velocity → 红牌。hook 守卫：`.claude/hooks/guard-velocity-writes.mjs`。

### 3. Replay determinism
内核所有 tick 内调用必须确定性：
- 禁 `Math.random()` → 用 deterministic seed 替代
- 禁 `Date.now()` / `performance.now()` → tick counter 推进
- 禁 `setTimeout` / `setInterval` → frame-based timer
- `Map` / `Set` 迭代必须排序（除非业务上不依赖顺序，标 comment 说明）
- replay golden hash 在 `tests/static/replay-hash.test.ts`；改动若破 parity，必须明示且重 seed

### 4. Frame-data provenance 完整性
新增或修改 `FrameDataAction` 必须包含：
- `fieldProvenance` — 每字段来源标注
- `sourcePolicy` — 来源策略
- 数据来自 PVF 提取标 `pvf_extraction` + extractor version + source pvf hash
- 标 `local_baseline` 的字段必须同时标 `requiresManualVerification: true`

参考 `CLAUDE.md` "DNF/DFO reference truth rule" 三级置信度铁律。

### 5. 类型安全
- 不 `any`（除非有 inline 注释说明原因）
- `FrameDataAction` 访问需 double-cast：`action as unknown as Record<string, unknown>`
- `ActionName` 联合类型与实际注册一致（不漂移）

## Common diff anti-patterns (review 时高优先盯)

### 隐式破内核纯净性
- **`import phaser` 出现在 src/combat/** → 必报，建议把 Phaser 类型抽到 `src/game/types/` 重新映射
- **新 helper 文件没分 combat / game** → 看是否引用 Phaser/DOM；如有应放 `src/game/`
- **动态 `require()`** → 内核不允许动态 import；改成静态 import

### 隐式破 determinism
- **`Array.from(set)` / `Object.keys(map)`** 没排序就遍历 → 加 `.sort()` 或注释说明顺序无关
- **`Math.random` 替换为 PRNG 但 seed 未持久化** → seed 必须进 replay snapshot
- **`async / await` 在 tick 内** → 内核 tick 必须同步；async 必须出现在外层 boundary

### 隐式破 provenance
- **新字段加在 FrameDataAction 但无 fieldProvenance** → 必报
- **`sourceType: 'local_baseline'` 但 `requiresManualVerification` 漏标** → 必报
- **`extractorVersion` / `sourcePvfHash` 被 hardcode 写死** → 必报；它们应该从 extractor 返回值动态取

### 隐式破 cancel policy
- **negative `whiffCancelFrom` 被改成 0+** → 它是 intentional sentinel "can never whiff cancel"，不要修
- **cancel window 的 start/duration 来自 .skl extract**，不要手填

## Patterns to flag (灰区,要 ask)

- 新 RNG 用法 → 问"是否会进 replay？如何 seed？"
- 新 effect / status 没 frame-data → 问"是否准备走 manifest 还是临时硬编码？"
- 6-int replay snapshot 字段被改 → 问"是否更新了 `replay-schema.test.ts` 的 golden hash？"
- `tools/dnf-extract.exe` 跨平台路径 → 看是否兼容 aarch64 Android binary 命名差异

## Review 输出格式

```
## 审查结果

✅ 通过 / ⚠️ 警告 / ❌ 违规

### 关键发现
1. [文件:行号] 问题描述
   - 违反 invariant: <X>
   - 建议: <Y>

### 灰区 (需 ask)
1. ...

### Provenance check
- 新增字段 N 个，全部带 fieldProvenance: yes/no
- sourceType 标 local_baseline 但缺 requiresManualVerification: yes/no
```
