# DNF 客户端资源路径 (2026-05-11)

## 客户端目录

**路径**: `D:\BaiduNetdiskDownload\DNF客户端（2018年2月更新）\地下城与勇士`
**版本**: 2018年2月更新（国服客户端）

## 顶层资源清单

| 资源 | 大小 | 状态 |
|------|------|------|
| `Script.pvf` | 196 MB (2017-03-29) | ✅ 主容器 |
| `ImagePacks2/` | 8.7 GB, 4085 个 NPK | ✅ 精灵图包 |
| `SoundPacks/` | 多个 NPK | ✅ 音频包 |
| `Music/` | - | ✅ 背景音乐 |
| `Video/` | - | ✅ 视频 |

## Script.pvf 内部结构

| 属性 | 值 |
|------|-----|
| UUID | `fa08bf71-4395-6a4b-a3e3-2617c9fee116` |
| 文件版本 | v66282 |
| 总文件数 | 370,666 |
| 数据包大小 | 167.11 MiB |

### PVF 内关键文件

| 文件 | 大小 | 用途 |
|------|------|------|
| `stringtable.bin` | 12.19 MiB | 字符串表（解析所有脚本的前置依赖） |
| `n_string.lst` | 262 B | 字符串文件索引 |
| `skill/swordman/*.skl` | 各种 | 剑魂/狂战士技能数据 |
| `skill/demonicswordman/*.skl` | 各种 | 剑魔技能数据 |
| `character/swordman/**/*.ani` | 各种 | 角色动画 |
| `passiveobject/character/swordman/**/*.ani` | 各种 | 特效/被动对象动画 |

## 提取工具

项目自带 `tools/extract-assets.mjs` — 纯 Node.js 实现的 PVF/NPK 解析器：

```bash
# 列出 PVF 内容
node tools/extract-assets.mjs --pvf "D:\...\Script.pvf" --list

# 提取单个文件
node tools/extract-assets.mjs --pvf "D:\...\Script.pvf" --extract "stringtable.bin" --out ./output/

# 列出 NPK 内容
node tools/extract-assets.mjs --npk "D:\...\ImagePacks2\sprite_character_swordman.NPK" --list
```

PVF 加密方式：XOR key `0x81a79011` + ROTR6，文件名解密用 EUC-KR (CP949) 编码。

## 完整资源链路

```
DNF 客户端根目录
├── Script.pvf (196MB) ─── PVF解包 ─── stringtable.bin + n_string.lst + .skl + .ani + .act
├── ImagePacks2/ (8.7G) ─── NPK解包 ─── IMG精灵帧 + 帧时长 + 锚点
└── SoundPacks/ ─────────── 音效NPK

四个核心资源齐全，提取工具链就绪。
```

## 合规边界

参考 `docs/design/source-policy.md`：
- 只提取数值数据（帧数、时长、锚点、碰撞框坐标）
- 不嵌入/分发原版精灵图、纹理、音频
- PVF 本身不纳入项目仓库
