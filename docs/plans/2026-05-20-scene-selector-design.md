# Scene Selector 设计 — 2026-05-20

> 状态: 设计已敲定, 进入实施
> 触发: 用户要求"加很多测试场景", 现有 BootScene → EquipmentTestScene 硬跳转结构需要重构

---

## 1. 背景与目标

当前 `main.ts` 把 `BootScene` 跳转目标硬编码为 `EquipmentTestScene`, 每加一个测试场景都要改 main.ts 跳转逻辑。在 Combat Lab 0.3 阶段, 预期会有 10-30 个测试场景, 覆盖四类目标:

- **视觉/资源验证**: 类似当前 EquipmentTestScene 的 sprite 对齐、动画播放等
- **战斗内核行为**: 在浏览器里观察 hit/damage/status/AI 模块运行时表现
- **手感原型**: 连招、取消窗口、boss 战等整体手感验证
- **数据回归对照**: 不同 manifest 版本下的视觉对比

需要一个可扩展的场景选择架构, 同时承载碳影项目的视觉调性。

---

## 2. 架构总览

```
src/main.ts              ← 只负责构造 Phaser.Game, 从注册表展开 scene 列表
src/game/
  BootScene.ts           ← 改: 加载共享资源 → 启动 SceneSelectScene
  SceneSelectScene.ts    ← 新增: 中央列表页, 横竖屏自适应
  sceneRegistry.ts       ← 新增: SCENE_REGISTRY 数组 (单一信源)
  sceneHelpers.ts        ← 新增: attachReturnControls(scene)
  scenes/                ← 新目录, 测试场景统一存放
    EquipmentAlignScene.ts  ← 从 EquipmentTestScene 重命名搬入
```

**注册表形状**:

```ts
export type SceneCategory = "asset" | "kernel" | "handfeel" | "regression";

export interface SceneEntry {
  key: string;
  title: string;
  description: string;
  category: SceneCategory;
  sceneClass: typeof Phaser.Scene;
}

export const SCENE_REGISTRY: SceneEntry[] = [
  {
    key: "equipment-align",
    title: "Equipment Layer Alignment",
    description: "Verify 4-layer costume sprite alignment on 500×500 canvas",
    category: "asset",
    sceneClass: EquipmentAlignScene,
  },
  // 后续场景在此追加
];
```

加场景 = 改注册表一行 + 加一个文件, 不动 main.ts。

---

## 3. SceneSelectScene 布局

### 桌面 / 横屏 (width / height >= 1.0)

```
┌────────────────────────────────────────────────────────────────┐
│  碳影 · 明庭                                  Combat Lab v0.3   │
│  Carbon Shade — Hall of Lights                                 │
│  ─────碳橙→硅蓝渐变细线─────────────────────────────────────────│
├──────────────────┬─────────────────────────────────────────────┤
│ ▎资源验证 (1)    │  ┌─────────────────────────────────────┐    │
│   内核行为 (0)   │  │ Equipment Layer Alignment           │    │
│   手感原型 (0)   │  │ Verify 4-layer costume alignment    │    │
│   数据回归 (0)   │  │                          [进入 →]   │    │
│                  │  └─────────────────────────────────────┘    │
├──────────────────┴─────────────────────────────────────────────┤
│  ↑/↓ 选择 · Enter 进入 · Tab 切换分类 · Esc 返回                 │
└────────────────────────────────────────────────────────────────┘
```

### 移动 / 竖屏 (width / height < 1.0)

```
┌──────────────────┐
│ 碳影 · 明庭       │
│ Hall of Lights   │
│ ─碳橙→硅蓝渐变─    │
├──────────────────┤
│[资源][内核][手感][回归]│   ← 横向 tabs
├──────────────────┤
│┌────────────────┐│
││ Equipment Align ││   ← 卡片全宽
││ Verify 4-layer ││      最小高 96px
│└────────────────┘│
│                  │
└──────────────────┘
```

断点: `this.scale.width / this.scale.height < 1.0` 走竖屏分支。监听 `this.scale.on("resize", ...)` 在横竖屏切换时重排。

---

## 4. 视觉风格 — 碳硅二相

### 配色

