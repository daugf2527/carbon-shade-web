# Neople API Full Implementation Audit

> Captured: 2026-05-03  
> Source: Neople official Open API  
> Scope: all current DNF/DFO-aligned implementation in `src/`, including actions, input, cooldown/resource, buffs, status, damage, armor/reaction, combo correction, enemy AI, replay/debug, and rendering-facing data.

## Source Boundary

Official API verification is the first golden standard for fields exposed by the API.

Treat as official API facts:

- server, character, job, job grow, skill, item, set item, auction, avatar-market metadata
- skill IDs, skill names, descriptions, required/max level
- per-level `consumeMp`, `coolTime`, `castingTime`
- per-level `optionValue` fields, including damage values, hit counts, range ratios, HP costs, cooldown reduction rates, status chance/duration/damage text, and official special text

Do not treat the API as a full client or server combat-engine dump. The queried API docs expose 35 endpoint groups: server/character/equipment/avatar/creature/oath/mist-assimilation/skill-style/buff-equip/fame/auction/avatar-market/item/set-item/job/skill APIs. They do not expose monster AI scripts, hitbox/hurtbox geometry, startup/active/recovery frames, sprite frame timelines, launch/gravity curves, combo-protection thresholds, server authority rules, or network sync protocol.

API keys must come from local environment variables or a backend proxy. Do not commit keys or query URLs containing keys.

## API Query Context

| Field | Value |
|---|---|
| API base | `https://api.neople.co.kr` |
| API docs | `https://developers.neople.co.kr/contents/apiDocs/df` |
| Job | `귀검사(남)` / Male Slayer |
| `jobId` | `41f1cdc2ff58bb5fdc287be0db2a8df3` |
| Job grow | `眞 버서커` / Neo Berserker |
| `jobGrowId` | `6d459bc74ba73ee4fe5cdc4655400193` |
| Skill list endpoint | `/df/skills/:jobId?jobGrowId=:jobGrowId` |
| Skill detail endpoint | `/df/skills/:jobId/:skillId` |

## Whole-Code Audit Matrix

