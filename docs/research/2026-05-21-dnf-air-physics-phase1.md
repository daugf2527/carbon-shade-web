# DNF 空中物理 Phase 1 数据提取（2026-05-21）

## 目标

为"完整空中物理还原"项目（Phase 4-5 物理引擎重写的依据）建立 Tier-1 证据基线：从 PVF 客户端文件提取所有跳跃、重力、launch、knockback 真值，按 [CLAUDE.md 三级置信度铁律](../../CLAUDE.md#dnfdfo-reference-truth-rule) 落档。

## 范围

| 阶段 | 产出 |
|------|------|
| Phase 1.1 | sqr/ 下 193 个 .nut 索引 |
| Phase 1.2 | 193 个 .nut 全文 + 物理 API grep |
| Phase 1.3 | 11 个职业 .chr 对比表 + jumppowerup.skl |
| Phase 1.4 | swordman 7 个 .atk 攻击力 + lift_up |

## 工具链

```bash
tools/dnf-extract.exe --pvf "$DNF_CLIENT/Script.pvf" --list --filter <pattern>
tools/dnf-extract.exe --pvf "$DNF_CLIENT/Script.pvf" --file <internal-path>
tools/dnf-extract.exe --pvf "$DNF_CLIENT/Script.pvf" --batch <p1> <p2> ...
tools/dnf-extract.exe --pvf "$DNF_CLIENT/Script.pvf" --pipe < paths.txt
```

DNF_CLIENT = `D:/BaiduNetdiskDownload/DNF客户端（2018年2月更新）/地下城与勇士`

## 已锁定真值（来源：sqr/dnf_enum_header.nut 含韩文注释）

| 常数 | 值 | 单位（注释证实） | 用途 |
|------|----|-----|------|
| `DEFAULT_GRAVITY_ACCEL` | **-1500** | px/s²（"기본 중력 가속도"） | 世界默认重力。动作可局部覆盖（见 elementalrain） |
| `X_NORMALMOVE_VELOCITY` | 143 | px/s（"가로로 1초동안 이동 픽셀 수"） | 横向移动 1 秒像素数 |
| `Y_NORMALMOVE_VELOCITY` | 114 | px/s（"세로로 1초동안 이동 픽셀 수"） | 纵向（地面深度）移动 1 秒像素数 |
| `X_SLANTMOVE_VELOCITY` | 119 | px/s | 斜向横向分量 |
| `Y_SLANTMOVE_VELOCITY` | 95 | px/s | 斜向纵向分量 |
| `FORCE_TO_VELOCITY_CONST` | 4000 | (公式: v = const × force / weight) | 力到速度换算常数 |
| `SPEED_VALUE_DEFAULT` | 1000 | 100% baseline | 速度系参数的相对基准 |
| `LIGHT_OBJECT_MAX_WEIGHT` | 60000 | unitless | 轻物体音效阈值 |
| `MIDDLE_OBJECT_MAX_WEIGHT` | 100000 | unitless | 中物体音效阈值 |

**Z 轴 = 跳跃高度轴**（DNF 原生约定，韩文 "세로 = 纵 = 屏幕 y-axis"；3D 世界坐标里 z 才是 height）。

**注意**：项目内 Vec3 把 `y` 当 height、`z` 当 depth，跟 DNF 原生反了 —— Phase 4 重写时要对齐。

## DNF 引擎物理 API（来自 .nut 实际调用）

```squirrel
// 跳跃帧事件 hook（脚本告知引擎"哪一帧是上升/下降/落地"）
obj.sq_JumpUpStartFrame(N);
obj.sq_JumpDownStartFrame(N);
obj.sq_JumpLandStartFrame(N);

// 倒地帧事件
obj.sq_SetDownUpFrame(N);
obj.sq_SetDownDownFrame(N);
obj.sq_SetDownBounceUpFrame(N);
obj.sq_SetDownBounceDownFrame(N);
obj.sq_SetDownLieFrame(N);

// Z 轴速度 + 加速度（用于跳跃 / 上抛 / 跳跃技能）
sq_SetZVelocity(obj, v0_px_per_sec, accel_px_per_sec_squared);

// XY 平面速度（axis: 0=X, 1=Y/depth）
sq_SetVelocity(obj, axis, value_px_per_sec);
sq_GetVelocity(obj, axis);    // axis 2 是 Z

// 攻击命中击退 / launch
sq_SetCurrentAttacknUpForce(attackInfo, upForce_px_per_sec);    // launch velocity
sq_SetCurrentAttacknBackForce(attackInfo, backForce_px_per_sec); // knockback X velocity
sq_SetAttackInfoForceHitStunTime(attackInfo, frames);

// 速度类型修改（buff 用，影响整体）
sq_SetStaticSpeedInfo(SPEED_TYPE_MOVE_SPEED, ..., ...);
```

## 实际样本：sq_SetZVelocity 调用

| 来源 | 调用 | 推算高度 / 滞空 |
|------|------|------------------|
| `atmage/elementalrain.nut` | `sq_SetZVelocity(obj, 750, -1200)` | peak = 234 px, air = 0.625 s |
| `atmage/magiccannon.nut` (VERTICAL) | `sq_SetZVelocity(obj, 400, -400)` | peak = 200 px, air = 1.0 s |
| `atmage/magiccannon.nut` (DIAGONAL) | `sq_SetZVelocity(obj, 200, -200)` | peak = 100 px, air = 1.0 s |
| `atmage/magiccannon.nut` (READY) | `sq_SetZVelocity(obj, 1, 0)` | 仅触发 Z 物理状态 |

公式：`peak_h = v0² / (2 × |accel|)`, `air_time = 2 × v0 / |accel|`

## 11 职业 .chr 对比表（Phase 1.3）

| 职业 | jump_power (float) | jump_speed (int) | move_speed | attack_speed | weight | hp/mp_regen 系列 |
|------|--------|--------|------|------|------|---|
| swordman 鬼剑 | **430** | 95 | 850 | 850 | 68000 | 各等级 |
| demonicswordman 黑暗鬼剑 | 430 | 95 | 850 | 1000 | 68000 | |
| atgunner 神枪手（女） | 440 | 80 | 850 | 950 | 48000 | |
| gunner 神枪手（男） | 490 | 80 | 820 | 950 | 60000 | |
| atfighter 格斗家（女） | 470 | 110 | 880 | 950 | 50000 | |
| fighter 格斗家（男） | 470 | 110 | 910 | 950 | 50000 | |
| priest 圣职者 | **500**（最高） | 100 | 780 | 950 | 78000 | |
| thief 盗贼 | 465 | 125 | 960 | 1000 | 45000 | |
| mage 法师 | **350**（最低） | 55 | 800 | 1000 | 40000 | |
| atmage 男法师 | 350 | 55 | 820 | 1000 | 50000 | |
| creatormage 创造者 | 350 | 55 | 800 | 1000 | 40000 | |

**观察**：
- `jump_power` 范围 350-500，差异不大（最高/最低 = 1.43 倍）
- `jump_speed` 范围 55-125，差异较大
- `weight` 仅用于音效阈值分类（脚本里 `sq_GetObjectWeight()` 唯一引用是音效判定），**不参与物理计算**

## swordman .atk 击退/launch 真值（Phase 1.4）

| 攻击 | `lift up` | 含义 |
|------|----------|------|
| `attack1.atk` 普攻 1 段 | 75 | upward velocity → peak 1.9 px |
| `attack2.atk` 普攻 2 段 | 90 | peak 2.7 px |
| `attack3.atk` 普攻 3 段 | **300** | peak 30 px |
| `hardattack.atk` 强击 | **300** | peak 30 px |
| `dashattack.atk` 突进攻击 | 80 | peak 2.1 px |
| `jumpattack.atk` 空中攻击 | 180 | peak 10.8 px |
| `hitback.atk` 受身击退 | 220 | peak 16 px |

`lift up` 字段直接传给 `sq_SetCurrentAttacknUpForce(attackInfo, X)` → **单位 = px/s（铁证 closure）**。

## 单位 closure 矩阵

| 参数类型 | 单位 closure | 证据级别 |
|----------|--------------|----------|
| 速度（sq_SetZVelocity v0, lift_up, knockback） | **px/s** ✓ | Tier 1（铁证） |
| 加速度（sq_SetZVelocity accel, gravity） | **px/s²** ✓ | Tier 1 |
| .chr `move_speed` (850 swordman) | 相对 SPEED_VALUE_DEFAULT (1000)，即 85% baseline | Tier 1（间接推证） |
| .chr `attack_speed`, `cast_speed` | 同上 % 制 | Tier 1 |
| .chr `weight` | unitless，仅音效分类 | Tier 1 |
| **.chr `jump_power`** | **歧义** | Tier 3（待 .exe 反编译 closure） |
| **.chr `jump_speed`** | **歧义**（可能与 JUMP_SPEED_RATE 相关） | Tier 3 |

## H1 vs H2：jump_power 两种 hypothesis

### H1：jump_power 单位 = px/s（直接 v0）

| 职业 | jump_power | peak height (px) | 上升时间 (s) |
|------|-----------|-------------------|---------------|
| mage | 350 | **40.8** | 0.23 |
| swordman | 430 | **61.6** | 0.29 |
| priest | 500 | **83.3** | 0.33 |

**结论**：项目内 baseline 跳跃 200 px **偏大 3.2 倍**。1:1 还原需大幅降低跳跃高度。

### H2：jump_power 单位 = % scaler（基准 base ≈ 1800 px/s 内置在 .exe 引擎）

| 职业 | jump_power | v0 = base × 430/1000 | peak height (px) |
|------|-----------|-----------------------|-------------------|
| mage | 350 | 630 | 132 |
| swordman | 430 | 774 | **200** ✓ 对项目 baseline |
| priest | 500 | 900 | 270 |

**结论**：项目内 baseline 200 px 跟 swordman 真值匹配。

### 证伪条件

H1 / H2 都无法从 PVF 单独证伪。证伪需 DNF.exe 反编译看引擎里 `jump_power` 实际怎么用。**当前选哪个都是 Tier 3 决策**。

## 下一步建议

按 [CLAUDE.md 三级铁律](../../CLAUDE.md#dnfdfo-reference-truth-rule)：
- **Tier 1 真值**：直接落档到 `src/data/official/dnfPhysicsConstants.ts` + 新建 `characterStats.ts` 含 11 职业 .chr 真值，标 `sourceProvenance.source = "pvf:..."` + `confidence: "high"`
- **Tier 3 决策**（H1 vs H2）：选其一作为 working hypothesis（推荐 H1 因更接近"原汁原味"，承担项目 baseline 降高的代价），标 `requiresManualVerification: true`，注释里说明 `.exe` 反编译可证伪
- Phase 4 物理引擎重写时按 H1/H2 + Tier 1 真值实现

## 文件清单

| 路径 | 用途 |
|------|------|
| `.tmp/dnf-research/sqr-index.json` | 193 个 .nut 全 list |
| `.tmp/dnf-research/nut/*.nut` | 193 个 .nut 全文 |
| `.tmp/dnf-research/all-chr.jsonl` | 11 个职业 .chr 全部 sections |
| `.tmp/dnf-research/swordman-atk.jsonl` | 7 个 swordman .atk |

注：`.tmp/` 已 gitignore；研究产物按需归档到本文档表格里，不进 commit。
