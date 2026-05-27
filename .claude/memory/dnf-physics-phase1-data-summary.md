---
name: dnf-physics-phase1-data-summary
description: "Phase 1 DNF 物理真值速查 - 重力/速度/API/11 职业 .chr/launch 数值, 含单位 closure 状态"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 66c27168-90a9-45b8-9478-977f04f83d04
---

# DNF 物理真值速查（2026-05-21 Phase 1 提取）

完整研究: `docs/research/2026-05-21-dnf-air-physics-phase1.md`

## 已 closure 真值 (Tier-1)

| 常数 | 值 | 单位 | 来源 |
|------|-----|------|------|
| DEFAULT_GRAVITY_ACCEL | -1500 | **px/s²** | sqr/dnf_enum_header.nut (韩文注释) |
| X_NORMALMOVE_VELOCITY | 143 | px/s 横向 | 同上 |
| Y_NORMALMOVE_VELOCITY | 114 | px/s 纵向(地面深度) | 同上 |
| FORCE_TO_VELOCITY_CONST | 4000 | v = const × force / weight | 同上 |
| SPEED_VALUE_DEFAULT | 1000 | 100% baseline | 同上 |

**所有速度类参数统一 px/s, 加速度统一 px/s²** (sq_SetZVelocity 实际样本 750/-1200 → peak 234px 验证)

## DNF 物理 API

```squirrel
sq_SetZVelocity(obj, v0_px_s, accel_px_s2)      // 跳跃 / 上抛
sq_SetVelocity(obj, axis, value_px_s)            // axis 0=X(水平), 1=Y(地面深度), 2=Z(高度)
sq_SetCurrentAttacknUpForce(atk, F_px_s)         // launch velocity
sq_SetCurrentAttacknBackForce(atk, F_px_s)       // knockback X velocity
sq_JumpUpStartFrame(N)/sq_JumpDownStartFrame(N)/sq_JumpLandStartFrame(N)  // 跳跃阶段帧事件 hook
```

## 11 职业 .chr 速查 (jump_power / jump_speed / move_speed / weight)

| 职业 | jump_power | jump_speed | move_speed | weight |
|------|-----------|------------|------------|--------|
| mage/atmage/creatormage | **350**(最低) | 55 | 800-820 | 40-50K |
| swordman/demonicswordman | 430 | 95 | 850 | 68000 |
| atgunner | 440 | 80 | 850 | 48000 |
| thief | 465 | 125 | 960 | 45000 |
| fighter/atfighter | 470 | 110 | 880-910 | 50000 |
| gunner | 490 | 80 | 820 | 60000 |
| priest | **500**(最高) | 100 | 780 | 78000 |

**jump_power 单位歧义** (Tier-3): H1 px/s → peak 62px / H2 % scaler → peak 200px. 采用 H1 作工作假设。

## swordman 攻击 lift_up (launch velocity, px/s)

- attack1 (普攻 1 段) = 75
- attack2 (普攻 2 段) = 90
- attack3 (普攻 3 段) = **300** → peak 30px, 浮空 0.4s
- hardattack (强击) = 300
- jumpattack (空中攻击) = 180
- dashattack (突进) = 80
- hitback (受身击退) = 220

## 坐标系约定

DNF 原生: **x=水平, y=地面深度, z=高度(跳跃轴)**
项目内 Vec3 `{x, z, y}`: **x=水平, z=地面深度, y=高度** — **跟 DNF 反了**, Phase 4 重写时决定怎么处理
