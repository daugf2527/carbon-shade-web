# Neople DNF Open API 辅助材料接入记录 v0.1

> 状态：辅助材料归档 / 接入设计稿
> 项目：碳影 / Carbon Shade
> 当前工程原型：Combat Lab
> 数据来源：Neople Developers 官方 DNF Open API
> 目标：把 DNF 官方开放数据作为《碳影》的外部参考资料源、图鉴资料源与后续“外智 / 代役 / 回响”系统的第一条真实数据管线。

---

## 1. 结论

Neople DNF Open API 对《碳影》的价值很高，但定位必须清楚：

它不是 DNF 战斗引擎源码，也不是 1:1 战斗帧数据来源。
它是官方开放的角色、装备、道具、拍卖行、职业、技能等外部资料接口。

因此在《碳影》中应定位为：

```text
官方数据资料源 + 角色/装备/经济/技能参考源 + 外部数据接入样板
```

不应定位为：

```text
DNF 战斗内核复刻数据源
```

---

## 2. 对《碳影》的核心作用

### 2.1 DNF Reference 面板

在游戏或调试页面中增加一个 DNF Reference / 资料库面板，用于查询：

- 服务器列表
- 角色搜索
- 角色基础信息
- 角色状态 / 面板
- 角色装备
- 角色时装
- 宠物
- 技能风格
- BUFF 换装
- 道具
- 套装
- 拍卖行价格
- 职业与技能信息

### 2.2 影子档案系统

用户输入一个 DNF 角色名后，系统通过官方 API 查询角色数据，然后在《碳影》中生成一个“影子档案”。

影子档案不直接作为战斗数值真值，而是作为：

- 角色称号素材
- 装备词条卡
- 技能参考卡
- 成长路线参考
- 外智回响记录
- 后续任务奖励映射材料

### 2.3 装备图鉴与道具资料库

用道具、套装、图片和说明数据构建《碳影》的装备图鉴。
当前 Combat Lab 的战斗内核仍保持自研，图鉴数据仅作为 UI、设定、掉落参考和设计素材。

### 2.4 拍卖行 / 经济参考

拍卖行接口可用于：

- 材料价格查询
- 装备估价
- 历史成交参考
- 搬砖收益模拟
- 掉落价值评估
- 后续副本结算 UI 的经济参考

### 2.5 职业技能百科

职业和技能接口可用于构建：

- 职业列表
- 技能说明
- 技能卡片
- 技能设计参考
- 职业模板参考

注意：技能接口不能替代 Combat Lab 的帧表、Hitbox、Hurtbox、RootMotion、HitStop、Recoil 等战斗工程数据。

---

## 3. 可用接口分类

以下为当前接入设计中需要重点关注的接口分组。

### 3.1 服务器与角色

| 功能 | 接口 |
|---|---|
| 服务器列表 | `/df/servers` |
| 搜索角色 | `/df/servers/:serverId/characters` |
| 角色基础信息 | `/df/servers/:serverId/characters/:characterId` |
| 角色时间线 | `/df/servers/:serverId/characters/:characterId/timeline` |
| 角色状态 / 面板 | `/df/servers/:serverId/characters/:characterId/status` |
| 角色装备 | `/df/servers/:serverId/characters/:characterId/equip/equipment` |
| 角色时装 | `/df/servers/:serverId/characters/:characterId/equip/avatar` |
| 角色宠物 | `/df/servers/:serverId/characters/:characterId/equip/creature` |
| 角色誓约 | `/df/servers/:serverId/characters/:characterId/equip/oath` |
| 角色技能风格 | `/df/servers/:serverId/characters/:characterId/skill/style` |
| BUFF 换装装备 | `/df/servers/:serverId/characters/:characterId/skill/buff/equip/equipment` |
| BUFF 换装时装 | `/df/servers/:serverId/characters/:characterId/skill/buff/equip/avatar` |
| BUFF 换装宠物 | `/df/servers/:serverId/characters/:characterId/skill/buff/equip/creature` |
| 按名望搜索角色 | `/df/servers/:serverId/characters-fame` |

### 3.2 拍卖行与时装市场

| 功能 | 接口 |
|---|---|
| 拍卖行在售物品搜索 | `/df/auction` |
| 拍卖行登记物品详情 | `/df/auction/:auctionNo` |
| 拍卖行成交记录 | `/df/auction-sold` |
| 时装市场在售搜索 | `/df/avatar-market/sale` |
| 时装市场在售详情 | `/df/avatar-market/sale/:goodsNo` |
| 时装市场成交搜索 | `/df/avatar-market/sold` |
| 时装市场成交详情 | `/df/avatar-market/sold/:goodsNo` |
| 时装市场标签 | `/df/avatar-market/hashtag` |

### 3.3 道具与套装

