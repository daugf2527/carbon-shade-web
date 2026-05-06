# Official API + DFO Wiki Whole-Code Audit

> Captured: 2026-05-03  
> Scope: all DNF/DFO-facing implementation under `src/` and the current static tests.  
> Evidence order: Neople official API / official pages first, DFO-specific wiki references such as DFO World second, clean-room local baseline last.

## Evidence Boundary

Official API is authoritative for exposed skill metadata: job/skill IDs, skill names, descriptions, `consumeMp`, `coolTime`, `castingTime`, level `optionValue`, hit-count fields, and official text.

DFO-specific wiki/reference pages are the second golden standard only where official sources do not expose a field. They are useful for skill command notes, public level tables, status-effect descriptions, PvP mechanic shape, and semantic behavior. They are not sufficient proof for exact startup/active/recovery frames, hitbox/hurtbox coordinates, Y/Z-axis per-frame ranges, server authority, sync protocol, or live damage rounding.

General Wikipedia is background-only. It should not be used for combat values.

## Sources Checked

Official API:

- `https://developers.neople.co.kr/contents/apiDocs/df`
- `/df/skills/{maleSlayerJobId}/{skillId}` for Upward Slash, Mountainous Wheel, Raging Fury, Bloodlust, Frenzy, Derange, Diehard, Bloody Cross, Vim and Vigor, Quick Standing, Backstep.

DFO wiki/reference:

- `https://wiki.dfo.world/view/Raging_Fury`
- `https://wiki.dfo.world/view/Bloodlust`
- `https://wiki.dfo.world/view/Frenzy`
- `https://wiki.dfo.world/view/Derange`
- `https://wiki.dfo.world/view/Diehard`
- `https://wiki.dfo.world/view/Bloody_Cross`
- `https://wiki.dfo.world/view/Quick_Rebound`
- `https://wiki.dfo.world/view/Status_Effects`
- `https://wiki.dfo.world/view/PvP_Mechanics`

## Whole-Code Matrix

