# Combat Lab 0.2-R3 Handfeel Fix3 Notes

Base package: `combat-lab-webdemo-0.2-r3-handfeel-fix2`.

This pass focuses on DNF-like handfeel rather than adding game content.

## Implemented changes

1. Added sprite-reference rendering using the user-provided sheets.
   - Player uses the berserker-like sheet for idle, walk, normal attacks, upward slash, hurt and down poses.
   - Grunt uses the goblin sheet.
   - Dummy uses the skeleton sheet.
   - Boss uses the armored minotaur sheet.
   - Building remains a simple blocker/dummy actor.

2. Expanded melee weapon coverage.
   - NormalBasic1: short forward coverage, light stagger.
   - NormalBasic2: longer coverage, medium stagger and kept combo geometry.
   - NormalBasic3: longest coverage, stronger hitstop/recoil and heavy knockback.
   - UpwardSlash: forward + height coverage, stable launch.

3. Strengthened hit reactions.
   - Added impact snap and visual recoil fields to handfeel state.
   - Hit targets now flash and visually lean/snap more clearly.
   - Launch hits have stronger vertical velocity and clearer falling/down/wakeup lifecycle.

4. Reworked armor feedback direction.
   - Armor targets still do not enter ordinary stagger, launch or knockdown.
   - Armor hits now preserve damage numbers, short hitstop, white flash and armor spark.
   - Heavy/armor hits can request small camera shake.

5. Training ground spacing.
   - Spawn points are spread out so player, grunt, dummy, boss and building do not pile up at reset.

6. Debug/logging simplification.
   - Screen debug remains off by default.
   - Added `Export Handfeel Report` button; it exports a compact `handfeel-report.json` with hit, reaction, hitstop and actor summary.

## Run

```bash
npm install
npm run dev
```

For a static build after installing dependencies:

```bash
npm run build
```

## Known constraints

The reference sheets are collages, not clean game atlases, so Fix3 uses cropped regions directly from those images. This is suitable for handfeel validation, not final art integration.

## Final patch note

After the first Fix3 source pass, two source-level issues were corrected before packaging:

- `HandfeelReport` is now exported from `src/combat/types.ts`.
- A duplicate `const building` declaration in `runDeterministicScenario()` was removed.

The sandbox could not complete `npm install`, so run `npm install && npm run dev` locally to validate the Phaser/Vite runtime.