| 功能 | 接口 |
|---|---|
| 道具搜索 | `/df/items` |
| 道具详情 | `/df/items/:itemId` |
| 道具商店销售信息 | `/df/items/:itemId/shop` |
| 多道具详情 | `/df/multi/items` |
| 道具标签 | `/df/item-hashtag` |
| 套装搜索 | `/df/setitems` |
| 套装详情 | `/df/setitems/:setItemId` |
| 多套装详情 | `/df/multi/setitems` |

### 3.4 职业与技能

| 功能 | 接口 |
|---|---|
| 职业信息 | `/df/jobs` |
| 职业技能列表 | `/df/skills/:jobId` |
| 职业技能详情 | `/df/skills/:jobId/:skillId` |
| 多技能详情 | `/df/multi/skills/:jobId` |

---

## 4. 不能从官方 API 直接获得的内容

以下内容不能指望由 Neople Open API 直接提供，仍需 Combat Lab 自研或通过合法公开资料建模：

```text
技能逐帧数据
Hitbox / Hurtbox 判定框
攻击前摇、活跃帧、后摇
受击硬直帧
逆硬直 Recoil 真实公式
浮空重力曲线
怪物 AI 决策树
客户端动作事件表
房间同步逻辑
真实碰撞盒
完整底层伤害公式
```

因此，Combat Lab 的战斗内核继续以当前自研模块为准：

- FixedStepSimulation
- EventBus
- Input
- Hit
- Damage
- Reaction
- Armor
- Status
- Buff
- Cooldown
- HitStop
- Recoil
- Death
- Debug
- Replay

Neople API 只进入资料层和参考层，不进入核心判定真值层。

---

## 5. 推荐接入架构

不要把 Neople API Key 写入前端代码。
`carbon-shade-web` 如果通过 GitHub Pages 或其他静态部署发布，前端源码和构建产物都会暴露，API Key 会被浏览器直接看到。

推荐架构：

```text
carbon-shade-web 前端
        ↓
/api/df/* 代理层
        ↓
Cloudflare Worker / Vercel Function / Netlify Function / 自有后端
        ↓
Neople DNF Open API
        ↓
返回角色、装备、道具、技能、拍卖行数据
        ↓
游戏内 DNF Reference / 影子档案 / 装备图鉴 / 技能参考
```

环境变量建议：

```text
NEOPLE_API_KEY=xxxxx
NEOPLE_API_BASE=https://api.neople.co.kr
```

代理层只暴露业务接口，不把真实 API Key 返回给前端。

---

## 6. 《碳影》内部模块建议

### 6.1 数据网关

建议新增：

```text
src/integrations/neople/NeopleDnfGateway.ts
src/integrations/neople/NeopleDnfTypes.ts
src/integrations/neople/NeopleDnfMapper.ts
```

职责：

- 统一请求 `/api/df/*` 代理接口
- 处理错误码与空数据
- 做响应结构归一化
- 将 DNF API 响应映射为《碳影》内部资料模型

### 6.2 内部资料模型

建议定义：

```text
DnfServerSummary
DnfCharacterSearchResult
DnfCharacterProfile
DnfCharacterStatusSnapshot
DnfEquipmentCard
DnfAvatarCard
DnfSkillCard
DnfBuffSwapSnapshot
DnfItemCatalogEntry
DnfSetItemEntry
DnfAuctionQuote
DnfMarketSoldRecord
CarbonShadowDossier
```

### 6.3 游戏 UI 模块

建议新增：

```text
src/game/ui/DnfReferencePanel.ts
src/game/ui/ShadowDossierPanel.ts
src/game/ui/EquipmentCodexPanel.ts
src/game/ui/MarketQuotePanel.ts
```

如果当前 Phaser UI 不适合承载复杂表格，可以先在普通 HTML Overlay 层实现，再逐步接入游戏内 UI。

---

## 7. 第一阶段功能拆分

### P0：只读查询闭环

目标：先跑通最小闭环，不影响当前 Combat Lab 战斗内核。

- 增加 DNF API 代理层
- 增加服务器列表查询
- 增加角色名搜索
- 增加角色基础信息查询
- 增加角色装备查询
- 增加角色状态查询
- 增加一个只读 DNF Reference 面板
- 前端不保存 API Key
- 失败时显示明确错误，不影响游戏运行

### P1：图鉴与经济参考

- 道具搜索
- 道具详情
- 套装详情
- 拍卖行当前价格
- 拍卖行成交记录
- 装备图鉴卡片 UI
- 市场价格卡片 UI

### P2：影子档案与世界观融合

- 输入 DNF 角色名生成 CarbonShadowDossier
- 将装备转为“词条卡”
- 将技能转为“技能参考卡”
- 将角色状态转为“回响记录”
- 将外部查询行为纳入《碳影》的“外智 / 代役 / 回响”系统