| Area | Files | Official API verdict | DFO wiki verdict | Code verdict |
|---|---|---|---|---|
| Skill action metadata | `src/combat/actions/FrameDataAction.ts`, `src/combat/resources/CooldownResourceKernel.ts` | API level 1 cooldown/MP/hit-count facts are now represented for UpwardSlash, MountainousWheel, RagingFury, Bloodlust, Frenzy, QuickRebound, Backstep, Derange, Diehard. | Wiki broadly agrees on semantics but conflicts on some stale cooldown values, so API wins. | **Pass for represented API facts.** Frame windows, hitboxes, cancel windows, hitstop/recoil remain local baseline. |
| RagingFury | `FrameDataAction.ts`, `src/data/tuning/dnf-berserker-baseline.ts`, tests | API: 13s CD, MP 142, blood eruption hit count 10. | Wiki exposes 10-hit blood pillar behavior but may have stale cooldown. | **Pass after this audit.** Fixed stale `src/data/tuning/dnf-berserker-baseline.ts` from 8 to 10 pillar frames. Official damage table still not wired. |
| Bloodlust | `FrameDataAction.ts`, `CombatKernel.ts`, tests | API: 6s CD, MP 37, grab/eruption/ungrabbable-target values exposed. | Wiki supports command/semantic shape: grab target, fallback on ungrabbable targets, bleed interaction. | **Partial pass.** CD/MP and branch semantics present. Official damage values and exact hold/cast/invulnerability behavior are still local. |
| MountainousWheel | `FrameDataAction.ts` | API: 4s CD, MP 17, downward multi-hit count 3, range ratio fields. | Wiki-like public skill references support hold/range semantics but not exact runtime frames. | **Partial pass.** CD/MP/3-hit downward count match. Hold-to-extend jump/range and official damage table are not wired. |
| QuickRebound | `FrameDataAction.ts`, `CombatKernel.ts` | API level 1: MP 1, 5s CD, min invul 0.3s, max invul 3s, release armor 0.3s. | Wiki supports dungeon invulnerability/armor duration and PvP split. | **Pass for level 1 PVE facts.** Higher-level scaling and PvP profile are not implemented. |
| Frenzy | `FrameDataAction.ts`, `BuffLifecycleSystem.ts`, `CooldownResourceKernel.ts` | API level 1: MP 10, CD 10s, casting 0.5s, cooldown reduction 10%; level table exposes HP cost/upkeep, hit rate, hit recovery, skill attack, HP absorb cap. | Wiki has useful semantics but stale/conflicting 20% cooldown reduction; API wins. | **Partial pass.** MP/CD/CD reduction now match API; skill attack, HP drain, hit recovery, and kill heal are still simplified and not full level-table driven. |
| Derange | `FrameDataAction.ts`, `BuffLifecycleSystem.ts`, `CombatKernel.ts` | API level 1 exposes 5s CD, 0.5s casting, skill attack, speed, resistance, hit recovery, hitstun/recoil, INT and defense penalties. | Wiki semantics align with buff behavior. | **Partial pass.** Level-1 modifiers are replay-visible; cast timing, duration level table, and deeper stat integration are incomplete. |
| Diehard | `FrameDataAction.ts`, `BuffLifecycleSystem.ts`, `CombatKernel.ts` | API level 1 exposes MP 40, 10s CD, 0.3s casting, 50% HP threshold, 20% max-HP recovery, 31s duration, defense/hit-recovery values. | Wiki semantics align: low-HP healing/defense/recovery. | **Partial pass.** Low-HP gate and level-1 buff/heal are implemented. Cast animation and full level scaling are incomplete. |
| BloodyCross | `BuffLifecycleSystem.ts`, `CombatKernel.ts` damage multipliers | API level 1 exposes skill attack 28.7%, base speed, 70/60/50 HP stages and speed/evasion values. | Wiki supports low-HP staged passive behavior. | **Partial pass.** Thresholds and level-1 modifiers are represented. Evasion and movement/attack-speed runtime effects are not fully integrated. |
| Vim and Vigor / bleed gating | `BuffLifecycleSystem.ts`, `CombatKernel.ts`, `StatusEffectSystem.ts` | API level 1 exposes Gore Cross size +10%, bleed chance 100%, duration 7s, bleed damage 14; skill text says post-class skills gain bleeding. | Wiki supports blood/bleed relationship. | **Improved partial.** Eligible implemented Berserker post-class hit skills now include Vim and Vigor bleed with 420F duration and damage 14; the eligible-skill list still needs data-driven expansion as more skills are implemented. |
| Status effects | `StatusEffectSystem.ts`, `types.ts` | No global status endpoint in checked API; some skill/passive APIs expose status-specific fields. | DFO wiki describes Bleed 3s/0.5s, Poison 5s/0.5s, Burn 5s/0.5s with splash, Shock 10s split behavior, Rupture max stack behavior, Super Armor/Invincibility semantics. | **Improved partial.** Bleed/Poison/Burn/Shock duration and tick cadence now follow wiki shape. Shock triggered/split damage and Rupture semantics remain local/future. |
| Damage formula | `DamageFormula.ts`, `DamageResolver.ts`, `CombatKernel.ts`, `src/data/official/berserkerSkillFacts.ts` | API gives skill option values but not full damage formula or rounding order. | Wiki pages provide skill tables and some status behavior, not the full modern damage formula. | **Improved evidence layer.** Official level-1 damage option values are archived as structured skill facts. Runtime formula is still demo-grade: base * counter/crit/extra multipliers. Do not claim DNF damage fidelity until full formula buckets are modeled. |
| Hitboxes / hurtboxes / geometry | `HitResolver2D5.ts`, `FrameDataAction.ts`, `ActorFactory.ts` | Not exposed by API. | Wiki does not provide per-frame hitbox/hurtbox coordinates. | **Baseline only.** Current rect/circle/grab_attach/sweep schema is useful, but coordinates are not official. Needs PVF/ANI/NPK or frame analysis. |
| Reaction, launch, gravity, downed rules | `ReactionResolver.ts`, `ReactionProfiles.ts`, `ReactionHandfeelApplier.ts`, `ComboCorrection.ts` | Not exposed by API. | PvP Mechanics describes Stand/Aerial/Down, gravity/damage limits, recovery/evasion bonuses, and reset shape, but not exact PVE curves. | **Baseline with wiki-shaped semantics.** Current PVE combo correction is intentionally local; do not claim exact official thresholds. |
| Armor, grab, invulnerability rejection | `ArmorResolver.ts`, `GrabResolver.ts`, `HitDecisionResolver.ts`, `HitRejectionResolver.ts` | Skill text may mention invulnerability/hold/super armor, but API does not expose resolver rules. | Status wiki describes Super Armor and Invincibility at a semantic level. | **Semantic partial.** `target_invulnerable`, grab immunity, boss/building armor are reasonable abstractions, not official exact resolver. |
| Input and commands | `BrowserInputState.ts`, `RunCommandDetector.ts`, `src/data/commands/berserker.commands.ts` | API does not expose command inputs. | Skill wiki pages expose some command notes such as Bloodlust `forward, forward + Z` and RagingFury/Berserker conventions. | **Partial.** Bloodlust and RagingFury command shapes align. Frenzy/Derange/Diehard are still debug/request actions, not fully player command-mode accurate. |
| Locomotion / pushbox / root motion | `LocomotionController.ts`, `MovementInputProvider.ts`, `PushBoxResolver.ts`, `RootMotionController.ts` | Not exposed by API. | Wiki has operation-level descriptions, not numeric movement/pushbox truth. | **Baseline only.** Requires client data or video calibration. |
| Enemy AI and tuning | `EnemyAI.ts`, `EnemyAIState.ts`, `src/data/ai/enemyTuning.ts`, `src/data/actors/*` | No checked API endpoint exposes monster AI scripts or demo enemy tuning. | Wiki does not provide exact AI scripts/weights for this local demo enemy set. | **Original demo baseline.** Do not present as DNF monster AI. |
| Replay/debug/event schema | `ReplayRecorder.ts`, `CombatEventBus.ts`, `CombatEventType.ts`, `DebugOverlay.ts`, `LastHitTrace.ts` | Not official game data. | Wiki does not define local observability schema. | **Project infrastructure.** Keep for deterministic QA, not DNF fidelity. |
| Rendering/sprites/VFX/audio | `src/game/*`, `SpriteFrameLibrary.ts`, `RenderAdapter.ts`, `AudioUnlockGate.ts` | API does not expose NPK/ANI frames, anchors, sounds, effects, or sprites. | Wiki images/video may illustrate behavior but not asset/frame truth. | **Placeholder/original rendering.** Needs legal asset pipeline or original art; never claim official asset fidelity. |

