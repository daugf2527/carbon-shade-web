---
name: session-2026-05-19-dnf-extract-fixes
description: dnf-extract.exe 工具栈修复 + DNF PVF/NPK 命名规则发现
metadata: 
  node_type: memory
  type: project
  originSessionId: 03ea92cc-77c4-4ab2-a07d-97624e683692
---

2026-05-19 会话: 把 tools/dnf-extract.exe 从 broken (exit 127, segfault) 修到完全可用. commit 89f9e01.

**Why:** 用户启动 1:1 还原狂战士外观工作, 需要先把提取工具修好才能批量解包.

**How to apply:**
- 下次需要从 PVF/NPK 提取资源, 直接用 `tools/dnf-extract.exe`. 模式齐了: `--list` `--file` `--npk --list` `--resolve`.
- 路径转换规则: PVF `.ani` 引用 `character/<class>/equipment/...` 但 NPK 文件名是 `sprite_character_<class>_atequipment_...`. getNpkImgNode 已经自动尝试 equipment→atequipment 候选, 不用上游手动转.
- 重新编译: `cd tools/dnf-porting-src && rm -rf build && cmake -G "MinGW Makefiles" -B build && mingw32-make -C build -j4 && cp build/dnf-extract.exe ../`. CMakeLists 已配静态链接, 跨机器无 DLL 依赖.

**DNF 命名事实 (重要)**:
- 狂战士 (berserker) DNF 内部代号 = **demonicswordman** (鬼剑士觉醒后). Carbon Shade 项目里的 `player_berserker.*` `berserkerSkillFacts.ts` 是项目自己的命名习惯, 不是 PVF 路径.
- 鬼剑士基础动作在 `character/swordman/animation/`, 觉醒后狂战士动作在 `character/swordman/dsanimation/`.
- 入口 .chr 文件: `character/swordman/swordman.chr` (基础) + `character/swordman/demonicswordman.chr` (觉醒).
- DNF 没有 walk/death/wakeup 动作概念. 实际命名: `stay` (idle) / `dash` (跑, 没有走) / `damage1` `damage2` (受伤) / `hitback` (击退) / `down` (倒地) / `overturn` (翻身/起身) / `attack1/2/3` (普攻三段) / `jump` `jumpattack`.
- PVF 总文件数: 369,391 (2018年2月客户端). 顶级目录最大: equipment (18万), monster (7.8万), passiveobject (4.9万), map (1.5万), character (7,621), skill (1,987).
- character/swordman/ 共 1241 文件: 173 animation + 173 dsanimation + 93 attackinfo + 94 dsattackinfo + 698 effect + 8 particle.

**.ani 引用 sprite 的元数据**:
- 引用语法: `character/swordman/equipment/avatar/skin/sm_body%04d.img`, `imgId` 是 `%04d` 替换的索引.
- 一个 .ani 解析出来: framesCount + loop + 每帧 (x, y 锚点, imgId, sprite path, delay ms, atk/dmg box 数组 **[x1, y1, z1, x2, y2, z2]** — 两个对角点的 3D box，verified 2026-05-23 via `HitResolver2D5.ts:19` + `src/dnf-native-combat/data/types/AniDef.ts`).
- stay.ani 实测: 6 帧, loop=true, 锚点 -232,-333, delay 120ms, 2 个 damage box.

**像素数据格式**:
- IMG frame 输出: width/height/x/y/maxWidth/maxHeight/size/format/formatName/compress/dataBase64.
- 常见 format: 14=ARGB_1555, 15=ARGB_4444, 16=ARGB_8888, 18=DXT_1, 19=DXT_3, 20=DXT_5. compress 6 似乎是 raw (无压缩).
- 解出来的像素 buffer 字节数 = width × height × 4 (对 ARGB_8888 类). sm_body0000 实测 71×107×4 = 30388 bytes 精确匹配.

**残留**:
- main.cpp 里 npk --img --list 模式 (line ~333) 还是个空 stub, 只输出 `{"frames":[]}`. 如果以后需要列单个 NPK 内的所有 frames 元数据, 还要补全.
- "sm_body" vs "sg_body": PVF .ani 引用 `sm_body%04d.img`, 但有的 NPK 里实际是 `sg_body0000.img`. 当前 resolve 不做这层映射 — 但发现实际上 PVF 引用直接命中 NPK 里的 `equipment/sm_body` 路径 (有独立 NPK 含 sm_body), 不需要替换. 只在某些子目录/装备里才需要 at 前缀.

见 [[feedback-dnf-extract-mandatory]] [[combat-lab-0.3-state]].