---

## 8. 验收标准

P0 最小验收：

```text
1. 本地启动后，DNF Reference 面板可以打开。
2. 可以调用代理接口获取服务器列表。
3. 可以输入角色名并全服搜索。
4. 可以选择一个角色查看基础信息、装备、状态。
5. API Key 不出现在前端源码、浏览器网络响应、构建产物和 GitHub 仓库中。
6. Neople API 请求失败时，游戏主循环和 Combat Lab 战斗不崩溃。
7. npm run typecheck、npm run static:test、npm run build 保持通过。
```

P1 最小验收：

```text
1. 可以搜索道具并查看详情。
2. 可以查看套装详情。
3. 可以查询拍卖行当前挂单或成交参考。
4. 图鉴数据与战斗数值解耦，不污染 Combat Lab 内核。
```

P2 最小验收：

```text
1. 可以从 DNF 角色生成一份 CarbonShadowDossier。
2. Dossier 内含角色、装备、技能、状态、市场参考等摘要。
3. Dossier 可以作为《碳影》世界观中的“外部资料回响”，但不作为战斗判定真值。
```

---

## 9. 合规与边界

本项目只记录和接入官方开放 API 与用户主动输入的公开角色查询数据。

不在本项目中记录、引导或依赖：

- 泄露客户端资料
- 非授权逆向材料
- 私服数据
- 绕过访问限制的数据源
- 他人 API Key
- 任何需要隐藏在前端却被硬编码的密钥

《碳影》的战斗系统应继续使用自研规格书与 Combat Lab 代码实现。
DNF Open API 作为辅助材料和参考燃料使用，不作为侵入式复制依据。

---

## 10. 后续待办

- [ ] 新增 Neople API 代理层设计文档。
- [ ] 新增 `NeopleDnfTypes.ts` 类型定义。
- [ ] 新增 `DnfReferencePanel` 原型。
- [ ] 新增 API Key 环境变量示例，但不提交真实 Key。
- [ ] 新增错误处理与限流提示。
- [ ] 新增静态测试，确保前端代码不包含 `apikey=` 或真实 Key。
- [ ] 评估 GitHub Pages + Cloudflare Worker 的部署路径。

---

## 11. 联网复查资料索引

本节集中保存后续联网复查会高频用到的官方 API、官方公告、官方指南、官方社区样本与工具入口。
原则：A 级官方资料可作为规则锚点；B 级官方社区样本只作帧感/表现参考；C/D 级工具只用于理解资源容器与风险边界，不进入运行时真值链。

### 11.1 Neople Open API

| URL / Base | 用途 | 证据层级 | 可信度 | 使用边界 |
|---|---|---|---|---|
| `https://api.neople.co.kr` | Neople DNF Open API base URL | A | 高 | 只通过后端代理访问，不把 API Key 写入前端 |
| `https://developers.neople.co.kr/contents/apiDocs/df` | 官方 API 文档入口；确认 jobs / skills / character / item / auction 等接口范围 | A | 高 | 可作为资料库、图鉴、技能索引、经济参考入口；不提供完整帧表和 hitbox |

重点接口仍按第 3 节维护：`/df/jobs`、`/df/skills/:jobId`、`/df/skills/:jobId/:skillId`、`/df/multi/skills/:jobId`、`/df/items`、`/df/setitems`、`/df/auction`、`/df/servers/:serverId/characters/:characterId/*`。

### 11.2 官方规则、指南与公告

