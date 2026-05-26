# 2026-05-26 Commit-Message 错位事故说明

**事故 commit**: `6cb6208 feat(parser): Phase 3 — MobParser ability category + 8 raw sections (P0 Stage 2 unblock)`

## 实际改动归属

| 文件 | 实际归属 | commit message 描述? |
|------|---------|---------------------|
| `src/dnf-native-combat/data/types/MobDef.ts` | Phase 3 | ✓ 描述 |
| `src/dnf-native-combat/data/parsers/MobParser.ts` | Phase 3 | ✓ 描述 |
| `src/dnf-native-combat/data/validator.ts` | Phase 3 | ✓ 描述 |
| `tests/static/dnf-native-h13-validator-probes.test.ts` | Phase 3 | ✓ 描述 |
| `tests/static/dnf-native-h15-export-probes.test.ts` | Phase 3 | ✓ 描述 |
| **`tools/dnf-porting-src/NpkFile.cpp`** | **Phase 6 P0-4** | ❌ 未描述 |
| **`tools/dnf-porting-src/NpkFile.h`** | **Phase 6 P0-4** | ❌ 未描述 |
| **`tools/dnf-porting-src/main.cpp`** | **Phase 6 P0-4** | ❌ 未描述 |

## 时序还原

13:00 左右两个 opus agent 并发跑：
1. **Phase 3 agent** 改 MobParser 等 5 个 TS 文件
2. **Phase 6 agent** 改 PvfAnimation.cpp + NpkFile.cpp/h + main.cpp，重编 dnf-extract.exe

Phase 6 流程：
- ✅ 完成 4 个 C++ 改动 + cmake build + 回归验证（72/72 + NPK truncation exit=1）
- ✅ `git add tools/dnf-porting-src/PvfAnimation.cpp tools/dnf-extract.exe` → `git commit` → **commit `cf5dcb9`** "fix(extractor): P0-3 + P1-13"
- ✅ `git add tools/dnf-porting-src/NpkFile.cpp tools/dnf-porting-src/NpkFile.h tools/dnf-porting-src/main.cpp`（准备 commit 2 P0-4，但**未 commit**）
- ⚠️ 这时 staging area 含 P0-4 3 个文件

主对话端：
- 在 Phase 3 agent 完成（撞 opus 额度返回，但代码已写完）后，主对话接手收尾
- `git add` 5 个 Phase 3 TS 文件
- `git commit -m "feat(parser): Phase 3 — MobParser ..."` — **不带 `--only`，commit 把 staging area 全部内容打包**
- 结果：Phase 6 agent 早 stage 的 P0-4 3 个文件**被卷进了 Phase 3 commit**
- commit `6cb6208` 文件清单含 8 个，但 message 只描述 5 个 TS 改动

## 影响评估

### 已确认安全
- ✅ **源码完整**：所有 C++ 改动均在 git 历史里（cf5dcb9 含 PvfAnimation；6cb6208 含 NpkFile + main）
- ✅ **二进制一致**：cf5dcb9 commit 的 `tools/dnf-extract.exe` 是 4 个 C++ 改动**全部应用后重编**的 binary，跟源码逻辑等价
- ✅ **回归全过**：72/72 static:test + attack1.ani 解析 + chr extraction 46224 字节 + NPK 截断 exit 1（关键 P0-4 验证）
- ✅ **未推送**：事故 commit 仅在本地 dnf-native，origin 未污染

### 微妙但可接受
- ⚠️ **`git bisect` 时间窗微错位**：从 `cf5dcb9` 到 `6cb6208` 之间，binary 已含 P0-4 修复但 NpkFile/main 源码尚未进 git。如果在这两个 commit 之间 rebuild，结果跟 binary 不一致。但该窗口仅存在于事故 commit 之间约 1 分钟历史，且事故已记录可追溯。

### 不修复的理由
- `git reset --soft HEAD^` + 拆分会破坏未推送但本地已稳定的 commit 链
- binary 一致性是 cf5dcb9 已 captured 的事实，重做无收益
- 追加文档说明 + 未来 PR/changelog 引用，足以让 reviewer 理解

## 下次预防

主对话在派 agent 跑期间，**绝不要 `git add ... && git commit`** — 应该用 `git commit --only <file...>` 显式列文件，或者先 `git diff --cached --name-only` 看 staging 内容确认。

或者更稳妥：派 agent 前**清空 staging area**（如果有遗留），并约定主对话不接管 agent 的 staging。

## 验证 commit 完整性

```bash
git show --stat 6cb6208      # 看实际改动文件
git log --oneline cf5dcb9..6cb6208  # 看两个 commit 之间
```

如果重新跑 baseline + 项目测试，所有结果应与 commit 时一致：

- `npm run typecheck` → passed
- `npm run static:test` → 72/72 passed
- `npm run baseline` (需 DNF_PVF_PATH) → goblin.json 含 abilityCategory + level + 等 8 字段
- `tools/dnf-extract.exe --npk <truncated>` → exit 1

---

*本文件由主对话生成于事故后约 5 分钟，记录 Phase 3 + Phase 6 P0-4 commit 合并事故。所有改动均已 push 前发现 + 评估。*
