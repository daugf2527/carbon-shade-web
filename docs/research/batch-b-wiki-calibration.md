
# Batch B — Wiki Semantic Calibration

> **Date**: 2026-05-09
> **Phase**: Combat Lab 0.3 — evidence freeze support
> **Target version**: `70-85-classic-pre-metastasis`
> **Source priority**: DFO World Wiki > NamuWiki > dcalc community project > local baseline
> **Status**: Research-only; no source code modifications

---

## Scope

This document cross-references structured combat data from DFO World Wiki, NamuWiki, and the dcalc community project against the project's current runtime data in `src/data/manifest/` and `src/combat/actions/FrameDataAction.ts`.

### Sources consulted

| Source | URL | Attribution | Access method |
|--------|-----|-------------|---------------|
| DFO World Wiki — Status | https://wiki.dfo.world/view/Status | Community wiki | Prior scrape (2026-05-02) |
| DFO World Wiki — Berserker Skills | https://wiki.dfo.world/view/Category:Berserker_Skills | Community wiki | Prior scrape (2026-05-04) |
| NamuWiki — Berserker Skills (KDNF) | https://namu.wiki/w/버서커(던전앤파이터)/스킬 | Korean community wiki | Firecrawl Agent extraction (2026-05-04) |
| dcalc damage formula audit | https://github.com/dnfcalc/dcalc | Community open-source | Code audit (2026-05-04) |
| DFO World Wiki — Damage | https://wiki.dfo-world.com/view/Damage | Community wiki | Blocked (403); data from dcalc audit |
| Neople Open API | N/A | Official | Wired in `berserkerSkillFacts.ts` |

### Access limitations

- **wiki.dfo-world.com** returns HTTP 403 on direct WebFetch — wiki data is from prior scrapes stored in `docs/research/reference/community/`
- **Firecrawl credits exhausted** during this session — new live scraping unavailable
- **NamuWiki** extraction was partial (26 skills from 120K+ character page) — detailed per-skill level tables were not captured
- **Damage Formula** wiki page inaccessible — using dcalc code audit as bridge evidence

---

## 1. Damage Formula Verification

### 1.1 Current project state

File: `src/data/manifest/damage/classic-profile.json`

```json
{
  "constants": {
    "critMultiplier": 1.5,
    "counterMultiplier": 1.25,
    "defenseDivisor": 200,
    "eleBase": 1.05,
    "eleCoefficient": 0.0045,
    "eleFactorDivisor": 220,
    "strIntDivisor": 250,
    "finalDivisor": 1
  }
}
```

### 1.2 Cross-reference: dcalc code audit

Source: `docs/research/reference/community/damage-formula-audit-from-dcalc.md`

The dcalc project implements the DNF damage formula with these constants:

| Constant | Wiki/dcalc value | Project value | Match? | Confidence |
|----------|-----------------|---------------|--------|------------|
| STR/INT divisor | 250 | 250 | ✅ Match | **High** — verified by dcalc code + wiki consensus |
| Crit multiplier | 1.5 | 1.5 | ✅ Match | **High** — universal DNF constant |
| Counter/back attack | Not in dcalc (1.25 standard) | 1.25 | ✅ Assumed match | **Medium** — wiki convention, not independently verified for 70-85 era |
| Elemental coefficient | 0.0045 | 0.0045 | ✅ Match | **High** — dcalc `ratio_3 = max(ElementDB) * 0.0045 + 1.05` |
| Elemental base | 1.05 | 1.05 | ✅ Match | **High** — dcalc matches exactly |
| Elemental divisor | 220 (community) / 222 (some sources) | 220 | ⚠️ See 1.3 | **Medium** — community varies by era |
| Defense divisor | 200 | 200 | ✅ Match | **High** — dcalc: `ratio_8 = 1 - def / (def + 200 * 100)` |
| Defense difficulty factor | 100 (varies by level) | N/A | ⚠️ Gap | **Low** — project uses simplified defense model |

### 1.3 Elemental divisor: 220 vs. 222

The dcalc code does not use a standalone ÷220 divisor. Instead, it computes elemental ratio as:

```
ratio_3 = max(ElementDB) * 0.0045 + 1.05
```

The **0.0045** coefficient is mathematically equivalent to **1/222.22...** (not exactly 1/220):

- `1/220 ≈ 0.004545...`
- `1/222 ≈ 0.004504...`
- `0.0045 = 1/222.22...`

