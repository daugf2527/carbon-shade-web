# Combat Lab 0.2-R3 Handfeel Fix2 Notes

Base: `combat-lab-webdemo-0.2-r3-handfeel-fix1`

## Scope

This pass moves the demo closer to a DNF-like handfeel baseline. It does not add new skills or maps. The focus is the core control and hit-reaction loop:

- direct locomotion instead of Walk/Run frame-data actions;
- attack startup locks facing for hitboxes, slash VFX and root motion;
- DNF-like pushbox priority: player movement is not eaten by soft monsters;
- armor units still show hit feedback while blocking launch/control;
- reaction lifecycle remains explicit: stagger, launch, falling, downed, getting up;
- debug overlay is off by default so handfeel can be evaluated without visual noise.

## Main source changes

- `src/combat/types.ts`
  - Added `LocomotionState` to actors.
  - Added `lockedFacing` to `ActionInstance`.
  - Added `hitFlashRemaining` to `HandfeelState`.

- `src/combat/motion/LocomotionController.ts`
  - New direct movement layer for walk/run.
  - Walk/Run no longer need to occupy `currentAction`.

- `src/combat/kernel/CombatKernel.ts`
  - Movement input now updates locomotion directly.
  - Walk/Run input is consumed as locomotion commands, not actions.
  - Combat actions lock facing on startup.
  - Root motion and hit queries use locked facing.

- `src/combat/motion/PushBoxResolver.ts`
  - Player vs normal enemy is soft occupancy.
  - Player keeps X movement priority against normal enemies.
  - Normal enemies yield lane and lightly yield X.
  - Boss/building remain hard blockers, with Z slide preferred.

- `src/combat/hit/HitResolver2D5.ts`
  - Hitboxes now use `currentAction.lockedFacing`.
  - Reaction profiles are preserved on `HitQuery`.

- `src/combat/reaction/ReactionResolver.ts`
  - Uses locked attack facing for knockback direction.
  - Adds actor flash state on hit.
  - Armor feedback remains non-control but no longer feels like no-hit.

- `src/game/CombatScene.ts`
  - Added visible facing marker on character head.
  - Attack arc uses locked facing.
  - Hit flash is rendered on actors.
  - Debug state labels and overlay are hidden by default; F1 toggles overlay, F2 toggles boxes.

## Known limitation

The packaged `dist` folder is retained from `fix1` as a fallback static build. For testing this fix, run through the source pipeline:

```bash
npm install
npm run dev
```

or rebuild locally after installing dependencies.