| Code area | Current implementation | Official API coverage | Verdict |
|---|---|---|---|
| `FrameDataAction.ts`: `RagingFury` | 10 blood-pillar hit groups, 780 tick cooldown, level 1 MP cost 142, local frame windows. | `레이징 퓨리`: `coolTime=13s`, level 1 `consumeMp=142`, `value3=10` blood eruption multi-hit count. | Match for API-exposed cooldown, MP cost, and hit count. Frame windows remain API-not-covered baseline. |
| `FrameDataAction.ts`: `Bloodlust` | Grab branch, grab-immune fallback, 360 tick cooldown, level 1 MP cost 37. | `블러드러스트`: `coolTime=6s`, level 1 `consumeMp=37`; official fields include grab damage, eruption damage, bleeding-target bonus, ungrabbable-target eruption damage; special text includes partial invulnerability and hold/grab. | Match for API-exposed cooldown and MP cost; semantic partial match. Official damage table is not wired yet. |
| `FrameDataAction.ts`: `FrenzyToggle` + `BuffLifecycleSystem.ts` `frenzy` | MP 10, 600 tick cooldown, instant toggle, hardcoded 2% activation HP, 0.5% HP/s upkeep, 10% skill attack, incoming hit recovery multiplier, cooldown reduction modifier 10%. | `프렌지`: level 1 `consumeMp=10`, `coolTime=10s`, `castingTime=0.5s`; level table exposes activation HP, 10-second HP cost, hit rate, hit recovery, basic/skill attack, cooldown reduction, HP absorb cap. Level 1 cooldown reduction `10%`. | MP, cooldown, and cooldown reduction now match API level 1. Remaining Frenzy fields still need full official level-table driving. |
| `CooldownResourceKernel.ts` | Reads `berserker_cooldown_reduction` modifier; Frenzy currently supplies `0.10`. | `프렌지` API exposes cooldown reduction as `value6=10%` in sampled levels. | Match for current cooldown-reduction sample; still needs level table source. |
| `FrameDataAction.ts`: `MountainousWheel` | Three downward slash hit windows + one shockwave, 240 tick cooldown, level 1 MP cost 17; local hold/range not modeled. | `붕산격`: `coolTime=4s`, level 1 `consumeMp=17`, downward attack multi-hit count `value2=3`, shockwave damage, range ratio `128~192%`; special text includes partial invulnerability, hold-to-extend jump/range, Blood Incarnate shockwave, Berserker basic-cancel. | Match for API-exposed cooldown, MP cost, and downward hit count. Hold-to-extend and exact frame/hitbox remain incomplete baseline. |
| `FrameDataAction.ts`: `UpwardSlash` | Launch skill with local frame window/hitbox, local launch velocity, 120 tick cooldown. | `어퍼 슬래쉬`: `coolTime=2s`, damage percent and launch-force percent; special text says Berserker/Asura convert to independent attack. | Match for API-exposed cooldown. Launch force and hitbox remain local baseline. |
| `FrameDataAction.ts`: `Backstep` | 21-frame local root motion, MP cost 1, no cooldown. | `백스텝`: level 1 `consumeMp=1`, `coolTime=null`; special text says Backstep Upgrade can allow use during skill/hit/down and grants separate cooldown/invulnerability. | Match for base MP/no-cooldown fields. Upgrade behavior not implemented. |
| `FrameDataAction.ts`: `QuickRebound` | 180 tick max hold, 18 tick release get-up armor, 300 tick cooldown, MP cost 1. | `퀵 스탠딩`: level 1 `consumeMp=1`, `coolTime=5s`, min invul `0.3s`, max invul `3s`, post-get-up super armor `0.3s`; level 10 max invul `16.5s`, post-get-up armor `0.6s`. | Match for level 1 API-exposed MP, cooldown, max hold, and release armor. Level scaling absent. |
| `FrameDataAction.ts`: `Derange` | 300 tick cooldown and level-1 API modifiers for skill attack, attack/move speed, abnormal resistance, hit recovery, hitstun, recoil, INT decrease, and defense decrease. | `폭주`: level 1 `coolTime=5s`, `castingTime=0.5s`, `value2=34`, `value3=21`, `value4=21`, `value5=100`, `value6=105`, `value7=5`, `value8=5`, `value9=1000`, `value10=50`, `value11=50`. | Match for represented API level-1 fields. Exact animation/cast timing and full level scaling remain incomplete. |
| `FrameDataAction.ts`: `Diehard` | 600 tick cooldown, MP 40, 50% HP gate, 20% max-HP recovery, 31s defense/hit-recovery buff from level-1 API values. | `다이하드`: level 1 `consumeMp=40`, `coolTime=10s`, `castingTime=0.3s`, `value2=20`, `value3=8382`, `value4=8382`, `value5=373`, `value6=31`, `value7=50`. | Match for represented API level-1 fields. Full level scaling and exact cast animation remain incomplete. |
| `BuffLifecycleSystem.ts`: `bloody_cross` | Passive applies level-1 skill attack/base speed and stages at 70/60/50% HP with official speed/evasion values. | `혈십자`: level 1 `value1=28.7`, `value2=5.5`, `value3=5.5`, thresholds `70/60/50`, stage speed/evasion values `11.2/0.5`, `11.6/2.7`, `12/4.5`. | Match for represented API level-1 passive and threshold fields. Full level scaling and evasion runtime integration remain incomplete. |
| `BuffLifecycleSystem.ts`: `vim_and_vigor` / `CombatKernel` RagingFury bleed gating | Only gates RagingFury bleed behind `vim_and_vigor`; status uses local bleed profile. | `혈기왕성`: `Gore Cross` size +10%, bleed chance 100%, bleed duration 7s, bleed damage 14; RagingFury official text says Blood Incarnate acquisition adds bleeding to hit enemies. | Partial. Gating concept matches text, but bleed duration/damage/chance are local baseline and RagingFury-specific values are not level-table driven. |
| `StatusEffectSystem.ts`: bleed/poison/burn/shock/rupture | Fixed 180 tick duration, 30 tick interval, local dot damage, burn splash 150 px, rupture direct-damage multiplier. | Current queried Open API has no standalone status-effect rules endpoint. Some skill/passive descriptions expose status chance/duration/damage for specific skills. Official pages may cover abnormal statuses, but not this API endpoint set. | API-not-covered globally. Existing values are local baseline unless tied to a specific skill API fact or official guide page. |
| `DamageFormula.ts` | Demo formula: base, counter 1.25, critical 1.5, extra multipliers, floor result. | Open API can expose skill option values and character status/equipment data, but not full damage formula, final stat buckets, defense formula, rounding order, or live server calculation pipeline. | API-not-covered / baseline. Do not claim DNF formula fidelity. |
| `ArmorResolver.ts`, `HitDecisionResolver.ts`, `HitRejectionResolver.ts` | Implements same-faction/dead/invulnerable/damage immune/already-hit/downed rejection, grab decisions, control-blocking armor, boss/building armor feedback. | Skill API does not expose armor resolver rules. Official update/guide pages may mention invincibility, hold, super armor, counter, grab-immune, down/aerial training targets. | API-not-covered by skill API. Needs official page audit for armor terminology; current exact logic remains baseline. |
| `ComboCorrection.ts` and recent combo reset/stand knockdown/forced wake/damage scale | Local PVE combo-protection model: 180F reset, gauges, forced wake 8F invulnerable, protected target damage scale. | No Open API endpoint exposes combo-protection gauges, thresholds, forced wake frame count, or damage-scaling curves. | API-not-covered. Must remain calibrated baseline until official page/data source supports it. |
| `BrowserInputState.ts` / `CommandInputParser` | Local keyboard mapping: X/J normal, Z/K UpwardSlash, down-up-Z RagingFury, forward-forward-Z Bloodlust, down-C Backstep, C QuickRebound/Jump. | Open API does not expose keyboard command inputs. Official guide/update pages may expose operation semantics, not via skill detail API. | API-not-covered. Keep as operation baseline unless official guide page backs a mapping. |
| `LocomotionController`, `RunCommandDetector`, `PushBoxResolver` | Local walk/run, double-tap run, soft/hard pushbox rules. | Open API has no locomotion, room collision, or pushbox endpoint. | API-not-covered baseline. |
| `EnemyAI.ts` and `enemyTuning.ts` | Local demo AI states, HP, damage, armor, ranges, speed, windup/recovery. | Open API docs have no monster database/AI script endpoint in the exposed DNF endpoint list. | API-not-covered baseline. |
| `ReplayRecorder`, `DebugOverlay`, event bus | Deterministic local observability/replay infrastructure. | Open API has no replay/debug/event schema endpoint. | API-not-covered; this is project infrastructure, not official DNF truth. |
| `SpriteFrameLibrary.ts`, Phaser scenes, normalized sprites | Original/placeholder sprite mapping and local frame index selection. | Open API has no NPK/ANI/sprite frame endpoint. | API-not-covered. Must remain original assets/baseline rendering per source policy. |
| Debug actions: `ForceDownPlayer`, `ForceBleed`, `SpawnTargets`, `RunScreenshotScenario`, `EnemyBasic` | Lab-only controls and enemy attack. | Not official skills in queried job skill list. | Not official API targets. Must not be treated as DNF skills. |