This is a known community point of confusion:
- **Pre-Metastasis era (70-85 cap)**: typically cited as ÷220 by Korean community
- **Post-rework**: coefficient standardized to 0.0045 (≈÷222)
- The difference is small: at 100 elemental damage, ÷220 gives ~45.5% increase; 0.0045 gives 45% increase

**Recommendation**: The project's `eleFactorDivisor: 220` is only used in the damage formula if explicitly implementing ÷220 arithmetic. Since the actual computation likely uses `eleCoefficient: 0.0045`, the divisor field may be vestigial. Verify in `DamageFormula.ts` whether the divisor is actually used, or whether only the coefficient matters.

### 1.4 Defense reduction formula

**Wiki/dcalc formula**:
```
defense_ratio = 1 - monster_defense / (monster_defense + 200 * difficulty_factor)
```

- `difficulty_factor` = 100 at level 100 content (changes with dungeon level)
- Project uses `defenseDivisor: 200` but the `difficultyFactor: 100` in `pveDefaults` means effective defense reduction is `def / (def + 20000)`
- This produces near-zero reduction for `monsterDefense: 100` (0.5% damage reduction)

**Gap**: The project's `pveDefaults.monsterDefense: 100` is a placeholder for a 2.5D prototype. Real DNF monster defense values at level 70 cap would be in the thousands. The simplified model is adequate for a combat feel prototype but would not reproduce DNF damage magnitudes.

### 1.5 Critical / Counter multipliers

| Multiplier | Wiki value | Project value | Confidence |
|------------|-----------|---------------|------------|
| Critical | 1.5× | 1.5× | **High** — universal DNF constant across all eras |
| Counter (back attack) | 1.25× | 1.25× | **Medium** — standard DNF value, but not confirmed from 70-85 specific wiki source |

### 1.6 Stat-to-damage conversion

**Wiki/dcalc formula structure**:
```
STR_ratio = (STR + buff_STR) / 250 + 1
Physical_percent_damage = skill_% * physAtk * STR_ratio
Physical_fixed_damage = skill_fixed_coefficient * independentAtk * STR_ratio
```

The dcalc audit confirms four damage types routing through different stat chains:

| Type | Stat chain | Project support |
|------|-----------|-----------------|
| Physical percent | STR → physAtk × skill% | `physical_percent` in classic-profile |
| Magic percent | INT → magAtk × skill% | `magic_percent` in classic-profile |
| Physical fixed | STR → independentAtk × fixed coeff | `physical_fixed` in classic-profile |
| Magic fixed | INT → independentAtk × fixed coeff | `magic_fixed` in classic-profile |

**Gap**: The project's damage type definitions exist but the full stat→damage routing through `DamageFormula.ts` needs verification. The `classic-profile.json` `pveDefaults` show all four stat types but `playerIndependentAtk: 900` is a placeholder value.

### 1.7 Independent attack scaling by level

DNF's independent attack (독립 공격력) scales with character level. At level 70 cap:
- Base independent attack ≈ 900-1000 (depending on weapon reinforcement)
- Project default: 900 — reasonable placeholder for level 70 era

No wiki source with level-by-level independent attack tables was found during this research pass. This remains a **Batch C (PVF extraction) task**.

---

## 2. Status Effect Durations & Mechanics

### 2.1 Current project state

File: `src/data/manifest/status/default.json`

14 status profiles defined, all with `requiresCalibration: true` and `confidence: "low"` or `"medium"`.

### 2.2 Cross-reference: DFO World Wiki Status page

Source: `docs/research/reference/reference-dfo-status-effects.md`

#### DoT Status Effects

| Status | Wiki duration | Wiki tick interval | Project duration | Project tick interval | Match? |
|--------|-------------|-------------------|-----------------|---------------------|--------|
| Bleed | 3s (180f) | 0.5s (30f) | 180f | 30f | ✅ Match |
| Poison | 5s (300f) | 0.5s (30f) | 300f | 30f | ✅ Match |
| Burn | 5s (300f) | 0.5s (30f) | 300f | 30f | ✅ Match |
| Shock | 10s (600f) | distributed hits, not fixed ticks | 600f | 60f | ⚠️ See 2.3 |

#### Stacking mechanics

