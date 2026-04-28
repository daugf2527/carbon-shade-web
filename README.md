# Combat Lab 0.2-R3 Real Implementation Pass

This package replaces the previous token-grep prototype with a typed, module-split combat-kernel implementation. It keeps rendering assets original and placeholder-only.

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
npm run build
npm run static:test
```

The browser screenshot and aggregate verify scripts are intentionally not exposed as npm verification commands because they can hang in local Windows browser-process environments. Use the stable checks above for code validation. The fallback build script compiles TypeScript directly and writes browser-ready ESM into `dist/` so verification artifacts can still be produced offline.

## Services

| Service | Port | Purpose |
|---|---:|---|
| combat-lab | 5173 | Vite development server |

## Implemented R3 acceptance points

- Fixed 60 Hz `FixedStepSimulation`.
- Module-split combat kernel: event bus, input, hit, damage, reaction, armor, status, buff, cooldown, hit stop, recoil, death, debug and replay modules.
- QuickRebound enters on C pressed edge and is maintained only while `BrowserInputState.isHeld("KeyC")` remains true.
- HitStop is actor-level, not global; unrelated actors keep progressing.
- Status DOT damage uses `sourceKind=status_dot` and `reactionPolicy=status_tick_feedback_only` and does not trigger normal hit reaction, HitStop, or Recoil.
- DeathLoop opens and closes a cleanup barrier and blocks later actions from dead actors.
- BuildingArmor allows damage while blocking launch, knockdown, knockback, and grab.
- RagingFury uses shockwave plus eight blood-pillar hit groups.
- Static tests are behavior assertions under `tests/static/`, not token-grep scans.
- Deterministic kernel tests cover required scenario booleans without depending on a headless browser.

## Artifact outputs

- `dist/`
- `.tmp/static-test-results.json`


## Handfeel Fix4 Asset Pass

Integrated the latest uploaded player, goblin, skeleton shield, flying imp and minotaur boss sprite sheets. Runtime visual mapping is in `src/game/SpriteFrameLibrary.ts`; transparent PNG outputs are under `public/assets/sprites/`. Primary run: `npm install && npm run dev`. Static validation: `npm run typecheck`, `npm run static:test`, `npm run build`.
