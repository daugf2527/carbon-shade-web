---
name: dnf-physics-extraction
allowed-tools: Bash, Read, Grep, Glob, Edit, Write
model: sonnet
description: "从 DNF 客户端 PVF 提取战斗物理真值（重力/跳跃/launch/knockback/...），按三级置信度铁律落档"
---

# DNF Physics Extraction Skill

系统性从 `Script.pvf` + `ImagePacks2` 提取 DNF 战斗物理真值（跳跃、重力、launch velocity、knockback、状态参数等），按 [CLAUDE.md 三级置信度铁律](../../../CLAUDE.md#dnfdfo-reference-truth-rule) 输出可落档的研究文档 + 项目数据层。

## 何时使用

需要还原 DNF 任意战斗机制的真值参数时调用。涵盖：
- 跳跃曲线（v0 / gravity / 上升下降帧）
- 受击物理（launch / knockback / 重力修正）
- 技能位移（zVelocity 调用样本）
- 职业差异参数对比（.chr 跨职业表）

## 前置条件

- `tools/dnf-extract.exe` 编译可用（commit ≥ 99432ae，含 .nut/binary dispatch + bounds 保护）
- `Script.pvf` 路径已知（典型：`D:/BaiduNetdiskDownload/DNF客户端（2018年2月更新）/地下城与勇士/Script.pvf`）
- cwd = 项目根（`D:\carbon-shade-web`）
- Python 3 + jq（可选）可用

## 工作流

### Step 1 · 列出待提取的 .nut 索引

```bash
mkdir -p .tmp/dnf-research
tools/dnf-extract.exe --pvf "$PVF" --list --filter "sqr/" 2>/dev/null \
  > .tmp/dnf-research/sqr-index.json
```

按子目录分组：用 Python `collections.Counter` + 路径 split 看哪些职业 / 哪些子系统的 .nut 多。

**经验**：旧职业（swordman / fighter）通常**没有自定义 .nut**，物理走引擎默认；新职业（atmage / creatormage / priest）有大量 .nut 自定义。**关键 API 调用样本在新职业的 .nut 里**。

### Step 2 · 批量提取关键 .nut 到本地

四类必提：

1. **顶层通用**：`sqr/common.nut`、`sqr/init_character.nut`、`sqr/loadstate.nut`、`sqr/dnf_enum_header.nut`（最核心，含所有物理常数）
2. **通用 character**：`sqr/character/common/common_header.nut`、`sqr/character/common_load_state.nut`、`sqr/character/*_load_state.nut`
3. **新职业 header + common**：`sqr/character/<job>/<job>_header.nut`、`<job>_common.nut`
4. **任何 jumpattack / pushout / launch 相关脚本**：grep 路径 `jumpattack|pushout|launch|elementalrain|magiccannon|multishot|fastmove`

```bash
echo "quit" | cat targets.txt - | tools/dnf-extract.exe --pvf "$PVF" --pipe \
  2>/dev/null > .tmp/dnf-research/nut-dump.jsonl
```

用 Python 把 JSONL split 成单文件方便 grep：

```python
for chunk in content.split('\n---\n'):
    d = json.loads(chunk.strip())
    if d['type'] == 'text':
        open(f".tmp/dnf-research/nut/{d['path'].replace('/','_')}", 'w', encoding='utf-8').write(d['content'])
```

### Step 3 · grep 物理 API 调用

```bash
cd .tmp/dnf-research/nut

# 列出所有 sq_*Velocity / sq_*Speed / sq_*Force / sq_*Power API
grep -ohE "sq_[A-Z][A-Za-z]*(Velocity|Speed|Force|Power|Push|Jump|Z[A-Z]|Gravity)[A-Za-z]*" *.nut | sort -u

# 关键 API 调用上下文（带 -B 2 -A 1 看参数语义）
grep -B 2 -A 1 "sq_SetZVelocity\b" *.nut
grep -B 1 -A 1 "sq_SetCurrentAttacknUpForce\|sq_SetCurrentAttacknBackForce" *.nut
grep -B 2 -A 1 "sq_JumpUpStartFrame\|sq_JumpDownStartFrame\|sq_JumpLandStartFrame" *.nut
```

**核心 API 表**（记住这几个，遇到对应字段就直接用）：

| API | 第一参数语义 | 第二参数语义 | 单位 |
|-----|------------|-------------|------|
| `sq_SetZVelocity(obj, v0, accel)` | initial Z velocity | Z acceleration | (px/s, px/s²) |
| `sq_SetVelocity(obj, axis, value)` | axis 0=X, 1=Y(depth), 2=Z(height) | velocity | px/s |
| `sq_SetCurrentAttacknUpForce(atk, F)` | launch upward velocity | - | px/s |
| `sq_SetCurrentAttacknBackForce(atk, F)` | knockback X velocity | - | px/s |
| `sq_SetAttackInfoForceHitStunTime(atk, T)` | hitstun duration | - | frames (60 Hz) |
| `sq_JumpUpStartFrame(N)` | 上升起始动画帧 | - | frame index |
| `sq_JumpDownStartFrame(N)` | 下降起始动画帧 | - | frame index |
| `sq_JumpLandStartFrame(N)` | 落地起始动画帧 | - | frame index |

### Step 4 · 物理常数 closure 检查

提 `sqr/dnf_enum_header.nut` 找以下宏（韩文注释直接给出单位语义）：

| 宏 | 必查的注释关键词 |
|------|----------------|
| `DEFAULT_GRAVITY_ACCEL` | "중력 가속도"（重力加速度） |
| `X_NORMALMOVE_VELOCITY` / `Y_NORMALMOVE_VELOCITY` | "1초동안 이동 픽셀 수"（1 秒像素数）→ **铁证单位是 px/s** |
| `FORCE_TO_VELOCITY_CONST` | "속도 = 상수 \* 힘 / 무게" → 速度公式 |
| `SPEED_VALUE_DEFAULT` | "1000 = 100%" |
| `LIGHT/MIDDLE_OBJECT_MAX_WEIGHT` | "효과음" → 仅音效用 |

### Step 5 · 跨职业 .chr 对比

```bash
tools/dnf-extract.exe --pvf "$PVF" --batch \
  "character/swordman/swordman.chr" \
  "character/swordman/demonicswordman.chr" \
  "character/gunner/gunner.chr" "character/gunner/atgunner.chr" \
  "character/priest/priest.chr" \
  "character/fighter/fighter.chr" "character/fighter/atfighter.chr" \
  "character/mage/mage.chr" "character/mage/atmage.chr" "character/mage/creatormage.chr" \
  "character/thief/thief.chr" \
  2>/dev/null > .tmp/dnf-research/all-chr.jsonl
```

11 个职业。**.chr 里 IEEE 754 float 是整数表示**：
```python
import struct
def f32(s):
    i = int(s)
    return struct.unpack('<f', struct.pack('<I', i))[0]
# e.g. "1138163712" → 430.0 (jump_power)
```

关键字段：`jump power` / `jump speed` / `move speed` / `attack speed` / `weight` / `mp regen speed` / `hit recovery`。

### Step 6 · 提取 .atk 攻击参数

`.atk` 文件里 `[lift up]` 字段是 launch velocity（传给 `sq_SetCurrentAttacknUpForce`），单位 px/s。

```bash
tools/dnf-extract.exe --pvf "$PVF" --batch \
  "character/<job>/attackinfo/attack1.atk" \
  "character/<job>/attackinfo/attack2.atk" \
  "character/<job>/attackinfo/attack3.atk" \
  "character/<job>/attackinfo/jumpattack.atk" \
  "character/<job>/attackinfo/hitback.atk" \
  "character/<job>/attackinfo/hardattack.atk" \
  ...
```

字段 `lift up` 值范围观察：普攻 75-90 px/s，强击 / 第 3 段 300 px/s，重击 220 px/s。

### Step 7 · 落档

写两个产出：

1. **研究文档** `docs/research/YYYY-MM-DD-dnf-<topic>-extraction.md`
   - 已锁定真值表 + 单位 + 来源（PVF 路径）
   - DNF 引擎 API 表（如本 skill 步骤 3 那张表）
   - 跨职业对比 / 跨技能对比表
   - 未 closure 项 + 多 hypothesis 对比
   - 下一步建议
2. **项目数据层**（可选，若进入实施阶段）：扩 `src/data/official/`，每个数值标 `sourceProvenance.source: "pvf:<full-path>"` + `confidence: "high"|"medium"|"low"`。Tier 3 待定值必须 `requiresManualVerification: true`。

## 常见坑

1. **cwd 滑动**：长 bash 链 `cd .tmp/...` 后下一次相对路径会失败 — 用绝对路径或末尾 `cd /d/carbon-shade-web` 复位
2. **.tmp/ 被清理**：pre-push hook 跑 `npm run analyze` 重建 `.tmp/test-js/` 可能清相邻产物 — 提取产物归档到 `docs/research/` 表格，别只放 `.tmp/`
3. **.chr 里 float 是整数**：用 `struct.unpack('<f', struct.pack('<I', N))[0]` 解码（IEEE 754 little-endian）
4. **韩文注释**：路径有韩文不会乱码（UTF-8）；注释关键词：`중력=重力`, `힘=force`, `무게=weight`, `속도=speed`, `점프=jump`, `픽셀=pixel`, `초=second`
5. **swordman 没有自己的 .nut**：旧职业全走引擎默认；要看 API 用法去 atmage/creatormage/priest 的 .nut

## 三级置信度铁律应用

按 [CLAUDE.md 三级铁律](../../../CLAUDE.md#dnfdfo-reference-truth-rule)：

- **Tier 1**：dnf-extract 提取的 PVF 数据（含韩文注释明示单位）— `confidence: "high"`
- **Tier 2**：DFO World Wiki / NamuWiki / Neople API 数据 — `confidence: "medium"`
- **Tier 3**：项目内 baseline / 反推 hypothesis / 社区反编译 — `confidence: "low"` + `requiresManualVerification: true`

**禁止**反向覆盖：低优先级证据不能否决高优先级。Tier 3 的 hypothesis 必须明示是工作假设而非真值。

## 已验证的真值清单（截止 2026-05-21）

详见 `docs/research/2026-05-21-dnf-air-physics-phase1.md`。

关键发现速查：
- `DEFAULT_GRAVITY_ACCEL = -1500 px/s²` ✓ Tier 1
- 11 职业 jump_power（350-500）已落表 ✓ value Tier 1, unit Tier 3
- 速度统一单位 px/s（铁证多个 API 验证）✓
- 项目内 Vec3 `y` vs `z` 命名跟 DNF 原生反了（DNF z=height, y=depth）

## 检查清单

- [ ] PVF 路径 / `dnf-extract.exe` 工作
- [ ] sqr/ 索引拿到（193 个 .nut 全部）
- [ ] 关键 .nut 全提（顶层 + common + 新职业）
- [ ] `dnf_enum_header.nut` 全文已看，所有物理宏单位 closure
- [ ] 至少 1 个 `sq_SetZVelocity` 调用样本反推过 peak height
- [ ] 11 职业 .chr 对比表完成
- [ ] 重点攻击 .atk 提取（`lift up` 等字段）
- [ ] 单位 closure 矩阵（哪些铁证 / 哪些待定）写入研究文档
- [ ] H1/H2 hypothesis 列出，证伪条件明示
- [ ] `sourceProvenance` 标注准则在文档里明确
