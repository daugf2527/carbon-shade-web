# Combat Lab 0.2-R3 Handfeel Pass Notes

This package keeps the 0.2-R3 engineering structure and changes the combat handfeel layer. The goal is not to add more skills; it is to make the existing movement, hit, enemy reaction, launch, down, get-up, armor feedback and room scale closer to a DNF-like baseline.

## Main changes

- Added `HandfeelState` to every actor: reaction timer, down timer and get-up timer.
- Added per-hit `reactionProfile` data: hitstun frames, knockback X/Z, launch velocity, down frames and get-up frames.
- Reworked `ReactionResolver` so hits apply real motion and timers instead of only setting `reactionState`.
- Reworked reaction motion in `CombatKernel`:
  - light/heavy stagger slides and recovers;
  - launch has gravity, falling and landing;
  - landing enters downed;
  - downed enters getting_up;
  - getting_up returns to neutral and grants temporary get-up armor.
- Preserved armor semantics: super armor/building armor can take damage while blocking normal control reactions.
- Tightened the room scale from a long 2400px side-scroller into a small DNF-like room (`x: 48-920`, `z: -110..110`).
- Adjusted enemy AI to align on Z/Y lane before attacking instead of only chasing on X.
- Added visible enemy damage numbers and stronger visual state cues for stagger/launch/down/armor feedback.

## Quick controls

- Move: Arrow keys or WASD
- Normal attack / combo: X or J
- Upward slash: Z or K
- Backstep: hold Down + C/L
- Quick rebound: C/L while downed
- Toggle frenzy: F5
- Reset: F6
- Force bleed: F7
- Run deterministic scenario: F8 or UI button
- Force down player: F9

## Local verification performed in this patch

A lightweight runtime check was executed against the emitted `dist/assets` modules:

- NormalBasic1 produces `light_stagger` and horizontal knockback.
- UpwardSlash produces launch with positive Y motion, then falls into the downed lifecycle.
- Boss/building armor still blocks control reaction while taking damage.
- `runDeterministicScenario()` returns all scenario booleans as true.

Full dependency-based `npm run typecheck`/`npm run build` still depends on installing package dependencies from `package-lock.json`.