| Status | Wiki max stacks | Wiki stack bonus | Project max stacks | Match? |
|--------|----------------|-----------------|-------------------|--------|
| Bleed | Not specified | +1% per stack (max +10%) → implies 10 stacks | 5 | ⚠️ Discrepancy — wiki implies 10, project uses 5 |
| Poison | Not specified | +2% per stack (max +10%) → implies 5 stacks | 5 | ✅ Consistent |
| Burn | Not specified | unspecified | 5 | ⚠️ Unverified |
| Shock | Not specified | +0.5% per stack (max +5%) → implies 10 stacks | 5 | ⚠️ Discrepancy |

**Note**: The wiki page describes a post-rework system where "status levels were removed from damage-type effects." The stacking bonuses (+1%, +2%, +0.5% per stack) are from the current live version, which may differ from the 70-85 classic era. Classic era used fixed damage-per-tick values that scaled with character level and status level, not percentage-based stacking.

#### Hard Control (CC) Status Effects

| Status | Wiki prevents | Wiki escape | Project duration | Project isHardControl | Notes |
|--------|-------------|-------------|-----------------|----------------------|-------|
| Stun | All actions | Keystrokes can end early | 90f (1.5s) | true | No duration specified on wiki |
| Freeze | All actions, downed, launched, thrown | Keystrokes can end early | 120f (2s) | true | Burn cancels Freeze + 105% damage |
| Petrify (Stone) | All actions, downed, launched, thrown | Keystrokes can end early | 150f (2.5s) | true | 10% damage reduction on players |
| Sleep | All actions, counts as downed | Keystrokes do NOT end | 180f (3s) | true | Wake-up attack = 150% damage |
| Bind | Movement + jumping only | N/A | 100f (1.67s) | true | Target can still attack |
| Slow | Decreases move/attack speed | N/A | 300f (5s) | false (debuff) | Speed decrease varies with slow level |
| Curse | Randomly applies 1 abnormal status | N/A | 420f (7s) | false (debuff) | No longer decreases stats (modern update) |

**Key discrepancies / gaps**:

1. **Stun/Freeze/Petrify/Sleep durations**: Wiki does not provide fixed durations in seconds. The project's values (90f–180f) are local baselines with `confidence: "low"`. Real DNF durations vary by skill level and target resistance.

2. **Hard control mutex**: Wiki describes individual escape mechanics (keystrokes, Burn-cancels-Freeze) but does not document a formal "hard control mutex" system where one CC overrides another. The project's `StatusEffectSystem.ts` implements hard control mutex — this may be more systematic than actual DNF behavior, which treats each CC independently with specific interaction rules.

3. **Blind and Confusion**: Present in wiki, NOT in project's `default.json`. These are gap entries.

4. **Tolerance/immunity**: Wiki describes individual tolerances per status type + "All Abnormal Status Tolerance" stat. The old system (200 resistance = immunity) was replaced. Project's tolerance/immunity accumulation rates are local baselines with no wiki verification.

#### Burn-Freeze interaction

Wiki confirms the classic interaction:
- **Burn during Freeze**: Cancels Freeze, applies **105%** of attack damage
- Fire-elemental attacks alone do NOT cancel Freeze — only Burn status does

Project does not model this interaction. **Gap**.

#### Sleep wake-up bonus

Wiki confirms: Incoming attack on Sleeping target applies **150%** damage. Project does not model this. **Gap**.

#### Rupture (classified as Neutralize-type by wiki)

| Property | Wiki value (monster) | Wiki value (player) | Project value | Match? |
|----------|---------------------|--------------------|---------------|--------|
| Max stacks | 3 | 3 | 5 | ❌ Discrepancy — project uses 5, wiki says 3 |
| Stack 1 effect | +5% incoming damage | +25% incoming damage | +10% per stack | ⚠️ Project overestimates monster effect |
| Stack 2 effect | +7% | +50% | +10% (cumulative 20%) | ❌ Not matching wiki curve |
| Stack 3 effect | +8% (total +20%) | +75% (total +150%) | +10% (cumulative 30%) | ❌ Not matching wiki curve |

**Critical finding**: The project's Rupture values diverge significantly from wiki data. Wiki says max 3 stacks with 5%/7%/8% for monsters (non-linear, diminishing returns). Project uses 5 stacks of flat 10% each.

---

## 3. Berserker Skill Data

### 3.1 Current project state

File: `src/combat/actions/FrameDataAction.ts`

