---
name: verify-all
description: "一键运行三道验证门：typecheck → static:test → build，对应 CI 完整流程"
---

# Verify All Skill

一键运行项目的三道验证门，与 CI 流程完全一致。

## 使用方式

`/verify-all` — 无需参数

## 执行流程

按顺序执行以下命令，任一失败则停止并报告：

```bash
# Gate 1: 类型检查
npm run typecheck

# Gate 2: 静态测试 (41 tests)
npm run static:test

# Gate 3: 生产构建
npm run build
```

## 输出格式

```
## 验证结果

| Gate | 状态 | 耗时 |
|------|------|------|
| typecheck | ✅/❌ | Xs |
| static:test | ✅/❌ (N/41 passed) | Xs |
| build | ✅/❌ | Xs |

### 失败详情（如有）
- [具体错误信息]
```

## 注意事项

- `static:test` 会先编译到 `.tmp/test-js/`，然后逐个执行测试文件
- 结果 JSON 写入 `.tmp/typecheck-results.json`、`.tmp/static-test-results.json`、`verification/build.json`
- 如果 typecheck 失败，不要继续跑测试（编译会失败）
- build 需要 `BUILD_HASH` 环境变量（本地可忽略，CI 自动注入）