## Implemented Actions vs Official Skill Mapping

| Local action | Official mapping | API status |
|---|---|---|
| `NormalBasic1/2/3`, `DashAttack`, `JumpAttack` | Indirectly related to `기본기 숙련` and operation semantics | API exposes basic/dash/jump attack power change rates, but not normal attack frame chain or hitboxes. |
| `Jump` / `Run` / `Walk` | Movement/operation behavior | Not exposed by skill API. |
| `FrenzyBasic1/2/3` | Frenzy-modified basic attacks, plus `광기` passive text about repeated first/second attacks | Current implementation uses three-hit custom chain; official API text says Madness can change basic attack to repeat first/second attacks. Needs dedicated audit before claiming match. |
| `UpwardSlash` | `어퍼 슬래쉬` | API-covered for cooldown, damage percent, launch force percent. |
| `MountainousWheel` | `붕산격` | API-covered for cooldown, MP, 3-hit downward count, shockwave, range, special text. Cooldown/MP/downward hit count now match; hold-to-extend and damage table remain incomplete. |
| `RagingFury` | `레이징 퓨리` | API-covered for cooldown, MP, shockwave/blood damage, 10 hits. Cooldown/MP/hit count now match; damage table remains incomplete. |
| `Bloodlust` | `블러드러스트` | API-covered for cooldown, MP, grab/fallback damage and special text. Semantic partial; values missing. |
| `Backstep` | `백스텝` | API-covered for MP and upgrade special text; no cooldown. Partial. |
| `QuickRebound` | `퀵 스탠딩` | API-covered for cooldown, MP, min/max invul, release super armor. Level 1 values now match; level scaling remains incomplete. |
| `Derange` | `폭주` | API-covered. Level 1 represented fields now match; full level scaling remains incomplete. |
| `Diehard` | `다이하드` | API-covered. Level 1 represented fields now match; full level scaling remains incomplete. |

## Priority Fix List

1. Add sanitized official API snapshots for the mapped skills above. Include endpoint, capture date, `jobId`, `jobGrowId`, skill ID, and response hash. Do not include API keys.
2. Add static tests that compare current runtime data against official API-backed facts:
   - These checks currently live in `tests/static/official-api-alignment.test.ts` for RagingFury, Bloodlust, MountainousWheel, QuickRebound, Backstep, Frenzy, Derange, Diehard, and BloodyCross level-1 facts.
3. Split data into:
   - `officialSkillFacts`: API-backed skill metadata and level values.
   - `localFrameTuning`: frame windows, hitboxes, launch/gravity, hitstop/recoil.
   - `sourcePolicy`: `official_api`, `official_page`, `local_calibrated_baseline`, `lab_debug_only`.
4. Re-label API-uncovered systems in code/docs so they are not confused with official truth: combo correction, armor resolver internals, AI tuning, replay/debug, sprite frame mapping, damage formula, hitbox geometry.

## Bottom Line

Across all current code, official API validation finds a narrow set of confirmed matches and a larger set of mismatches or unverified baseline values.

Confirmed or partially confirmed:

- `RagingFury` uses the official API-exposed 10 blood-eruption hit count.
- `Bloodlust` has the broad official grab/fallback semantic shape.
- `QuickRebound` level 1 max hold and release super armor numbers happen to match the API values of 3s and 0.3s.

Remaining major mismatches:

- Frenzy/Derange/Diehard/BloodyCross now have selected official level-1 facts wired, but are not yet full level-table driven.
- Bloodlust/RagingFury/MountainousWheel official damage tables are not wired into damage calculation.
- QuickRebound level scaling is not implemented.
- Many implemented DNF-style systems are local baselines because Open API does not expose their true client/server data.