## High-Priority Findings

1. `src/data/tuning/dnf-berserker-baseline.ts` had stale RagingFury pillar frames. Fixed from 8 entries to 10 entries in this audit.
2. Status profiles have been partially calibrated to wiki duration/tick cadence. Remaining work: Shock triggered/split damage and Rupture source-policy semantics.
3. Vim and Vigor bleed is no longer RagingFury-only for implemented eligible Berserker skills. Remaining work: move the eligible-skill list into data and expand it as more post-class skills are implemented.
4. Official damage option values are archived in `src/data/official/berserkerSkillFacts.ts` but are not used as final runtime damage yet. Current hit `baseDamage` values remain local handfeel tuning until the full formula and stat buckets are implemented.
5. Input commands are only partial. Bloodlust/RagingFury align with public command shape; Frenzy/Derange/Diehard lack player-facing command/profile work.
6. Frame truth, hitbox truth, gravity curves, protection thresholds, AI, server authority, network sync, and NPK/ANI/PVF asset data remain unsolved by official API and wiki. They require PVF/SKL/ANI/NPK extraction or frame-by-frame gameplay/video calibration.

## Recommended Next Batches

1. Status calibration batch: update `StatusEffectSystem.ts` and static tests using DFO World status-effect pages as second-golden evidence, while marking API gaps.
2. Vim and Vigor batch: make bleed application data-driven for eligible Berserker post-class skills, not hardcoded only for RagingFury.
3. Damage table batch: add sanitized official API skill facts and map represented `optionValue` damage/hit-count fields to local actions without claiming final DNF formula fidelity.
4. Command/profile batch: split debug actions from player-facing commands and add command tests for Frenzy/Derange/Diehard only if a reliable wiki/official command source is available.
5. Data provenance batch: convert hand-authored action constants into `officialSkillFacts` plus `localFrameTuning` modules so API/wiki facts cannot silently drift from runtime data.