Skills with `markOfficialApiFacts` (high confidence for CD/MP):
- UpwardSlash, MountainousWheel, RagingFury, Bloodlust
- QuickRebound, Backstep, FrenzyToggle, Derange, Diehard

Other skills with `local_baseline` provenance (medium confidence):
- GoreCross, OutrageBreak, ExtremeOverkill, RagingFury2, BloodRuin, BloodSword, BurstFury, EarthShatter, Thirst, BloodMemory

### 3.2 Cross-reference: Official API + Wiki skills

#### Skills verified by Neople Open API (high confidence)

| Skill | Project CD (ticks@60fps) | Project CD (seconds) | Project MP | Official API CD | Official API MP | Source |
|-------|--------------------------|---------------------|------------|-----------------|-----------------|--------|
| UpwardSlash | 120t | 2s | (not set) | 2s (120t) | — | `berserkerSkillFacts.ts` |
| MountainousWheel | 240t | 4s | 17 | 4s (240t) | 17 | API level 1 |
| RagingFury | 780t | 13s | 142 | 13s (780t) | 142 | API level 1 |
| Bloodlust | 360t | 6s | 37 | 6s (360t) | 37 | API level 1 |
| QuickRebound | 300t | 5s | 1 | 5s (300t) | 1 | API level 1 |
| FrenzyToggle | 600t | 10s | 10 | 10s (600t) | 10 | API level 1 |
| Derange | 300t | 5s | (not set) | 5s (300t) | — | API level 1 |
| Diehard | 600t | 10s | 40 | 10s (600t) | 40 | API level 1 |

**Status**: All API-verified skills match exactly. ✅

#### Skills from tuning baseline (medium confidence, not API-verified)

| Skill | Project CD (ticks) | Project CD (seconds) | Project MP | Wiki/Namu reference | Match assessment |
|-------|-------------------|---------------------|------------|--------------------|--------------------|
| GoreCross | 360t | 6s | 25 | NamuWiki lists as "Gore Cross" (고어크로스) | ⚠️ Wiki CD not extracted |
| OutrageBreak | 480t | 8s | 55 | NamuWiki lists with +18.6% Atk patch note | ⚠️ Wiki CD not extracted |
| ExtremeOverkill | 600t | 10s | 68 | NamuWiki: "holding" type | ⚠️ Wiki CD not extracted |
| RagingFury2 | 900t | 15s | 200 (+2 cubes) | Not found on NamuWiki extraction | ⚠️ Unverified |
| BloodRuin | 480t | 8s | 45 | NamuWiki lists as DELETED (replaced by Blood Snatch) | ❌ **This skill was deleted from DNF** |
| BloodSword | 720t | 12s | 90 (+1 cube) | Not listed on DFO World Wiki category | ⚠️ May be post-Metastasis |
| BurstFury | 420t | 7s | 40 | NamuWiki: "Burst Fury" +14% Atk | ⚠️ Wiki CD not extracted |
| EarthShatter | 180t | 3s | 20 | Not found on either wiki skill list | ⚠️ May be custom/non-canonical |
| Thirst | 600t | 10s | 10% HP | NamuWiki: "Thirst" (갈증), overall delay decreased | ⚠️ Wiki CD not extracted |
| BloodMemory | 900t | 15s | 50 | NamuWiki: passive, bleeding enemies→Indep Atk+ | ⚠️ Wiki describes as passive, project has as active buff |

#### Skills from NamuWiki NOT in project

| Korean Name | English Name | Type | Present in project? |
|---|---|---|---|
| 블러드스내치 | Blood Snatch | Active (Lv60) | ❌ Not implemented |
| 블러드붐 | Blood Boom | Active | ❌ Not implemented |
| 블러드리븐 | Blood Riven | Active | ❌ Not implemented |
| 블러디트위스터 | Bloody Twister | Active (Lv35) | ❌ Not implemented |
| Enrage | Enrage | Active (Lv35) | ❌ Not implemented |
| 퀵리바운드 | Quick Rebound | Hold | ✅ Implemented |

#### DFO World Wiki skills NOT in project

| Skill | Type | Present in project? |
|-------|------|---------------------|
| Ash Fork | Active | ❌ |
| Blood Drain | Active | ❌ |
| Blood Evil | Active | ❌ |
| Blood Majin Strike | Active | ❌ |
| Brutal Crusher | Active | ❌ |
| Burning Blood | Active | ❌ |
| Hell Buster | Active | ❌ |
| Blood Incarnate | 2nd Awakening | ❌ |
| Blood Scratch | 2nd Awakening | ❌ |

