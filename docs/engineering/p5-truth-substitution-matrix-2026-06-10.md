# P5 Truth Substitution Matrix (2026-06-10)

依据 [docs/planning/2026-06-04-engine-native-rewrite-roadmap.md](../planning/2026-06-04-engine-native-rewrite-roadmap.md)，P5 的硬门槛不是“有一些 engine 测试”，而是：

- `tests/truth/` 不再把关键真值守在 `src/combat/*`
- engine 已经吃到 Stage 3 的真值链路
- `src/combat/` 删除前，truth gate 可以完全站在 engine 侧

## 矩阵

| truth gate | 当前绑定对象 | 已有 engine 替身 | 状态 | 下一步迁移 |
|---|---|---|---|---|
| `tests/truth/reaction-routing.test.ts` | `src/engine/core/ReactionResolver.ts` | 同文件（engine routing-only truth） | 已迁移 | 继续让它守 engine `routeFromHitReaction` / `applyArmorToKind`，不再计入 combat truth blocker |
| `tests/truth/reaction-velocity.test.ts` | `src/combat/reaction/ReactionResolver.ts` | `tests/truth/engine-reaction-truth.test.ts` | 部分覆盖 | 把 velocity 断言迁到 engine `applyHitReaction` / `KnockbackPhysics` 组合路径 |
| `tests/truth/swordman-attack1-truth.test.ts` | `src/combat/kernel/CombatKernel.ts` | `tests/truth/engine-damage-truth.test.ts` | 缺完整替身 | 需要一个 engine 侧 attack1 端到端 truth，用 EngineKernel 或更小闭环替代 CombatKernel |
| `tests/truth/swordman-reaction-formulas.test.ts` | `src/combat/kernel/CombatKernel.ts` | `tests/truth/engine-reaction-truth.test.ts` | 缺完整替身 | 需要 engine 侧“动作→命中→reaction kind” truth 闭环，覆盖 attack1 / attack3 / dashattack |

## 已有 engine truth

| engine truth | 覆盖内容 | 对 P5 的价值 |
|---|---|---|
| `tests/truth/engine-reaction-truth.test.ts` | engine `ReactionResolver` 的 kind / vy / liftUp / weaponLaunch | 说明 reaction 真值已经开始脱离 combat，但还没覆盖 action 级链路 |
| `tests/truth/engine-damage-truth.test.ts` | engine `DamageFormula` 的 atkBonus / damageScalePct | 说明伤害真值已有独立守卫，但还没替代 attack1 端到端 |
| `tests/truth/hit-resolution-weapon-timeline.test.ts` | engine `weaponTimelineFlattener` + `AnimationPlayer` weaponTimeline merge | 说明 dual-timeline / weapon hitbox truth 已经站到 engine 入口，不再依赖 combat type |

## 结论

1. 当前 4 个重点 truth gate 里，`reaction-routing.test.ts` 已经迁到 engine，剩余 3 个仍绑 `src/combat/*`。
2. 最危险缺口不是单点公式，而是 `CombatKernel` 端到端 truth 还没被 engine 闭环接住。
3. 下一批优先顺序应是：
   - `reaction-velocity.test.ts`
   - `swordman-reaction-formulas.test.ts`
   - `swordman-attack1-truth.test.ts`

## 与退役审计的关系

- `docs/engineering/combat-retirement-audit-2026-06-10.md` 解决“还有哪些 blocker”。
- 本文档解决“4 个 truth blocker 里，哪些已经有 engine 替身，哪些没有”。
- 两份一起看，才能安排 `src/combat/` 退役的下一批可执行工作。
