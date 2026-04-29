# Handfeel Fix6 — Normalized Sprite Pipeline

This pass addresses the asset-rendering failures seen in fix5:

- Boss / enemies appeared to flicker or jump because runtime display origin used full-sheet crop x/y.
- Skeleton / downed actors could rotate sideways because container-level fallback rotation was applied to sprite-sheet actors.
- Attack animations could flash because action frames wrapped with modulo during recovery.
- Hit flash was too aggressive because `setTintFill(0xffffff)` turned the whole sprite pure white.

## Runtime changes

1. Uploaded character sheets are preprocessed into fixed-cell Phaser spritesheets under:

   `public/assets/sprites/normalized/`

2. Runtime uses Phaser frame indices through `setTexture(key, frame)`.

3. Runtime no longer uses `setCrop()` on large source sheets.

4. Sprite actors use `origin(0.5, 1)` and stable bottom-center foot anchoring.

5. Action animation selection is clamped at the final frame instead of looping back to frame 0.

6. Container rotation is disabled for sprite-sheet actors; hurt/down/launch poses now come from the animation frames.

7. Hit flash is a light tint instead of full white fill.

## Generated normalized sheets

See:

`public/assets/sprites/normalized/sprite-normalization.json`

## Notes

This pass does not change combat math, hitbox tuning, reaction tuning, or AI. It only fixes the sprite rendering pipeline.
