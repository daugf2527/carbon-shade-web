# Repository Guidelines

## Project Structure & Module Organization

This is a Phaser 3 + TypeScript combat sandbox served by Vite. Core source lives in `src/`: `src/main.ts` boots the browser app, `src/game/` owns Phaser scenes and rendering adapters, `src/combat/` contains the combat kernel and systems, and `src/data/` stores action, actor, AI, and tuning data. Browser/runtime shims are in `src/vendor/` and `src/runtime/`.

Static behavior tests are under `tests/static/`; runtime JavaScript checks are under `tests/static-js/`. Public art and JSON metadata live in `public/assets/`, with normalized sprite outputs in `public/assets/sprites/normalized/`. Build and verification artifacts are written to `dist/`, `.tmp/`, and `verification/`.

## Build, Test, and Development Commands

- `npm install`: install dependencies. Node `>=20` is required.
- `npm run dev`: start Vite on `0.0.0.0:5173`.
- `npm run typecheck`: run TypeScript checks through `scripts/typecheck.mjs`.
- `npm run build`: compile TypeScript and emit `dist/index.html` plus browser ESM assets.
- `npm run static:test`: compile and run `tests/static/*.test.ts`.
- `docker compose up --build`: run the app container on port `5173`.

## Coding Style & Naming Conventions

Use TypeScript ES modules with explicit `.js` import specifiers for local compiled imports. Keep two-space indentation in JSON; follow the existing compact TypeScript style when editing nearby code. Class and scene files use PascalCase, for example `CombatKernel.ts` and `BootScene.ts`. Data modules use domain-qualified lowercase names such as `berserker.normal.ts`. Keep runtime assets and metadata names stable because tests and loaders reference them by path.

## Testing Guidelines

Place behavior assertions in `tests/static/` with the `*.test.ts` suffix and use `tests/static/test-utils.ts` for `node:assert/strict`. Prefer deterministic kernel-level checks over visual-only assertions. For rendering or handfeel changes, run `npm run typecheck`, `npm run static:test`, and `npm run build`; browser screenshot verification is not a required npm path in this repository.

## Commit & Pull Request Guidelines

This exported directory does not include `.git`, so no local commit history is available to infer a project-specific format. Use concise imperative commit subjects, for example `Fix normalized sprite frame clamp`. PRs should include the change scope, commands run, verification artifacts touched, and screenshots or replay/report JSON when visual behavior changes.

## Agent-Specific Instructions

Before claiming completion, run the relevant verification command and summarize the observed result. Do not edit generated outputs in `dist/`, `.tmp/`, or `verification/` unless the task explicitly concerns verification artifacts.
