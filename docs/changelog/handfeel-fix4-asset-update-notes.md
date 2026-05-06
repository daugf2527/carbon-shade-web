# Combat Lab handfeel fix4 asset integration notes

> **Note:** Partially superseded by fix6. The variable crop-box approach from `SpriteFrameLibrary.ts` was upgraded to normalized fixed-cell spritesheets with `setTexture(key, frame)` in the fix6 pass.

- Integrated uploaded player, goblin, skeleton shield, flying imp and minotaur boss sheets.
- Baked checkerboard backgrounds were keyed out into transparent PNG assets.
- Runtime uses variable crop boxes from `src/game/SpriteFrameLibrary.ts`.
- Training ground now spawns goblin, skeleton shield dummy, flying imp, minotaur boss, and building armor target.