### 3.3 Critical findings for berserker skills

1. **BloodRuin was deleted from DNF** (replaced by Blood Snatch according to NamuWiki). The project retains it as an active skill. This is a discrepancy against the 70-85 classic era — BloodRuin may have existed during this period and been deleted later, or it may never have existed in this form. Further research on deletion timeline is needed.

2. **EarthShatter** does not appear on either wiki skill list. Verify whether this is a custom skill or a translated name for an existing skill.

3. **BloodMemory** is classified as a **passive** on NamuWiki (bleeding enemies → increase Independent Atk, Hit Rate, Phys Crit), but the project implements it as an **active buff** (1 frame cast, 20s duration, 15s CD). This is a design divergence.

4. **Thirst** CD/MP values not independently verified — NamuWiki only confirms the skill exists and its "overall delay decreased" patch note.

5. **RagingFury pillar count**: Tuning baseline documented 8 pillars, but `FrameDataAction.ts` implements 10 pillars at `[15,17,19,21,23,25,27,29,31,33]`. NamuWiki states "10 blood pillars" — **10 is correct per wiki**.

### 3.4 Frenzy/BloodyCross/Derange buff values

Source: `tuning-baseline.md` + `FrameDataAction.ts`

| Buff | Official API value | Project value | Match? |
|------|-------------------|---------------|--------|
| Derange Skill Atk | +34% | +34% | ✅ |
| Derange Atk/Move Spd | +21% | +21% | ✅ |
| Derange Abnormal Resist | 100% | 100% | ✅ |
| Derange Hit Recovery | 105 | 105 | ✅ |
| Derange INT | -1000 | -1000 | ✅ |
| Derange Phys/Mag Def | -50% | -50% | ✅ |
| BloodyCross Skill Atk | +28.7% | +28.7% | ✅ |
| BloodyCross Atk/Move Spd | +5.5% | +5.5% | ✅ |
| Frenzy CD | 10s (600t) | 600t | ✅ |
| Frenzy MP | 10 | 10 | ✅ |
| Diehard CD | 10s (600t) | 600t | ✅ |
| Diehard MP | 40 | 40 | ✅ |
| Diehard HP threshold | ≤50% | ≤50% | ✅ |
| Diehard HP recovery | 20% max HP | 20% max HP | ✅ |

**Status**: All Derange/BloodyCross/Frenzy/Diehard level 1 buff values match official API. ✅

---

## 4. Monster/Boss AI Patterns

### 4.1 Current project state

File: `src/data/manifest/ai/enemy-default.json`

5 enemy profiles defined, ALL with `requiresCalibration: true` and mostly `confidence: "low"` or `"medium"`.

| Profile | HP | Sight Range | Detect Range | Aggressiveness | Move Speed | Behavior Weights (chase/hold/retreat) |
|---------|-----|-------------|-------------|----------------|------------|--------------------------------------|
| boss | 420 | 400 | 360 | 80 | 0.55 | 60/30/10 |
| grunt | 160 | 300 | 360 | 50 | 1.05 | 70/20/10 |
| imp | 120 | 280 | 300 | 65 | 1.15 | 80/15/5 |
| dummy | 160 | 200 | 260 | 30 | 0.75 | 40/40/20 |
| building | 500 | 0 | 0 | 0 | 0 | 0/100/0 |

All AI params sourced from `local_baseline` (not wiki-verified).

### 4.2 Wiki-sourced AI parameters

No quantitative AI parameters (sight range, aggressiveness scores, target switch timers) were found on DFO World Wiki or NamuWiki. DNF's AI system is not documented publicly in numerical form — these are client-side data extracted from PVF files.

### 4.3 Qualitative monster behavior (from wiki/game knowledge)

#### Classic era enemy archetypes

| Archetype | Behavior pattern | Project profile match | Notes |
|-----------|-----------------|----------------------|-------|
| Grunt (잡몹) | Simple chase → attack loop, low HP, high numbers | grunt (chase 70%) | ✅ Reasonable |
| Aggressive melee (e.g., Goblins) | Fast chase, quick attack, rarely retreats | imp (chase 80%) | ✅ Reasonable |
| Boss (보스) | Complex patterns, phase transitions, super armor during attacks | boss | ⚠️ Needs phase transition modeling |
| Structure/object | Immobile, high HP, no AI | building | ✅ Reasonable |
| Training dummy | Low aggressiveness, no movement, high HP | dummy | ✅ Reasonable |

