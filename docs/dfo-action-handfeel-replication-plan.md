# DFO 动作手感复刻对照

日期：2026-04-28

## 资料口径

- 英文：DFO World `Raging Fury`、`Frenzy`、`Quick Rebound`、`Berserker`；Neople 英文 Berserker balance notes。
- 韩文：Nexon 韩服更新公告，重点核对 `레이징 퓨리`、`프렌지`、`블러드 러스트`、`퀵 스탠딩/퀵 리바운드`。
- 控制体验：DFO 常规口径为方向键移动、双击方向跑、X 普攻、C 跳跃、倒地时 C 受身、跑动/跳跃中 X 派生攻击。

## 攻击链路

本地链路：`Input -> InputBuffer -> requestAction -> ActionEntered -> HitQuery -> HitDecision -> Damage -> Reaction -> HitStop/Recoil`，核心文件为 `src/combat/kernel/CombatKernel.ts`、`src/combat/actions/FrameDataAction.ts`。

已对齐：
- Raging Fury 从 8 个血柱改为当前 DFO 参考的 10 个血柱，血柱使用独立 hit group，便于回放和多段命中诊断。
- 血柱浮空降低，避免多段期间把目标过早推出柱范围。
- Frenzy 下支持职业技能冷却 20% 减免，当前接入 `RagingFury` 与 `Bloodlust`。
- 跑动中 X 路由到 `DashAttack`，跳跃中 X 路由到 `JumpAttack`。
- `Bloodlust` 已加入动作表，普通目标走抓取命中链，抓取免疫目标记录 `GrabFailed` 并保留抽血喷发伤害。

待补：
- Bloodlust 抓取成功后的定身/拖拽/喷发分段动画。
- Frenzy 技能攻击力、命中/硬直恢复。
- 技能数据分 PvE/PvP、版本 profile。

## 被攻击链路

本地已有 `ReactionResolver`、护甲决策、倒地/起身、hitstop/recoil。Quick Rebound 已接近 DFO：倒地按住 C 进入受身，松手进入起身。

已对齐：
- Quick Rebound 松手后起身霸体从 10F 调整为 18F，即 60fps 下 0.30 秒。
- Quick Rebound 按住期间保持 invulnerable。

待补：
- 受身持续时间、无敌时间、PvP 修正做成数据表。
- 被抓、不可抓、霸体、建筑护甲的反馈动画分层。
- 空中受击、落地弹跳、扫地保护、连击保护。

## 主角移动

本地移动已经是独立 locomotion 层，不再把 Walk/Run 塞进 `currentAction`，这符合动作游戏“移动层与攻击承诺层分离”的方向。

已对齐：
- 双击方向进入 Run。
- 斜向移动有 `sqrt(1/2)` 速度缩放。
- 新增 C 跳跃入口，保留 `↓ + C` Backstep 和倒地 C Quick Rebound。

待补：
- 跳跃轨迹应从 root-motion 近似升级为空中状态机。
- 跑动急停、反向跑、Z 轴跑动派生攻击还需要更细的输入优先级。

## 主角动作

当前动作层覆盖普通三段、Frenzy 三段、上挑、崩山击、怒气爆发、后跳、受身。新增 `DashAttack`、`Jump`、`JumpAttack` 后，基础 DFO 动作入口更完整。

下一批建议：
1. Bloodlust：抓取判定、抓取成功控制、grab-immune 喷发替代。
2. Bloodlust 二段化：命中抓取目标后进入短 hold，再喷发；grab-immune 目标直接喷发。
3. Frenzy 完整化：开启 HP 成本、持续 HP 成本、技能攻击力、命中/硬直恢复。
4. 空中/倒地保护：补扫地、浮空递减、倒地保护窗口，避免无限连。

## 关键来源

- https://wiki.dfo-world.com/view/Raging_Fury
- https://wiki.dfo-world.com/view/Frenzy
- https://wiki.dfo.world/view/Quick_Rebound
- https://www.dfoneople.com/news/updates/1393/Character-Balance/Berserker
- https://df.nexon.com/df/news/update?mode=view&no=1624704
