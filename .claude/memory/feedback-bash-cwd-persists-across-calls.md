---
name: feedback-bash-cwd-persists-across-calls
description: Bash 工具的 cwd 跨调用持久化 — cd 进去再下次调用会找不到相对路径
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 03ea92cc-77c4-4ab2-a07d-97624e683692
---

Claude Code 的 Bash tool **cwd 跨调用持久化** (文档说 "The working directory persists between commands"). `cd subdir && do-stuff` 之后, 下一次 Bash 调用还在 subdir 里. 这容易让 `tools/dnf-extract.exe ...` 这种项目根相对路径找不到文件 (exit 127, 无输出).

**Why:** 2026-05-19 至少 3 次中招——
- `cd tools/dnf-porting-src/build && mingw32-make && cp ../../...exe && ls -la tools/...exe` → 最后那个 ls 因为 cwd 已经在 build 里, 报 `cannot access tools/dnf-extract.exe`.
- 同样模式让一次 `tools/dnf-extract.exe --help` 测试报 exit 127, 误以为 binary 又坏了, 浪费 1 轮诊断.

**How to apply:**
- 长链命令最后一个跟当前任务无关的命令, **明确 cd 回项目根** 或者用绝对路径: `cd /d/carbon-shade-web && ...`.
- 编译流程的标准模板:
  ```
  cd tools/dnf-porting-src/build && mingw32-make -j4 && cp dnf-extract.exe ../../dnf-extract.exe && cd /d/carbon-shade-web
  ```
- 任何 Bash 调用出现意外 exit 127, **先 `pwd`** 排除 cwd 漂移, 再去查 binary 本身.
- 不要用 `pwd` 之类的 echo 替代真实检查 — `pwd` 一定要在同一次调用里跑.