```
背景       Carbon Ink     #0d0e12   主背景
副背景     Carbon Veil    #15171d   左栏 / 卡片底
碳基主色   Carbon Ember   #c97b3e   高亮 / 选中 (灯芯)
碳基副色   Carbon Bone    #d8c9a8   主文本
硅基主色   Silicon Glow   #6ec5ff   强调点缀 (外智暗示)
硅基副色   Silicon Mist   #4a5868   次要文本
影线       Shade Line     #2a2d36   分隔线
警示       Debt Crimson   #b34254   错误态
```

碳暖为主, 硅冷点缀 — 对应"明线热血、暗线问心"。

### 字体

- **标题**: 系统衬线 `"Source Han Serif SC", "Noto Serif SC", "Songti SC", "SimSun", serif` (零网络依赖)
- **正文/UI**: 沿用 `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`

### 文案

主标题: **碳影 · 明庭** + Carbon Shade — Hall of Lights + *硅光照世，碳影问心*
副标题: `Combat Lab v0.3 · Scene Selector` (小字, Silicon Mist 色)

### 装饰元素

- 顶栏下方一条细线, 从左到右碳橙→硅蓝渐变 (整页唯一显式表达"硅涨碳滞"边界的元素)
- 类别选中 / 卡片 hover-active 时, 左侧出 2-4px Carbon Ember 竖线 (灯芯感)
- 不加粒子、不加发光、不加额外动画

---

## 5. 双模交互

### Phaser pointer 统一抽象

鼠标 / 触摸 / 笔走同一套 `pointerup/pointerdown` 事件, 不必写两套。差异处理:

| 维度 | 处理 |
|------|------|
| hover 态 | 桌面有, 触摸无 → hover 只是非必要视觉糖, 选中态才是状态信源 |
| 触摸目标尺寸 | 场景卡片最小 96px 高, 类别 tab 最小 56px 高 |
| 屏幕窄 | 通过 §3 的横竖屏断点切换布局 |

### 键盘 + 触摸双轨

桌面底栏: `↑/↓ 选择 · Enter 进入 · Tab 切换分类 · Esc 返回`
移动底栏: `点击卡片进入 · 左上角返回按钮回明庭`

### 返回机制

每个测试场景 `create()` 末尾调一次:

```ts
attachReturnControls(this);
```

实现 (`sceneHelpers.ts`):
- 绑定 Esc 键 → `scene.scene.start("scene-select")`
- 左上角 56×56px 半透明返回按钮 (Carbon Veil 底 + Carbon Ember 描边箭头) → 同上

---

## 6. main.ts 改动

1. 删除右下角 4 个 DOM 控制按钮 (`run-scenario`, `reset`, `export-replay`, `export-handfeel`) 及其事件绑定
2. `scene` 数组改为 `[BootScene, SceneSelectScene, ...SCENE_REGISTRY.map(e => e.sceneClass)]`
3. 保留 `combatLab` runtime 全局 (其他地方还在用), 仅移除 desktop-controls 相关代码

---

## 7. BootScene 改动

- `startCombat()` 末尾的 `this.scene.start("equipment-test")` 改为 `this.scene.start("scene-select")`
- 标题文案 "Combat Lab 0.2-R3 Asset Pass" → "碳影 / Carbon Shade", 副标题保留 "Combat Lab v0.3"
- 配色更新为碳硅二相

---

## 8. 验证步骤

1. `npm run typecheck`
2. `npm run static:test` (41/41 不能退化)
3. `npm run build`
4. `npm run dev` 手动验证:
   - 桌面: BootScene → SceneSelect (横屏) → EquipmentAlign → Esc 返回
   - 移动 (DevTools mobile): 竖屏布局、tab 切换、卡片点击、左上角返回按钮

---

## 9. 不做的事 (YAGNI)

- 不做 URL 参数路由 (`?scene=xxx`)
- 不做 import.meta.glob 自动扫描
- 不做手势 (滑动切换类别)
- 不做 PWA / 离线缓存
- 不做 landscape lock
- 不在本次列出未来 10-30 个场景清单 — 按需追加

---

## 10. 后续追加场景

每加一个场景:
1. 在 `src/game/scenes/` 新建文件
2. 在 `sceneRegistry.ts` 的 `SCENE_REGISTRY` 数组追加一条
3. 场景 `create()` 末尾调 `attachReturnControls(this)`

完成。
