# 输入录制和回放系统使用指南

## 概述

输入录制和回放系统允许你录制游戏中的按键操作，并在之后重放这些操作。这对于重现 bug、验证修复、以及创建可重复的测试场景非常有用。

## 快捷键

| 按键 | 功能 |
|------|------|
| **F7** | 开始/停止录制（切换） |
| **F8** | 回放最后一次录制 / 停止回放 |
| **F9** | 导出录制到 JSON 文件 |

## 使用流程

### 1. 录制输入

1. 按 **F7** 开始录制
2. 右上角会显示红色的 **● REC** 指示器
3. 进行你想录制的操作（移动、攻击、技能等）
4. 再次按 **F7** 停止录制
5. 控制台会显示录制信息：`录制完成: X 帧, Y 个输入事件`

### 2. 回放录制

1. 按 **F8** 开始回放最后一次录制
2. 右上角会显示蓝色的 **▶ REPLAY X%** 指示器，显示回放进度
3. 场景会自动重置到录制开始时的状态
4. 输入会按照录制时的时间戳自动重放
5. 回放期间用户输入被禁用，避免干扰
6. 回放完成后自动停止，或按 **F8** 手动停止

### 3. 导出录制

1. 按 **F9** 导出当前录制到 JSON 文件
2. 文件会自动下载到浏览器的下载目录
3. 文件名格式：`input-recording-YYYY-MM-DDTHH-MM-SS-sssZ.json`

### 4. 导入录制（开发者功能）

目前导入功能需要通过代码调用：

```javascript
// 在浏览器控制台中
const scene = window.combatLab.scene;
const json = '...'; // 从文件读取的 JSON 字符串
scene.inputRecorder.importFromJson(json);
scene.inputRecorder.startReplay(scene.kernel);
```

## 录制文件格式

录制文件是 JSON 格式，包含以下信息：

```json
{
  "version": "1.0.0",
  "startTick": 0,
  "endTick": 120,
  "duration": 120,
  "initialState": {
    "playerPosition": { "x": 390, "y": 0, "z": 0 },
    "playerHp": 1000,
    "playerFacing": "right",
    "enemies": [
      {
        "id": "grunt",
        "type": "grunt",
        "position": { "x": 780, "y": 0, "z": 0 },
        "hp": 500,
        "facing": "left"
      }
    ]
  },
  "inputs": [
    { "tick": 0, "type": "keydown", "code": "ArrowRight" },
    { "tick": 10, "type": "keyup", "code": "ArrowRight" },
    { "tick": 15, "type": "keydown", "code": "KeyX" },
    { "tick": 16, "type": "keyup", "code": "KeyX" }
  ],
  "metadata": {
    "recordedAt": "2026-05-31T12:34:56.789Z",
    "buildHash": "local-dev"
  }
}
```

### 字段说明

- **version**: 录制格式版本
- **startTick**: 录制开始时的游戏 tick
- **endTick**: 录制结束时的游戏 tick
- **duration**: 录制总帧数
- **initialState**: 录制开始时的场景状态
  - **playerPosition**: 玩家位置 (x, y, z)
  - **playerHp**: 玩家 HP
  - **playerFacing**: 玩家朝向 ("left" 或 "right")
  - **enemies**: 敌人列表（只包含活着的敌人）
- **inputs**: 输入事件列表
  - **tick**: 相对于录制开始的帧数
  - **type**: "keydown" 或 "keyup"
  - **code**: 按键代码（如 "KeyX", "ArrowRight"）
- **metadata**: 元数据
  - **recordedAt**: 录制时间（ISO 8601 格式）
  - **buildHash**: 构建版本哈希

## 使用场景

### 1. Bug 重现

1. 遇到 bug 时，按 **F7** 开始录制
2. 重现 bug 的操作步骤
3. 按 **F7** 停止录制
4. 按 **F9** 导出录制文件
5. 将录制文件附加到 bug 报告中
6. 开发者可以导入录制文件，精确重现 bug

### 2. 修复验证

1. 修复 bug 后，导入之前的录制文件
2. 按 **F8** 回放
3. 观察 bug 是否已修复
4. 如果 bug 仍然存在，可以逐帧调试（配合 F4 单步执行）

### 3. 性能测试

1. 录制一段复杂的战斗场景
2. 多次回放，观察性能指标（FPS、tick cost）
3. 对比优化前后的性能差异

### 4. 自动化测试

1. 录制标准测试场景
2. 在 CI/CD 中自动回放
3. 验证游戏逻辑的确定性

## 注意事项

1. **录制时长限制**: 建议录制时长不超过 10 分钟（36000 帧），避免文件过大
2. **回放确定性**: 回放依赖于游戏逻辑的确定性。如果游戏逻辑有随机性或时间依赖，回放可能不完全一致
3. **版本兼容性**: 录制文件与特定的游戏版本绑定。如果游戏逻辑发生变化，旧的录制文件可能无法正确回放
4. **敌人 AI**: 录制只记录玩家输入，不记录敌人 AI 的决策。如果敌人 AI 有随机性，回放时敌人行为可能不同
5. **回放期间**: 回放期间用户输入被禁用，按 **F8** 可以随时停止回放

## 技术细节

### 实现位置

- **InputRecorder**: `src/combat/replay/InputRecorder.ts`
- **CombatScene 集成**: `src/game/CombatScene.ts`

### 核心方法

```typescript
class InputRecorder {
  startRecording(kernel: CombatKernel): void;
  stopRecording(kernel: CombatKernel): InputRecording | null;
  recordInput(tick: number, type: "keydown" | "keyup", code: string): void;
  
  startReplay(kernel: CombatKernel, recording?: InputRecording): boolean;
  stopReplay(): void;
  tickReplay(kernel: CombatKernel): void;
  
  exportToJson(): string | null;
  importFromJson(json: string): InputRecording | null;
  
  isRecording(): boolean;
  isReplaying(): boolean;
  getReplayProgress(): number;
}
```

### 与 ReplayRecorder 的区别

项目中已有 `ReplayRecorder`，它记录完整的游戏状态（每帧的 actor 状态、事件等），用于确定性验证和调试。

`InputRecorder` 是轻量级的输入录制系统，只记录用户输入，文件更小，更适合人工测试和 bug 重现。

| 特性 | InputRecorder | ReplayRecorder |
|------|---------------|----------------|
| 记录内容 | 用户输入 | 完整游戏状态 |
| 文件大小 | 小（几 KB） | 大（几 MB） |
| 用途 | 人工测试、bug 重现 | 确定性验证、调试 |
| 回放方式 | 重新执行输入 | 状态对比 |

## 未来改进

1. **导入 UI**: 添加文件选择器，支持从浏览器导入录制文件
2. **录制管理**: 支持保存多个录制，切换回放
3. **录制编辑**: 支持编辑录制（删除、插入、修改输入）
4. **慢动作回放**: 支持以慢速回放录制
5. **录制标记**: 支持在录制中添加标记点，快速跳转
