---
name: feedback-dnf-extract-mandatory
description: DNF asset extraction MUST use tools/dnf-extract.exe — src/extraction/ TypeScript stack is deprecated
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 03ea92cc-77c4-4ab2-a07d-97624e683692
---

提取 DNF 资源时必须使用 `tools/dnf-extract.exe` (C++ CLI). `src/extraction/` 下的完整 TypeScript 实现 (PvfParser/NpkParser/ImgParser/AniAnalyzer/SklAnalyzer/SklToActionMapper) **已废弃**, 不要再用它编排任何提取流程.

**Why:** 用户明确指示 (2026-05-19 会话). C++ 工具是项目目前的官方提取入口, TypeScript 栈虽然有完整测试 (40/40 pass) 但是已被废弃路径.

**How to apply:**
- 写脚本提取 PVF/NPK/IMG/ANI/SKL 时, 调用 `tools/dnf-extract.exe` (JSON Lines 输出, 见 CLAUDE.md 工具章节)
- 如果 dnf-extract.exe 跑不起来 (DLL 缺失/损坏/编译问题), **重新编译** 而不是 fallback 到 TypeScript 路径. 源码在 `tools/dnf-porting-src/` (CMake + MinGW/GCC)
- CI 已配好 Windows/Linux-x64/Linux-arm64 构建: `.github/workflows/build-dnf-extract.yml`
- 见 [[combat-lab-0.3-state]] 当前阶段背景
