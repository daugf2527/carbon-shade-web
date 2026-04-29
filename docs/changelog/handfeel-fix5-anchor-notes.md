# Combat Lab 0.2-R3 Handfeel Fix5 — Sprite Anchor Patch

Base: `combat-lab-webdemo-0.2-r3-handfeel-fix4-assets`

## Fixed

- Corrected Phaser cropped-image anchoring. `Image#setCrop()` does not recenter the display origin to the cropped rectangle; it keeps origin coordinates in the full source texture.
- Actor sprites now anchor by each cropped frame bottom-center using `setDisplayOrigin(crop.x + crop.w / 2, crop.y + crop.h)`.
- This fixes player/enemy/boss sprites appearing far above or offset from their labels, HP bars, shadows, and logic foot positions.

> **Note:** This fix was superseded by the normalized sprite pipeline in fix6, which replaced `setCrop()` + `setDisplayOrigin()` with fixed-cell Phaser spritesheets and `setTexture(key, frame)`.

## Not changed

- No combat tuning changes.
- No hitbox changes.
- No generated image assets.
