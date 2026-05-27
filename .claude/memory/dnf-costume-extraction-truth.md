---
name: dnf-costume-extraction-truth
description: DNF 时装提取的真相 — 正确数据源路径、500×500 画布对齐公式、Mode 2 验证通过 (stay 完美复刻 2026-05-20)
metadata: 
  node_type: memory
  type: project
  originSessionId: 954e3d71-db1b-432f-ae9a-eb9604cae232
---

# DNF 时装提取的真相（stay 完美复刻 2026-05-20）

## 三条核心规则

### 1. 数据源路径

时装数据在 `equipment/character/<job>/avatar/{layer}/{layer}_<style>/<action>.ani`，**不是** `character/<job>/equipment/avatar/{layer}/sg_*.img`。

| 错路径 | 对路径 |
|---|---|
| `character/swordman/equipment/avatar/coat/sg_coat0000a.img` | `equipment/character/swordman/avatar/coat/coat_a/stay.ani` |
| 道具图标/特效图（ARGB_1555 + 灰底） | 真时装动画（ARGB_8888 + 配套 imgParam） |

**信号识别**：抽出来是 ARGB_1555 + 强制不透明 + imgAnchor.y 偏离 body 100+px → **路径错了，不是公式错了**。

### 2. 提取流程

从 `.ani` 文件入手，**永远不要直接抽 .img**：

```
.ani 文件 → 每帧含 sprite 模板 + imgParam (atlas frame index)
sprite 模板形如 "character/swordman/equipment/avatar/coat/sm_coat%02d%02da.img"
%02d%02d → 替换为 4 位款式编号（默认 0000）
最后调 dnf-extract --resolve <expanded> --frame <imgParam>
```

.ani 里所有装备的 `aniOffset (-232, -333)` 和 `imgParam (90-95)` 与 body 完全一致 — **这是设计上保证装备能覆盖 body 的同一帧**。

### 3. 对齐公式（500×500 画布 / DnfLayeredSprite Mode 2）

```js
feetX = -body.aniOffset.x        // 232，脚在画布的 x 位置
feetY = -body.aniOffset.y        // 333
sprite.setOrigin(0, 0)
sprite.setPosition(layer.imgAnchor.x - feetX, layer.imgAnchor.y - feetY)
```

- imgAnchor 是 sprite **左上角**在 500×500 共享画布上的绝对坐标
- 所有层用 **body 的** aniOffset（不是各层自己的，虽然碰巧一样）

## Z 序

`body → shoes_a → pants_a → coat_a → hair_a`（脚→腿→身→头，从底到顶）

## 解剖学验证 (stay frame 0, body imgAnchor=(200, 233), 64×106)

| 层 | imgAnchor | Δy | 落点 |
|---|---|---|---|
| hair_a | (232, 230) | -3 | 头顶 ✓ |
| coat_a | (221, 238) | +5 | 肩膀 ✓ |
| pants_a | (207, 269) | +36 | 腰 ✓ |
| shoes_a | (202, 321) | +88 | 脚（body 高 106） ✓ |

## Why（为什么这是教训）

绕的弯路：
1. 直接用 `sg_coat0000a.img` 抽出道具图，以为是上衣
2. 写 `verify-alignment.mjs` + `verify-alignment.py`，生成 6 张 `alignment-*.png` 测试 6 种对齐公式 — **全错**
3. 把错的 sprite 用 5 种 alignment mode 在浏览器里切换 — **依然全错**
4. 直到从 [[dnf-extract-build-pitfalls]] 联想到去 `--list` 真实路径，才发现 `equipment/character/swordman/avatar/...` 这个独立目录树

症结：**数据源错了，怎么调公式都不对**。下次见到提取结果不像穿在身上、ARGB_1555 强制不透明、imgAnchor 偏离 body 几十像素以上 — 第一反应是怀疑路径，不是怀疑公式。

## How to apply

- **抽其他 action（attack1/dash/jump...）的同款时装**：
  ```bash
  node scripts/extract-equipment-layer.mjs <action> \
    equipment/character/swordman/avatar/<layer>/<layer>_a/<action>.ani
  ```
- **武器**：路径不在 avatar/，按武器类型分目录：
  `equipment/character/swordman/weapon/<weapon-type>/<weapon-id>/<action>.ani`
  （beamsword/cainusswdb1 等，每种武器自己的动画曲线）
- **其他职业**（priest/gunner/mage/thief/fighter）：路径模板  
  `equipment/character/<job>/avatar/{layer}/{layer}_a/<action>.ani`
- **款式切换**：`--style 0001` 抽 a 类型的 1 号变体；`--layer-name coat_b` 抽 b 类型（要改 .ani 路径里的 `coat_a` → `coat_b`）

## 已落地

- `scripts/extract-equipment-layer.mjs` 重写为 .ani-driven（2026-05-20）
- `src/game/DnfLayeredSprite.ts` Mode 2 是正解
- `src/game/EquipmentTestScene.ts` 加载 `coat_a/hair_a/pants_a/shoes_a` 4 件
- `public/assets/dnf/character/swordman/stay/{coat,hair,pants,shoes}_a/` 已抽 6 帧 + layer-meta.json

## 待清理

- 错数据：`stay/{coat,coat-debug,coat-test,hair,pants,shoes,weapon,weapon-test}/`（旧的，基于 sg_*.img 抽的）
- 错探索遗物：`alignment-*.png`（6 张）、`scripts/verify-alignment.mjs`、`scripts/verify-alignment.py`、`scripts/test-all-formulas.mjs`、`scripts/test-imganchor-hypothesis.mjs`

## 待扩展

- 其他 10 个 action 抽时装层（35 次提取，写批量脚本）
- 武器层接入（路径单独处理）
- 多款式切换（_b/_c/_d... 验证）
- 复杂动作里的 ARGB_LINK 链式 resolve（stay 没遇到）

## 链接

- [[architecture-quick-ref]] — 整体架构
- [[dnf-extract-build-pitfalls]] — dnf-extract 工具陷阱（PVF↔NPK 路径映射规则）
- [[feedback-dnf-extract-mandatory]] — 必须用 dnf-extract.exe，不走 TS 提取
