---
name: dnf-extract-build-pitfalls
description: tools/dnf-porting-src 编译/运行陷阱合集 — 静态链接、cmake 硬编码、stdout 污染、stub 接口
metadata: 
  node_type: memory
  type: project
  originSessionId: 03ea92cc-77c4-4ab2-a07d-97624e683692
---

`tools/dnf-extract.exe` (C++ CLI) 编译和运行的具体陷阱集合. 这些是 2026-05-19 踩了一天后总结出来的, 下次重编/调试时直接对照清单.

**Why:** 这个工具几次破坏性事件——
- 当前 mingw 编译出来的 exe 在另一台 mingw 环境运行报 `STATUS_ENTRYPOINT_NOT_FOUND` (libstdc++-6.dll 版本不匹配).
- exit 127 + stdout 重定向时无输出: 几乎一定是 libstdc++ DLL 不匹配 (Git Bash 路径 + 360 安全卫士 hook 也会放大问题).
- CLI help 列出的命令实际部分是 stub.

**How to apply (运行排错):**
- exit 127 + 无 stdout, exit 0 但 redirect 时变 127: **libstdc++ DLL 版本不匹配**. 解法: 重新编译, CMakeLists 加 `-static-libgcc -static-libstdc++ -static`.
- 静态链接后 exe 从 ~1.3MB 变 ~4MB, 这是正常的, 不依赖外部 DLL.
- 跑命令前先 `pwd` 确认 cwd, 否则 `tools/dnf-extract.exe` 相对路径会失败 (见 [[feedback-bash-cwd-persists-across-calls]]).

**How to apply (代码维护):**
- CMakeLists `MINGW_SYSROOT "C:/ProgramData/mingw64/mingw64/x86_64-w64-mingw32"` 是硬编码 — 跨机器要改这一行.
- `mapping over` / `Version N` / `Unknown type` 等 debug 输出原本在 stdout, 已经全部改成 stderr. 下次新增 debug 也走 stderr, 不要污染 JSON 契约.
- main.cpp 的 mode dispatch 里有 stub: workflow 早期版本里 `resolve` / `npk-list` 都不在 dispatch 表, help 却列着. 如果 help 加了新命令, **务必加进 if-else 链**否则走 unknown_command fallback.
- `printImgFrameFields` (旧 `printImgFrameJson`) 输出**不带外括号** — 调用者要自己包 `{...}`. 之前因为它自己加大括号导致输出 `..."frame":0,{...}}` 缺 key 非法 JSON.

**How to apply (NPK 路径):**
- PVF `.ani` 引用的 sprite 路径 ≠ NPK 里实际 IMG 路径名. `NpkFile::getNpkImgNode` 已经会尝试 `equipment` → `atequipment` 候选. 但 `sm_body` vs `sg_body` 等字面差异**没有**自动处理 — 上游调用方负责传对名字.
- 调用 `--resolve` 时, NPK 必须以 `sprite_*.NPK` 命名, basename 索引由 `loadAll` 在第一次调用时建立.

**编译命令模板** (项目根):
```
cd tools/dnf-porting-src && rm -rf build && cmake -G "MinGW Makefiles" -B build && mingw32-make -C build -j4 && cp build/dnf-extract.exe ../ && cd /d/carbon-shade-web
```

见 [[session-2026-05-19-dnf-extract-fixes]] [[feedback-dnf-extract-mandatory]].