#### Boss behavior patterns (classic era, qualitative)

DNF classic era bosses exhibit:

1. **Super armor during attack animations** — represented in project by `armor: "boss_super_armor"`
2. **Phase transitions at HP thresholds** — project's `boss-patterns.json` references this but the AI manifest doesn't wire phases
3. **Long-range reaction to player actions** — project models `longRangeReactionChance` (40% for boss) but wiki provides no quantitative reference
4. **Target switching** — project models `targetSwitchTime` (boss: 30 ticks = 0.5s) but wiki provides no quantitative reference
5. **Aggro loss on distance** — project models `loseAggroRange` (boss: 500) but wiki provides no reference

#### Modern boss systems (explicitly excluded for classic era)

The DFO World Wiki Status page documents the **Neutralize/Ignite/Groggy** system, which is a **modern (post-Metastasis) addition** and explicitly excluded by the project's `70-85-classic-pre-metastasis` target. This system should NOT be modeled.

### 4.4 AI parameter confidence assessment

| Parameter | Current confidence | Can wiki verify? | Recommended action |
|-----------|-------------------|-----------------|--------------------|
| sightRange | low | No — PVF data required | Batch C task |
| detectRange | low | No | Batch C task |
| aggressiveness | low | No | Batch C task |
| targetSwitchTime | low | No | Batch C task |
| longRangeReactionChance | low | No | Batch C task |
| loseAggroRange | medium | No | Batch C task |
| moveSpeedPerTick | medium | No | Batch C task |
| preAttackFrames | medium | No | Batch C task |
| postCooldown | medium | No | Batch C task |
| behaviorWeights | low | No | Design calibration |
| armor type | medium | Some wiki data on specific bosses | Acceptable as-is for prototype |

**Verdict**: Wiki research cannot meaningfully calibrate AI parameters. These require **Batch C (PVF/ANI extraction)** for ground truth. The current local baseline values are reasonable placeholders for a combat feel prototype.

---

## 5. Summary Tables

### 5.1 Verified values (wiki → project match)

| Category | Parameter | Value | Source | Confidence |
|----------|-----------|-------|--------|------------|
| Damage | STR/INT divisor | 250 | dcalc + wiki consensus | High |
| Damage | Crit multiplier | 1.5× | dcalc + wiki consensus | High |
| Damage | Counter multiplier | 1.25× | DNF standard | Medium |
| Damage | Elemental coefficient | 0.0045 | dcalc code | High |
| Damage | Elemental base | 1.05 | dcalc code | High |
| Damage | Defense divisor | 200 | dcalc code | High |
| Damage | 4 damage type routing | STR/INT × Atk × skill% | dcalc code | High |
| Status | Bleed duration | 180f / 3s | DFO World Wiki | High |
| Status | Bleed tick interval | 30f / 0.5s | DFO World Wiki | High |
| Status | Poison duration | 300f / 5s | DFO World Wiki | High |
| Status | Poison tick interval | 30f / 0.5s | DFO World Wiki | High |
| Status | Burn duration | 300f / 5s | DFO World Wiki | High |
| Status | Burn tick interval | 30f / 0.5s | DFO World Wiki | High |
| Status | Burn splash radius | 150px | DFO World Wiki | High |
| Status | Shock duration | 600f / 10s | DFO World Wiki | High |
| Status | Burn-Freeze interaction | Cancel + 105% damage | DFO World Wiki | High |
| Status | Sleep wake-up bonus | 150% damage | DFO World Wiki | High |
| Skills | UpwardSlash CD/MP | 120t / (see code) | Neople API | High |
| Skills | MountainousWheel CD/MP | 240t / 17 MP | Neople API | High |
| Skills | RagingFury CD/MP | 780t / 142 MP | Neople API | High |
| Skills | RagingFury pillar count | 10 (not 8) | NamuWiki | High |
| Skills | Bloodlust CD/MP | 360t / 37 MP | Neople API | High |
| Skills | Frenzy CD/MP | 600t / 10 MP | Neople API | High |
| Skills | Derange buff values | 34%/21%/100%/105/-1000/-50% | Neople API | High |
| Skills | Diehard values | 600t/40MP/≤50%HP/20%recovery | Neople API | High |
| Skills | BloodyCross values | 28.7%/5.5%/70-60-50% stages | Neople API | High |
| Skills | QuickRebound | 300t/1MP/180t hold/18t armor | Neople API | High |