| URL | 用途 | 证据层级 | 可信度 | 法律/伦理风险 |
|---|---|---|---|---|
| `https://df.nexon.com/guide?no=1179` | Counter / 无敌 / 霸体 / 异常总览 | A | 高 | 低；官方指南 |
| `https://df.nexon.com/guide?no=1180` | 中毒 / 灼伤 / 感电 / 出血细则 | A | 高 | 低；官方指南 |
| `https://www.dfoneople.com/news/updates/531/System-Updates/Miscellaneous-Changes` | 训练场 Aerial / Down / Grab-immune / Counterattack / Super Armor | A | 高 | 低；官方更新 |
| `https://www.dfoneople.com/news/updates/2979/Character/Character-System` | Neutralize Gauge、Backstep Upgrade | A | 高 | 低；官方更新 |
| `https://www.dfoneople.com/news/updates/3567/Controller-Support` | 控制器、固定键、模拟摇杆走/跑 | A | 高 | 低；官方更新 |
| `https://www.dfoneople.com/news/updates/3990/Equipment-Updates/Special-Object-Damage-Options` | 对象伤害与角色伤害共享/差异规则 | A | 高 | 低；官方更新 |
| `https://www.dfoneople.com/news/updates/3990/Equipment-Updates/Equipment-System-Improvements` | Damage Value / Atk Increase / Overall Damage 命名映射 | A | 高 | 低；官方更新 |
| `https://www.dfoneople.com/news/updates/4388/Content` | Rupture、Monster HP UI shake、Invincibility/Hold 表示 | A | 高 | 低；官方更新 |
| `https://www.dfoneople.com/news/updates/4242/Character-Changes/Exorcist-Renewal` | 多目标分裂、Hold、技能范围变化样本 | A | 高 | 低；官方更新 |
| `https://www.dfoneople.com/news/updates/1486/Character-Balance-Patch/Priest%28M%29` | 700->900 / 750->900 等范围样本 | A | 高 | 低；官方更新 |
| `https://www.dfoneople.com/news/updates/1486/Character-Balance-Patch/Priest%28F%29` | Miracle Shine Y 轴 100->150 样本 | A | 高 | 低；官方更新 |
| `https://www.dfoneople.com/news/updates/4796/Character-Changes/Skill-Evolution-Improvements` | pre-input、攻击速度固定比率作用于动作、重定向追踪 | A | 高 | 低；官方更新 |
| `https://www.dfoneople.com/news/updates/4649/Skill-Evolution` | Skill Evolution / Skill Enhancement 系统结构 | A | 高 | 低；官方更新 |
| `https://www.dfoneople.com/news/updates/1393/Character-Balance/Berserker` | Berserker / Raging Fury / Frenzy 等复刻参考 | A | 高 | 低；官方更新 |
| `https://df.nexon.com/df/news/update?mode=view&no=1624704` | 韩服更新公告；用于交叉核对 Berserker 与技能改动 | A | 高 | 低；官方更新 |

### 11.3 官方社区与表现样本

| URL | 用途 | 证据层级 | 可信度 | 使用边界 |
|---|---|---|---|---|
| `https://df.nexon.com/community/dnfboard/article/2938354` | 社区逐帧样本：女散打技能时长 | B | 中 | 官方社区但玩家内容；只作表现/相对时长参考 |
| `https://df.nexon.com/community/dnfboard/article/2937887?category=1` | 社区逐帧样本：特工技能时长/取消 | B | 中 | 官方社区但玩家内容；不直接当 60Hz 逻辑帧 |
| `https://df.nexon.com/community/dnfboard/article/2734168?growType=1&job=0&titleType=1` | 逆硬直 / 武器手感差异 | B | 中 | 官方社区但玩家内容；用于手感校验 |

### 11.4 DFO World / Wiki / Community 复刻参考

| URL | 用途 | 证据层级 | 可信度 | 使用边界 |
|---|---|---|---|---|
| `https://wiki.dfo.world/view/Quick_Rebound` | Quick Rebound 受身机制参考 | B | 中 | 社区 Wiki；需与官方公告/实测交叉验证 |
| `https://wiki.dfo-world.com/view/Raging_Fury` | Raging Fury 多段血柱与技能描述参考 | B | 中 | 社区 Wiki；不可单独作为真值 |
| `https://wiki.dfo-world.com/view/Frenzy` | Frenzy HP 消耗、技能改写、冷却等参考 | B | 中 | 社区 Wiki；需与官方更新交叉验证 |
| `https://wiki.dfo-world.com/view/Berserker` | Berserker 职业技能与定位参考 | B | 中 | 社区 Wiki；用于梳理职业动作目标 |
| `https://dnf.fandom.com/zh/wiki/%E7%8B%82%E6%88%98%E5%A3%AB` | 中文 Berserker 资料参考 | C | 中 | 中文社区资料；只作辅助索引 |
| `https://www.gamemeca.com/view.php?gid=840287` | 韩文职业/玩法资料辅助参考 | C | 中 | 媒体/社区资料；只作交叉线索 |

### 11.5 资源容器与高风险工具入口

| URL | 用途 | 证据层级 | 可信度 | 法律/伦理风险 |
|---|---|---|---|---|
| `https://github.com/flwmxd/DNF-Porting` | PVF / NPK 解包库存在性 | C | 中 | 中；开源但非官方，只用于理解容器结构 |
| `https://github.com/LHCGreg/DFOToolBox/releases` | NPK 查看 / 提取工具存在性 | C | 中 | 中；开源但非官方，不分发官方资源 |
| `https://github.com/Zageku/DNF_pvf_python` | 明确涉及“台服 PVF”与编辑功能，高风险旁证 | D | 低到中 | 高；不应进入主数据链，不应再分发 |

---

## 12. 当前判断

Neople DNF Open API 对《碳影》值得接入。

它的最佳用途不是“复制 DNF 战斗源码”，而是让《碳影》获得一条真实、官方、可维护的外部数据管线。
这条管线可以先服务资料库、图鉴、角色查询和拍卖行参考，后续再融入“外智代役、借智有债、代役留责”的世界观系统。
