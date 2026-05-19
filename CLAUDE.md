# CLAUDE.md

## Project identity

**Carbon Shade / 碳影** — Phaser 3 + TypeScript 2.5D combat prototype (Vite). Engineering name: **Combat Lab**. Validates DNF-style combat feel: skill execution, monster feedback, boss behavior, normalized sprites, deterministic tests.

## Current state (2026-05-15)

**Phase**: Combat Lab 0.3 — handfeel tuning + evidence freeze.
**Target version**: `70-85-classic-pre-metastasis` (Level 70 cap, 2012 pre-Metastasis). Modern DNF systems excluded.

**Verification gates**: `npm run typecheck` / `npm run static:test` (40/40) / `npm run build` — all passing.

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server on `0.0.0.0:5173` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run static:test` | Compile + run `tests/static/*.test.ts` (Node, no framework) |
| `npm run build` | Production build → `dist/` |
| `npm run browser:smoke` | Playwright smoke test (needs dev server + display) |
| `docker compose up --build` | Container on port 5173 |

## Tools

### dnf-extract (C++ CLI)

Source: `tools/dnf-porting-src/` — builds via CMake + MinGW/GCC.
Binary: `tools/dnf-extract.exe` (Windows pre-built).
CI: `.github/workflows/build-dnf-extract.yml` builds Windows/Linux-x64/Linux-arm64.

**PVF modes** (Script.pvf extraction):
```bash
dnf-extract --pvf Script.pvf --file <internal-path>       # single file → JSON
dnf-extract --pvf Script.pvf --pipe                       # stdin paths, stdout JSON (fast)
dnf-extract --pvf Script.pvf --batch <p1> <p2> ...        # batch extraction
dnf-extract --pvf Script.pvf --workflow                   # stdin JSON commands
dnf-extract --pvf Script.pvf --list [--filter <pattern>]  # list PVF contents
```

**NPK modes** (sprite archive):
```bash
dnf-extract --npk <file.NPK> --list                      # list IMG files
dnf-extract --npk <file.NPK> --img <name> --frame <idx>  # extract single frame
dnf-extract --npk <file.NPK> --img <name> --frames       # all frames metadata (no pixels)
```

**Sprite resolve** (PVF → NPK cross-reference):
```bash
dnf-extract --pvf Script.pvf --npk-dir ImagePacks2/ --resolve <sprite-path> --frame <idx>
```
Resolve auto-tries known PVF↔NPK directory renames (e.g. `equipment/` → `atequipment/`).
On lookup failure: prints `{"type":"error","sprite":"…","error":"sprite not found in any NPK: …"}` and exits 1.

Options: `--with-data` (include base64 pixel data; default off — frame modes return metadata only), `--help`.

I/O contract:
- stdout — one JSON line per result. Top-level `type` field is one of: `animation` (.ani), `document` (.skl / .mob / .atk / .act), `text` (.str), `pvf_list` (--list), `npk` (--npk --list), `img` (--img --frames), `frame` (--frame), `resolved_frame` (--resolve), `error`.
- stderr — `[LOG]` / `[READY]` / `[DONE]` / `[ERROR]` progress lines. Never mixed into stdout.
- `--pipe` / `--workflow` / `--batch` emit `---` between results.

### generate-actions (Node CLI)

`node scripts/generate-actions.mjs --pvf <path> [--skl-filter <pattern>] [--list]`
Parses .skl + .ani from PVF → FrameDataAction JSON. Requires `npm run static:test` first (uses `.tmp/test-js/` compiled modules).

### extract-assets (Node CLI)

`node tools/extract-assets.mjs --pvf <path> [--npk-dir <dir>] [--output <dir>]`
High-level asset extraction pipeline using TypeScript extraction module.

## Architecture

```
src/combat/    — Pure TS combat kernel (no Phaser). Runs in Node for deterministic tests.
src/game/      — Phaser rendering layer (scenes, render adapter, camera, audio, touch).
src/data/      — Versioned JSON manifests (actions, damage, status, AI) + official data.
src/extraction/— DNF client data extraction (PVF/NPK/IMG/ANI/SKL parsers). Node-only.
src/runtime/   — Deterministic combat runtime for scenario verification.
src/vendor/    — Type shims for browser APIs in Node test env.
src/main.ts    — Phaser bootstrap (1920×1080, Scale.FIT).
```

## Coding conventions

- ES modules, `.js` extension in import specifiers (NodeNext resolution).
- PascalCase classes; lowercase domain-qualified data files.
- Two-space indent in JSON. Compact TypeScript style.
- Runtime assets in `public/assets/` referenced by string path.

## DNF/DFO reference truth rule

Priority: Neople Official API > DFO-specific wikis > local tuning baseline.
Never commit `NEOPLE_API_KEY`. Frames/hitboxes/gravity/AI are NOT covered by API — use PVF extraction data.

## Test infrastructure

Tests run via `scripts/static-test.mjs`: TS compiled with `tsconfig.test.json` → `.tmp/test-js/`, each `.test.js` executed as standalone Node child process. Assertions: `node:assert/strict` via `tests/static/test-utils.ts` (exports `ok`, `equal`, `deepEqual` only). No test framework.

## Documentation

`docs/` organized into: `design/`, `engineering/`, `changelog/`, `planning/`, `research/`. See `docs/README.md` for index.

## Git workflow

- Concise imperative commit subjects.
- Run verification before claiming completion.
- Don't edit generated outputs in `dist/`, `.tmp/`, `verification/`.

## Status reporting (statusline)

`.claude/status.json` 驱动 statusline 的 `task` / `conf` 字段。每个新 prompt 由 hook 重置为 `{"progress":"0/?","confidence":"评估中"}`。我应在任务过程中主动写入以反映真实状态：

- **开工后立即** — 拆解步骤数, 写入 `{"progress":"0/N","confidence":"XX%"}` (N=总步数, 信心值是当前对完成方式的把握)
- **每完成一步** — 更新 `progress` 为 `M/N`, 根据进展调整 `confidence`
- **遇到障碍 / 改变方案** — 立刻下调 `confidence` 并在 progress 中体现 (例如 `2/N?`)
- **任务完成** — 写入 `{"progress":"N/N","confidence":"完成"}` 或类似终态

只在多步、有不确定性的任务里维护; 一次性琐碎操作 (单文件编辑、回答问题) 不必更新。

## Known pitfalls

- `test-utils.ts` only exports `ok`/`equal`/`deepEqual`. No `assert.fail()` — use `throw new Error()`.
- FrameDataAction needs double-cast: `action as unknown as Record<string, unknown>`.
- Node built-ins (`node:fs` etc.) unavailable in test tsconfig — import data modules directly.
- Negative `whiffCancelFrom` is intentional (means "can never whiff cancel").
- RagingFury has 10 pillars in code (baseline doc says 8 — trust code).
