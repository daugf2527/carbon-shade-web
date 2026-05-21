# Phase 3 Data Layer Design — DNF Truth Base（2026-05-21）

落档 [Combat Lab DNF alignment pivot](2026-05-21-dnf-alignment-pivot.md) 的 Phase 3 数据层设计。本期**只落档，不接 runtime**；Phase 4 物理引擎重写时才消费。

## 1. 目录结构

```
src/data/official/dnf/
├── physics.ts      # DNF 引擎物理常数 + API map + 坐标系约定
├── characters.ts   # 11 职业 .chr 真值（RAW + H1 derived）
├── attacks.ts      # swordman .atk 真值（RAW + 纯算术 derived）
└── index.ts        # barrel re-export
```

测试：`tests/static/dnf-official-data.test.ts`

兼容性：现有 `src/data/official/dnfPhysicsConstants.ts` 保留作为 Phase A-D 历史层，**不删**；新字段统一进 `dnf/physics.ts`。Phase 4 物理引擎只 import `dnf/index.ts`。

## 2. Schema 扩展

`src/data/manifest/schema.ts` 加新 `sourceType: "pvf_extraction"`：

- `pvf_extraction` → Tier-1，默认允许进 runtime（与 `official_api` / `dfo_wiki` 同档）
- `experimental` → Tier-3 hypothesis 用（H1 / H2 等），runtimeBlocked

`src/combat/types.ts` 同步 Provenance 类型 union 加 `"pvf_extraction"`。

## 3. 数据结构约定

### 三元组 schema

每个数值字段 = `{value, unit, provenance}`：

```typescript
{
  value: number,
  unit: "px/s" | "px/s^2" | "px" | "frame" | "%×SPEED_VALUE_DEFAULT"
      | "audio-only" | "ambiguous" | ...,
  provenance: Provenance,
}
```

- `unit` 字符串明示语义，`"ambiguous"` 表示 Tier-3 待定
- `provenance.sourceRef` 必须含完整 PVF 路径（如 `pvf:character/swordman/swordman.chr`）

### RAW vs DERIVED 区段

- **RAW**: 直接来自 PVF 文件的字段，`sourceType: "pvf_extraction"`，`confidence: "high"`
- **DERIVED** 分两种：
  - **纯算术 derived**（单位无歧义）：仍标 `pvf_extraction`，可进 runtime。例：`peakHeight = v0² / (2 × |g|)` 用铁证常数
  - **假设性 derived**（单位歧义）：标 `experimental` + `requiresManualVerification: true` + `hypothesis` + `falsifiableBy` 字段，runtimeBlocked

## 4. 实施清单

1. 改 `src/combat/types.ts` Provenance union 加 `"pvf_extraction"`
2. 改 `src/data/manifest/schema.ts` allowedSourceTypes 加 `"pvf_extraction"`
3. 写 `src/data/official/dnf/physics.ts` — 5 个物理常数 + axis convention
4. 写 `src/data/official/dnf/characters.ts` — 11 职业 RAW + H1 DERIVED
5. 写 `src/data/official/dnf/attacks.ts` — swordman 7 个 RAW + 4 个 peakHeight DERIVED
6. 写 `src/data/official/dnf/index.ts` — barrel
7. 写 `tests/static/dnf-official-data.test.ts` — 5 类断言
8. 跑 `npm run typecheck` + `npm run static:test` 全绿

## 5. 验证标准

- typecheck 通过（不破坏现有 runtime，dnf/ 目录无人引用）
- 新测试 `dnf-official-data.test.ts` 通过：完整性 / 三元组 schema / Tier 标记 / 物理算术一致性
- 现有 41 个 static test 仍全绿
- 提交单独 commit，标题 `Phase 3: add DNF truth-base data layer (no runtime consumers)`

## 6. 后续衔接

- Phase 4 物理引擎重写时：`import { DNF_PHYSICS_RAW, DNF_JUMP_DERIVED_H1, SWORDMAN_ATK_RAW } from "src/data/official/dnf"` —— 显式声明用 H1 derived（experimental），意味着代码 review 时一眼看出"这里在用工作假设而非铁证"
- 未来 .exe 反编译可证伪 H1 → 删 `DNF_JUMP_DERIVED_H1` 全部 entry，换成 `DNF_JUMP_DERIVED_PROVEN`（sourceType 升级 `pvf_extraction`）
- 其他职业 .atk 提取：复用 `SWORDMAN_ATK_PROV` 工厂函数 + `/dnf-physics-extraction` skill 拉数据
