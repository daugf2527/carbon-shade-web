---
name: add-action
allowed-tools: Read, Grep, Glob, Edit, Write
model: sonnet
description: "引导添加新的 FrameDataAction，确保 provenance、hitbox、reaction、cancel policy 完整"
---

# Add Action Skill

引导在战斗系统中添加新的 FrameDataAction，确保所有必需字段和 provenance 追踪完整。

## 使用方式

`/add-action <ActionName>` — 例如 `/add-action GoreCross`

## 工作流程

### Step 1: 确认 Action 基本信息

收集以下信息（如果用户未提供则询问）：
- **ActionName**: 技能名称（必须添加到 `src/combat/types.ts` 的 `ActionName` 联合类型）
- **totalFrames**: 总帧数
- **数据来源**: `local_baseline` / `pvf_extraction` / `neople_api` / `dfo_world_wiki`
- **技能类型**: 普攻链 / 主动技能 / 被动触发 / 移动技能

### Step 2: 定义 Hitbox

每个 hitbox 需要：
```typescript
hit(id, start, end, hitGroupId, baseDamage, {
  hitType: "slash" | "shockwave" | "blood_pillar" | "grab",
  offsetX, offsetZ, offsetY,  // 相对角色位置
  w, d, h,                     // 碰撞体积
  canHitDowned, canLaunch, canKnockdown,
  maxTargets,
  reactionProfile              // 击中反应
})
```

### Step 3: 定义 Reaction Profile

```typescript
reaction({
  hitStunFrames,    // 硬直帧数
  knockbackX,      // X轴击退
  knockbackZ,      // Z轴击退
  launchVelocityY, // 浮空速度 (可选)
  horizontalFriction,
  downFrames,      // 倒地帧数 (0=不倒地)
  getUpFrames      // 起身帧数
})
```

### Step 4: 定义 Cancel Policy

```typescript
cancelPolicy: {
  hitCancelFrom: number,      // 命中后可取消的帧
  whiffCancelFrom: number,    // 空挥可取消的帧 (负数=永不)
  into: combatCancelTargets   // 可取消到的目标动作列表
}
```

### Step 5: Root Motion（可选）

```typescript
rootMotion: { frames: lunge([frameNumbers], dx, dz) }
```

### Step 6: 注册 Action

1. 在 `src/combat/types.ts` 的 `ActionName` 类型中添加新名称
2. 在 `src/combat/actions/FrameDataAction.ts` 中定义完整 action
3. 在 `src/data/actions/` 对应文件中注册到 manifest
4. 确保 `fieldProvenance` 使用正确的 provenance 函数

### Step 7: 验证

运行：
```bash
npm run typecheck && npm run static:test
```

## 检查清单

- [ ] `ActionName` 联合类型已更新
- [ ] `fieldProvenance` 所有字段已标注来源
- [ ] `sourcePolicy` 已声明
- [ ] hitbox 的 `hitGroupId` 唯一且有意义
- [ ] reaction profile 数值在合理范围内（参考 tuning-baseline.md）
- [ ] cancel window 逻辑正确（hitCancelFrom ≤ totalFrames）
- [ ] 如果有 rootMotion，帧号在 startup 范围内
- [ ] typecheck 通过
- [ ] 相关测试通过

## 参考数值范围（DNF 70-85 classic）

| 参数 | 轻攻击 | 中攻击 | 重攻击 |
|------|--------|--------|--------|
| hitStunFrames | 10-13 | 15-18 | 20-25 |
| knockbackX | 3-5 | 5-8 | 8-12 |
| baseDamage | 8-12 | 12-18 | 18-30 |
| totalFrames | 24-30 | 30-45 | 45-70 |