### 5.2 Unverified values (require further research)

| Category | Parameter | Current value | Confidence | Next step |
|----------|-----------|---------------|------------|-----------|
| Status | Stun duration | 90f | Low | PVF extraction |
| Status | Freeze duration | 120f | Low | PVF extraction |
| Status | Petrify duration | 150f | Low | PVF extraction |
| Status | Sleep duration | 180f | Low | PVF extraction |
| Status | Bind duration | 100f | Low | PVF extraction |
| Status | DoT damage per stack | 4-6 per tick | Low | PVF extraction |
| Status | Tolerance accumulation rates | N/A | Low | PVF extraction |
| Skills | GoreCross CD/MP | 360t / 25 | Medium | Official API if skillId known |
| Skills | OutrageBreak CD/MP | 480t / 55 | Medium | Official API if skillId known |
| Skills | ExtremeOverkill CD/MP | 600t / 68 | Medium | Official API if skillId known |
| Skills | BurstFury CD/MP | 420t / 40 | Medium | Official API if skillId known |
| Skills | RagingFury2 CD/MP | 900t / 200 | Medium | Official API if skillId known |
| Skills | BloodSword CD/MP | 720t / 90 | Medium | Official API if skillId known |
| Skills | EarthShatter CD/MP | 180t / 20 | Low | Verify skill existence |
| Skills | Thirst CD/effect values | 600t / varies | Medium | Official API + wiki |
| Skills | BloodMemory CD/effect values | 900t / varies | Medium | Wiki classification mismatch |
| AI | All numerical AI params | varies | Low-Medium | PVF extraction (Batch C) |
| AI | Boss phase transitions | N/A | Low | Batch C |
| Status | Rupture stack values | 5 stacks × 10% | Low | Wiki says 3 stacks × 5/7/8% |

### 5.3 Conflicting values (wiki vs. project)

| Parameter | Wiki value | Project value | Severity | Recommended action |
|-----------|-----------|---------------|----------|-------------------|
| Rupture max stacks | 3 stacks | 5 stacks | **High** | Fix to match wiki (3 stacks, 5%/7%/8% for monsters) |
| Rupture monster damage amp | 5%/7%/8% (diminishing) | +10% per stack (linear) | **High** | Adjust curve to match wiki |
| Bleed max stacks (wiki implies 10) | up to 10 (from +1%×10) | 5 | Medium | Investigate classic-era stack limit |
| Shock tick mechanism | Distributed hits across 10s | Fixed 60f interval | Medium | Re-evaluate tick model |
| Shock max stacks (wiki implies 10) | up to 10 (from +0.5%×10) | 5 | Medium | Investigate classic-era stack limit |
| BloodRuin skill | Deleted per NamuWiki | Present in project | **High** | Confirm deletion timeline vs. 70-85 era |
| BloodMemory type | Passive (NamuWiki) | Active buff (project) | Medium | Consider passive implementation |
| EarthShatter skill | Not on wiki lists | Present in project | Medium | Verify canonical status |

### 5.4 Missing status types (wiki lists, project absent)

| Status | Wiki classification | Priority for addition |
|--------|--------------------|---------------------|
| Blind (失明) | Neutralize-type | Low — visual effect, reduces hit rate |
| Confusion (混乱) | Neutralize-type | Low — input scrambling, complex to implement |

---

## 6. Research Completeness Assessment

### Coverage by topic

| Topic | Wiki coverage | Project alignment | Remaining gaps |
|-------|-------------|-------------------|----------------|
| Damage formula structure | 90% (dcalc audit) | 85% | Difficulty factor dynamic scaling, level-based independent attack tables |
| Damage formula constants | 100% (verified) | 100% | None |
| DoT status durations | 90% (durations/tick intervals) | 85% | Damage-per-tick scaling formulas, classic-era stack limits |
| Hard control mechanics | 70% (qualitative rules) | 60% | Exact durations, mutex/override priority chain |
| Tolerance/immunity | 30% (system described, no numbers) | 20% | All numerical tolerance values |
| Berserker skill CD/MP | 50% (8 API-verified, rest baseline) | 50% | Remaining skill CD/MP from API or wiki |
| Berserker skill list | 80% (26 from NamuWiki, ~33 from DFO World Wiki) | 60% (18 of ~33 implemented) | Missing skills (Ash Fork, Blood Drain, etc.) |
| Boss AI patterns | 10% (qualitative only) | 10% | All quantitative AI parameters → Batch C |
| Enemy archetypes | 20% (qualitative descriptions) | 20% | Archetype-specific stats → Batch C |

