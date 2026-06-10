# Status Manifest Baseline Archive (2026-06-10)

This archive preserves the local-baseline status values that the runtime manifest still ships during P5 combat retirement work.

The goal is narrow: keep provenance pointing at a runtime-neutral artifact while the remaining status values are still baseline data rather than truth-backed extraction.

## Legacy Status Baseline

- `bleed`: `dotDamagePerStack=6`, `maxStacks=5`, `dispelPolicy=death_clear`
- `poison`: `dotDamagePerStack=5`, `maxStacks=5`, `dispelPolicy=death_clear`
- `burn`: `dotDamagePerStack=5`, `maxStacks=5`, `dispelPolicy=death_clear`
- `shock`: `dotDamagePerStack=4`, `maxStacks=5`, `dispelPolicy=death_clear`

## Legacy Burn Splash Baseline

- `burn`: `splashRadius=150`
- `burn`: `splashDamagePerStack=3`

## Legacy Rupture Baseline

- `rupture`: `durationFrames=180`
- `rupture`: `maxStacks=5`
- `rupture`: `dispelPolicy=death_clear`

## Rupture Incoming Damage

- `rupture`: `incomingDirectDamageMultiplierPerStack=0.1`
