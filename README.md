# 碳影 / Carbon Shade

> 万般皆有定数，归来仍需问心。

**Carbon Shade / 碳影** is a 2.5D web combat prototype about borrowed power, AI-era agency, consequence, and the road back to one's own way.

当前工程原型名为 **Combat Lab**。它负责验证类 DNF 的 2.5D 战斗手感、技能释放、怪物反馈、Boss 表现、素材规范化与静态行为测试。项目总名定为 **碳影 / Carbon Shade**。

正式仓库名 / Pages 路径标准：`carbon-shade-web`。

## DNF Reference Truth Standard

When implementing or reviewing DNF/DFO-aligned combat behavior, **Neople official API verification is the first golden standard** for any field it exposes. DFO-specific wiki references such as DFO World are the second golden standard for fields that official API/pages do not expose, after checking freshness and conflicts.

Priority order:

1. Neople official Open API and official Nexon/Neople update/guide pages.
2. Locally archived official-API snapshots with provenance, API path, captured date, and source version.
3. DFO-specific wiki/reference pages such as DFO World for skill semantics, public level tables, command notes, and general mechanic descriptions not exposed by official sources.
4. General encyclopedias such as Wikipedia only for background context, release/server history, terminology, publisher/developer identity, and broad chronology. Do not use Wikipedia for combat numbers, frame data, hitboxes, damage formulas, skill scaling, AI behavior, or live balance values.
5. Clean-room local baseline tuning in `docs/design/tuning-baseline.md`.

Important boundary: the official API can validate skill IDs, job trees, descriptions, level tables, cooldowns, MP costs, option values, hit-count fields, and official text. It does **not** by itself provide full client frame truth such as startup/active/recovery frames, hitbox/hurtbox geometry, launch/gravity curves, combo-protection thresholds, server authority logic, or network sync protocol. Those must be marked as calibrated baseline unless backed by another official source.

Wiki data must be cited with page URL, accessed date, and conflict status. If it conflicts with official API or official pages, official sources win.

Never commit API keys. Use `NEOPLE_API_KEY` only from local environment variables or a backend proxy.

## Project direction

《碳影》是一款关于借力、成长、代价与归途的 2.5D 战斗养成寓言。

表层是明亮、积极、可玩的战斗成长世界：角色、小怪、Boss、技能、连招、受击、击退、硬直、副本推进、装备掉落与成长反馈。

深层则是 AI 时代的人与外智：现实任务可以通过外部智能、工具、插件、MCP、Skill、代码环境等能力完成，成果回流为角色经验、技能、装备和副本进度。但外智不是白给的，借智有债，代役留责。真正要面对的不是工具强不强，而是人在万般术数之中是否还能守住本心，找到自己的归途。

Key identity docs:

- `docs/00-project-mainline-v0.1.md` — mainline world/theme draft
- `docs/02-project-identity-v0.2.md` — naming and positioning baseline

## How to run

```bash
npm install
npm run dev
# open http://localhost:5173
```

Docker:

```bash
docker compose up --build
```

## Verification

```bash
npm run typecheck
npm run static:test
npm run build
```

The browser screenshot and aggregate verify scripts are intentionally not exposed as npm verification commands because they can hang in local Windows browser-process environments. Use the stable checks above for code validation. The fallback build script compiles TypeScript directly and writes browser-ready ESM into `dist/` so verification artifacts can still be produced offline.

## Services

| Service | Port | Purpose |
|---|---:|---|
| carbon-shade-web | 5173 | Vite development server |

## Current prototype scope

This prototype replaces the previous token-grep prototype with a typed, module-split combat-kernel implementation. It keeps rendering assets original and placeholder-only.

Implemented R3 acceptance points:

- Fixed 60 Hz `FixedStepSimulation`.
- Module-split combat kernel: event bus, input, hit, damage, reaction, armor, status, buff, cooldown, hit stop, recoil, death, debug and replay modules.
- QuickRebound enters on C pressed edge and is maintained only while `BrowserInputState.isHeld("KeyC")` remains true.
- HitStop is actor-level, not global; unrelated actors keep progressing.
- Status DOT damage uses `sourceKind=status_dot` and `reactionPolicy=status_tick_feedback_only` and does not trigger normal hit reaction, HitStop, or Recoil.
- DeathLoop opens and closes a cleanup barrier and blocks later actions from dead actors.
- BuildingArmor allows damage while blocking launch, knockdown, knockback, and grab.
- RagingFury uses shockwave plus ten blood-pillar hit groups, matching the official API-exposed hit count.
- Static tests are behavior assertions under `tests/static/`, not token-grep scans.
- Deterministic kernel tests cover required scenario booleans without depending on a headless browser.

## Artifact outputs

- `dist/`
- `.tmp/static-test-results.json`

## Handfeel Fix4 Asset Pass

Integrated the latest uploaded player, goblin, skeleton shield, flying imp and minotaur boss sprite sheets. Runtime visual mapping is in `src/game/SpriteFrameLibrary.ts`; transparent PNG outputs are under `public/assets/sprites/`. Primary run: `npm install && npm run dev`. Static validation: `npm run typecheck`, `npm run static:test`, `npm run build`.
