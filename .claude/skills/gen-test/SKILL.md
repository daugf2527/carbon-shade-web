---
name: gen-test
description: "生成符合项目约定的 static test 文件 — 无框架、node:assert/strict、standalone Node 执行"
---

# Gen Test Skill

为 Carbon Shade 项目生成符合严格约定的静态测试文件。

## 使用方式

`/gen-test <模块名或功能描述>` — 例如 `/gen-test hit-shape` 或 `/gen-test 测试新的 GoreCross action`

## 项目测试约定（必须严格遵守）

### 文件位置和命名
- 路径: `tests/static/<name>.test.ts`
- 命名: kebab-case，描述被测功能

### Import 规则
```typescript
// ✅ 正确 — 从 test-utils.js 导入 assert
import { assert } from "./test-utils.js";

// ✅ 正确 — .js 扩展名（NodeNext resolution）
import { SomeModule } from "../../src/combat/some/Module.js";

// ❌ 错误 — 不要直接导入 node:assert
import assert from "node:assert/strict";

// ❌ 错误 — 不要省略 .js 扩展名
import { SomeModule } from "../../src/combat/some/Module";

// ❌ 错误 — 不要使用 node: 内置模块（test tsconfig 不支持）
import fs from "node:fs";
```

### 断言 API（只有这三个）
```typescript
assert.ok(value);                    // 真值检查
assert.equal(actual, expected);      // 严格相等 (===)
assert.deepEqual(actual, expected);  // 深度相等
```

**禁止使用**: `assert.fail()`、`assert.throws()`、`assert.notEqual()` 等。
需要断言失败时用 `throw new Error("message")`。
需要断言抛出时用 try/catch：
```typescript
let threw = false;
try { dangerousCall(); } catch { threw = true; }
assert.ok(threw);
```

### 测试结构
```typescript
// 每个测试用块作用域隔离
{
  // 测试描述用注释
  // Test: 描述这个测试验证什么
  const actor = createActor(...);
  // ... setup and assertions
  assert.equal(result, expected);
}

{
  // Test: 另一个独立测试
  // ...
}
```

**不使用** `describe`/`it`/`test` 函数 — 这不是 Jest/Mocha。

### FrameDataAction 特殊处理
```typescript
// 需要 double-cast 访问内部字段
const raw = action as unknown as Record<string, unknown>;
```

### 运行方式
测试文件被编译到 `.tmp/test-js/` 后作为独立 Node 进程执行。
退出码 0 = 通过，非 0 = 失败。

## 生成模板

```typescript
// <name>.test.ts — <简短描述>

import { assert } from "./test-utils.js";
// ... 其他 imports（使用 .js 扩展名）

{
  // Test: <测试场景1描述>
  // setup
  // action
  // assertion
}

{
  // Test: <测试场景2描述>
  // ...
}
```

## 生成后验证

```bash
npm run typecheck && npm run static:test
```

确认新测试出现在结果中且通过。