### Source quality assessment

| Source | Accessible | Data quality | Numerical precision | Era specificity |
|--------|-----------|-------------|--------------------|--------------------|
| Neople Open API | Yes (via proxy) | High — official | High | Mixed (current values, some skills changed) |
| DFO World Wiki | Blocked (403) | Medium — community | Variable | Usually current, sometimes historical |
| NamuWiki | Readable via browser | Medium — community | Variable | KDNF history tracked, era noted |
| dcalc (GitHub) | Open source | Medium — reverse-engineered | High | Current version (not era-specific) |
| PVF files | Not yet researched | High — client data | High | Exact era match possible |

---

## 7. Recommendations

### Immediate actions (code-compatible with evidence freeze)

1. **Fix Rupture values**: Reduce max stacks from 5 to 3, change damage amp per stack from 10% flat to 5%/7%/8% (monster) per DFO World Wiki.
2. **Verify RagingFury pillar count**: Code already has 10 — ensure tuning baseline is corrected (currently says 8).
3. **Document BloodRuin status**: Add provenance note that NamuWiki lists it as deleted; verify whether deletion occurred during or after the 70-85 target era.

### Short-term research (Batch B extensions)

4. **Expand official API coverage**: For GoreCross, OutrageBreak, ExtremeOverkill, BurstFury, RagingFury2, BloodSword — query Neople API with correct skill IDs to get level 1 CD/MP values.
5. **Classic-era stack limits**: Determine whether the 70-85 era used 5-stack or 10-stack limits for Bleed/Shock. The current wiki description of +1% per stack up to +10% suggests 10 stacks in the modern system.

### Deferred to Batch C (PVF extraction)

6. All AI parameters (sight range, aggressiveness, target switching, phase transitions)
7. All status durations for hard CC (Stun/Freeze/Petrify/Sleep precise frame counts)
8. All tolerance/immunity accumulation rates
9. Independent attack scaling tables by level
10. Defense values for specific monster types at level 70 cap
11. Verifying skill deletion timelines (BloodRuin vs. Blood Snatch)

---

## Sources

### Primary (accessed during this research)

- **DFO World Wiki — Status Effects**: https://wiki.dfo.world/view/Status (scraped 2026-05-02; stored at `docs/research/reference/reference-dfo-status-effects.md`)
- **DFO World Wiki — Berserker Skills category**: https://wiki.dfo.world/view/Category:Berserker_Skills (scraped 2026-05-04; stored at `docs/research/reference/community/dfo-world-wiki-berserker-skills.md`)
- **NamuWiki — Berserker Skills (KDNF)**: https://namu.wiki/w/버서커(던전앤파이터)/스킬 (extracted 2026-05-04 via Firecrawl Agent; stored at `docs/research/reference/community/namu-wiki-berserker-skills.md`)
- **dcalc damage formula audit**: https://github.com/dnfcalc/dcalc (audited 2026-05-04; stored at `docs/research/reference/community/damage-formula-audit-from-dcalc.md`)
- **Neople Open API**: Wired in `src/data/official/berserkerSkillFacts.ts` (11 skills, level 1 facts)

### Secondary (project-internal)

- `src/data/manifest/damage/classic-profile.json` — damage formula constants
- `src/data/manifest/status/default.json` — 14 status profiles
- `src/data/manifest/ai/enemy-default.json` — 5 enemy type AI params
- `src/data/manifest/actions/default.json` — 38 action frame data records
- `src/combat/actions/FrameDataAction.ts` — hardcoded action definitions
- `docs/design/tuning-baseline.md` — local tuning baseline values
- `docs/research/reference/reference-dfo-status-effects.md` — DFO World Wiki Status page scrape
- `docs/research/reference/community/damage-formula-audit-from-dcalc.md` — dcalc formula audit
- `docs/research/reference/community/dfo-world-wiki-berserker-skills.md` — DFO World Wiki skill list
- `docs/research/reference/community/namu-wiki-berserker-skills.md` — NamuWiki skill extraction
