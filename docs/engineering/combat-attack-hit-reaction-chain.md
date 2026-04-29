# Combat attack / hit / reaction chain

> Status: implementation-facing note for the current Combat Lab kernel.  
> Scope: how a player or enemy action becomes a hit, damage, reaction, feedback, and cleanup.

## 1. Kernel frame model

Combat simulation advances through `FixedStepSimulation` at 60 Hz. Phaser renders and forwards elapsed browser time, but the combat truth lives in `CombatKernel.tick()`.

Each tick follows this broad order:

```text
TickStarted
  → hitstop / recoil timers
  → collectInput
  → consumeInput
  → locomotion
  → enemy AI
  → update action local frames
  → root motion
  → pushbox resolution
  → hit queries and decisions
  → reaction motion
  → status / buff / cooldown ticks
  → death checks
  → TickEnded
  → event flush
  → replay record
```

## 2. Input to action

Browser keys first enter `BrowserInputState` as `held`, `pressed`, and `released`. `CommandInputParser` turns button edges and command sequences into `BufferedInput` records. `RunCommandDetector` separately handles walk/run intent from direction taps.

`CombatKernel.consumeInput()` pulls the highest-priority allowed input from `InputBuffer`. It then maps context-sensitive commands:

```text
NormalBasic1 while jumping  → JumpAttack
NormalBasic1 while running  → DashAttack
NormalBasic1 during frenzy  → FrenzyBasic1
NormalBasic1 during combo   → NormalBasic2 / NormalBasic3
FrenzyBasic1 during combo   → FrenzyBasic2 / FrenzyBasic3
```

`requestAction()` is the single action gate. It rejects dead actors, enforces cancel policy, checks cooldowns and resources, locks facing, and creates `actor.currentAction`.

## 3. Action frame data

`FrameDataAction` is the source of truth for committed attacks. It defines:

```text
totalFrames
startup / active / recovery windows
cancelPolicy
hitStopProfile
recoilProfile
rootMotion
costProfile / cooldownProfile
feedbackProfile
```

Every active hitbox window defines its 2.5D box, base damage, hit type, attack level, control power, downed/grab/launch rules, and optional reaction profile override.

## 4. Active frames to HitQuery

`updateActions()` advances `currentAction.localFrame` unless the actor is frozen by hitstop. `resolveHitQueries()` only examines actors with a current action, a live body, and no hitstop freeze.

For every active hitbox whose `start <= localFrame <= end`, `HitResolver2D5.buildQuery()` converts local frame-data offsets into a world-space query:

```text
query.x = attacker.x + hitbox.offsetX * facingSign
query.z = attacker.z + hitbox.offsetZ
query.y = attacker.y + hitbox.offsetY
```

The query is then compared against each target's hurtbox through 2.5D overlap checks.

## 5. HitDecision

`HitDecisionResolver` combines geometry, faction, death state, invulnerability, damage immunity, hit-group history, downed rules, grab rules, armor rules, counter state, and back-attack state.

The hit rejection rules are factored into `HitRejectionResolver` so the rejection contract can be tested and expanded independently.

Important rejected reasons include:

```text
same_faction
target_dead
target_invulnerable
damage_immune
z_mismatch
y_mismatch
already_hit_in_group
downed_not_allowed
out_of_active_frame
```

Armor is resolved by `ArmorResolver`. Building armor and boss super armor can allow damage while blocking control, turning launch/knockdown into `armor_feedback_only`.

## 6. Damage

`DamageResolver.requestFromHit()` turns an accepted `HitDecision` into a `DamageRequest`. `DamageResolver.apply()` delegates multiplier math to `DamageFormulaResolver`, then applies HP loss to the target.

The current formula is intentionally small:

```text
base damage
× counter multiplier, if eligible
× back-attack multiplier, if eligible
× critical multiplier, if eligible
```

This keeps the future equipment/stat/element/resistance expansion point in `DamageFormulaResolver` instead of hiding it inside direct HP mutation.

## 7. Reaction

`ReactionResolver.resolve()` decides the final reaction:

```text
armor finalReaction, if present
else canLaunch     → launch
else canKnockdown  → downed
else attackLevel≥2 → heavy_stagger
else               → light_stagger
```

`ReactionProfiles` owns default reaction numbers such as hitstun, knockback, launch velocity, down frames, and get-up frames. Hitbox-specific `reactionProfile` can override these values.

`ReactionHandfeelApplier` owns reaction handfeel state: hit flash, visual recoil duration, reaction remaining frames, down remaining frames, and get-up remaining frames.

Non-armor reactions interrupt the target's current action and locomotion. `armor_feedback_only` preserves control and zeroes physical knockback/launch velocity.

## 8. Hitstop and recoil

Hitstop is actor-level, not global. On normal hits, only the attacker and victim are frozen. Other actors keep moving.

Recoil is attacker-side lockout. It does not tick down while that attacker is also frozen by hitstop, so hitstop and recoil compose instead of racing each other.

## 9. Feedback

The kernel does not draw sparks or numbers directly. It emits feedback events:

```text
DamageNumberRequested
VfxRequested
CameraShakeRequested
ReactionApplied
HitConfirmed
ArmorHit
```

`CombatScene` listens to these events and creates sound, hit sparks, armor sparks, damage numbers, player hit flashes, and camera shake.

## 10. Death and cleanup

When HP reaches zero, `DeathLoop.kill()` marks the actor dead, changes reaction to `dead`, interrupts current action, clears active hitboxes, emits death events, and uses a cleanup barrier so unrelated later events cannot keep acting on the dead actor during the same cleanup chain.

## 11. Status DOT chain

Status damage uses the same `DamageResolver` but a different reaction policy. Bleed ticks use:

```text
sourceKind = status_dot
reactionPolicy = status_tick_feedback_only
```

This means DOT can reduce HP and request damage numbers without triggering normal hit reaction, hitstop, recoil, or action interruption.

## 12. Regression coverage

`tests/static/combat-chain-regression.test.ts` protects the current main chain:

```text
NormalBasic1 accepted hit → damage → light stagger → action interrupt
UpwardSlash vs boss armor → damage-allowed armor feedback, no launch velocity
Repeated hit group → already_hit_in_group rejection
Bleed DOT → HP loss without normal reaction interruption
```

Future recommended tests:

```text
RagingFury multi-hit group coverage
Bloodlust grab success/failure matrix
Building armor damage-without-control case
QuickRebound held/released invulnerability window
Hitstop actor-level isolation across unrelated actors
```
