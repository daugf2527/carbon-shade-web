# Handfeel Fix 1 Notes

This patch targets three playtest issues reported after the handfeel pass:

1. Normal attacks pushed the player backward when overlapping monsters.
   - Fixed by changing player/enemy pushbox resolution to soft collision.
   - The player is no longer displaced backward by normal monsters during attacks.
   - Buildings remain hard blockers, but they prefer lane slide instead of X-axis shove-back.

2. Horizontal movement did not reliably turn the character or start the expected walk action.
   - Fixed the movement gate in `CombatKernel.applyMovementFromHeldInput()`.
   - Left/right held input now starts `Walk` and updates player facing.
   - Attack direction is now based on the current facing at action request time.

3. Attacks looked like they always pointed one way.
   - The source renderer now draws the weapon arc according to `model.facing`.
   - This makes left-facing attacks visually read as left-facing instead of always right-facing.

Verification performed in this sandbox:

- Imported the built dist kernel and checked horizontal movement:
  - ArrowLeft: facing=left, action=Walk.
  - ArrowRight: facing=right, action=Walk.
- Checked overlapping player/grunt during `NormalBasic1`:
  - Player X no longer moves backward.
  - Grunt is nudged instead.

Note: full Vite/TypeScript dependency verification was not rerun because this sandbox package does not include `node_modules`. Source and dist kernel/pushbox files were patched directly.
