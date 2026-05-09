
# CRT-002 — Frame Data Evidence Mapping

**Status**: Complete (2026-05-09)  
**Phase**: Combat Lab 0.3 — Evidence Freeze  
**Author**: CRT-002 research pass  

---

## Executive Summary

All 38 combat actions in `src/data/manifest/actions/default.json` have frame timing data (totalFrames, startupFrames, activeFrames, recoveryFrames, cancelFrom, whiffCancelFrom). **None of these frame values are verified from official DNF sources.** The Neople Open API, DFO World Wiki, NamuWiki, and Chinese DNF community resources do not expose per-skill frame data at the granularity required for a combat kernel.

**What CAN be verified from the Neople Open API** (for 11 Berserker skills):
- Cooldown (seconds)
- MP cost
- Hit count
- Damage percentages
- Buff modifiers (skill attack %, speed %, stat changes)
- Cast time (seconds, for some skills)

**What CANNOT be verified from any official or community source**:
- Startup/active/recovery frame counts (render-frame granularity)
- Hitbox geometry (offset, width, depth, height)
- Cancel window timing (hitCancelFrom, whiffCancelFrom)
- Hitstop frames
- Recoil frames
- Launch velocity curves
- Gravity curves
- Combo-protection thresholds
- Root motion speeds per tick

---

## Evidence Confidence Tiers

| Tier | Name | Definition |
|------|------|------------|
| **V** | Verified | Frame value confirmed from official/reliable source. Cite source URL + timestamp. |
| **I** | Inferred | Frame value derived from video analysis or community compile. Cite source, note uncertainty. |
| **E** | Estimated | Frame value from tuning baseline with no external evidence. Mark as "gameplay-tuned, no external evidence." |

**Note**: The Neople Open API provides `coolTimeSeconds` and `castingTimeSeconds` as scalar float values (not frame counts at render tick rate). These are regarded as **secondary verification** — they can cross-check CD durations and cast timing but do not verify frame-level data.

---

## Source File Inventory

| File | Role | Frame Data Present? | API Data Present? |
|------|------|:---:|:---:|
| `src/data/manifest/actions/default.json` | 38 action definitions with frame windows, hitboxes, cancel policies, reaction profiles, root motion | Yes | CD/MP/hitCount embedded as secondary |
| `src/data/official/berserkerSkillFacts.ts` | API-verified level-1-10 data for 11 Berserker skills | **No** | Yes (CD, MP, damage%, hitCount, buff values) |
| `src/data/official/localFrameTuning.ts` | Local calibrated baseline: hit reactions, hitbox defaults, movement speeds, cancel targets, frame counts | Yes (all local) | No |
| `docs/design/tuning-baseline.md` | Human-readable tuning baseline: frame windows, CD, MP for key skills | Yes (subset) | Partial (some API-backed CD/MP) |

---

## Per-Action Frame Evidence Table

### Legend
- **TF** = totalFrames
- **SU** = startup (start–end)
- **AC** = active hit windows (start–end for each hit)
- **RC** = recovery (start–end)
- **HCF** = hitCancelFrom
- **WCF** = whiffCancelFrom
- **Tier** = V/I/E (see tiers above)
- **API** = marks if this action has any API-verified data (CD, MP, hitCount)

### Movement / Utility Actions

| # | Action ID | TF | SU | AC | RC | HCF | WCF | Tier | API | Notes |
|---|-----------|----|----|----|----|-----|-----|------|-----|-------|
| 1 | Idle | 1 | 1–1 | — | 2–1 | — | -3 | E | — | Singleton; negative whiffCancelFrom = never whiff-cancel |
| 2 | Walk | 1 | — | — | — | 0 | 0 | E | — | Movement; cancel-from-0 = always cancelable |
| 3 | Run | 1 | — | — | — | 0 | 0 | E | — | Movement; 4.15 px/tick root motion |
| 4 | Jump | 22 | 1–1 | — | 2–22 | 1 | 1 | E | — | |
| 5 | Backstep | 21 | 1–1 | — | 2–21 | — | 17 | E | ✓ | API: CD=null (no CD), MP=1. 9 root motion frames. |
| 6 | QuickRebound | 190 | 1–1 | — | 2–190 | — | 186 | E | ✓ | API: CD=5s, MP=1, max hold=3s, release super armor=0.3s. 180-tick max hold. |
| 7 | Derange | 1 | 1–1 | — | 2–1 | — | -3 | E | ✓ | API: CD=5s, cast=0.5s, MP=0 (HP-based), skill atk +34%, atk/move speed +21%, abnormal res +100%, hit recovery +105%, INT -1000, def -50% |
| 8 | Diehard | 1 | 1–1 | — | 2–1 | — | -3 | E | ✓ | API: CD=10s, cast=0.3s, MP=40, HP recovery 20%, usable ≤50% HP, def +8382, duration 31s |
| 9 | Thirst | 1 | 1–1 | — | 2–1 | — | -3 | E | — | Instant self-buff. Skill atk +20%, crit +10%, HP drain 0.3%/s, duration 30s. No API data found. |
| 10 | BloodMemory | 1 | 1–1 | — | 2–1 | — | -3 | E | — | Instant self-buff. STR +15%, all speed +10%, incoming dmg -15%, duration 20s. No API data found. |
| 11 | VimAndVigor | 1 | 1–1 | — | 2–1 | — | -3 | E | ✓ | Passive. API: bleed dmg=14/tick, bleed duration=7s, gore cross size +10% |
| 12 | FrenzyToggle | 1 | 1–1 | — | 2–1 | — | -3 | E | ✓ | Toggle. API: CD=10s, MP=10, CD reduction 10% |

### Basic Attacks

| # | Action ID | TF | SU | AC | RC | HCF | WCF | Tier | API | Notes |
|---|-----------|----|----|----|----|-----|-----|------|-----|-------|
| 13 | NormalBasic1 | 20 | 1–4 | 5–8 (1 hit) | 9–20 | 8 | 16 | E | — | 4 startup, 4 active, 12 recovery. Base dmg 10. |
| 14 | NormalBasic2 | 22 | 1–5 | 6–9 (1 hit) | 10–22 | 9 | 18 | E | — | 5 startup, 4 active, 13 recovery. Base dmg 14. |
| 15 | NormalBasic3 | 31 | 1–7 | 8–13 (1 hit) | 14–31 | 13 | 27 | E | — | 7 startup, 6 active, 18 recovery. Base dmg 24. Launch on last hit. |
| 16 | DashAttack | 24 | 1–6 | 7–11 (1 hit) | 12–24 | 11 | 20 | E | — | 6 startup, 5 active, 13 recovery. Base dmg 18. |
| 17 | JumpAttack | 26 | 1–5 | 6–10 (1 hit) | 11–26 | 10 | 22 | E | — | 5 startup, 5 active, 16 recovery. Base dmg 16. |

### Frenzy Basic Attacks

| # | Action ID | TF | SU | AC | RC | HCF | WCF | Tier | API | Notes |
|---|-----------|----|----|----|----|-----|-----|------|-----|-------|
| 18 | FrenzyBasic1 | 18 | 1–3 | 4–6, 7–9 (2 hits) | 10–18 | 6 | 14 | E | — | 3 startup, 6 active, 9 recovery. Dual slash. |
| 19 | FrenzyBasic2 | 20 | 1–4 | 5–7, 8–10 (2 hits) | 11–20 | 7 | 16 | E | — | 4 startup, 6 active, 10 recovery. Dual slash. |
| 20 | FrenzyBasic3 | 28 | 1–5 | 6–8, 9–11, 12–14 (3 hits) | 15–28 | 8 | 24 | E | — | 5 startup, 9 active, 14 recovery. Triple slash. Final hit knockdown. |

### Class Skills — API-Aligned (CD/MP/hitCount verified)

| # | Action ID | TF | SU | AC | RC | HCF | WCF | Tier | API | Notes |
|---|-----------|----|----|----|----|-----|-----|------|-----|-------|
| 21 | UpwardSlash | 27 | 1–6 | 7–11 (1 hit) | 12–27 | 11 | 23 | E | ✓ | **API**: CD=2s, MP level 1, dmg=190%, launch force=131.4%. Frame data: 6 startup, 5 active, 16 recovery — all tuned. |
| 22 | MountainousWheel | 45 | 1–15 | 16–16, 18–18, 20–20, 21–27 (4 hits) | 28–45 | 16 | 41 | E | ✓ | **API**: CD=4s, MP=17, hitCount=3 (downward), shockwave dmg=2498%. Frame: 3 single-frame slashes + 7-frame shockwave — all tuned. Note: hitCount=3 in API vs 4 hits in manifest (3 slashes + 1 shockwave emitter). |
| 23 | RagingFury | 53 | 1–9 | 10–13 + 10 pillars (odd frames 15–33) | 34–53 | 13 | 49 | E | ✓ | **API**: CD=13s, MP=142, hitCount=10 (blood pillars), shockwave dmg=3345%, pillar dmg=1275%. Frame: 9 startup, 4 shockwave + 10 pillar hits, 20 recovery. 10 pillars confirmed. |
| 24 | Bloodlust | 34 | 1–6 | 7–10 (grab + discharge) | 11–34 | 10 | 30 | E | ✓ | **API**: CD=6s, MP=37, grab dmg=1520%, eruption dmg=2876%, bleed bonus=4922%, bleed duration=3s. Frame: 6 startup, 4 active, 24 recovery — all tuned. |
| 25 | GoreCross | 38 | 1–7 | 8–11, 14–17, 20–23 (3 hits) | 24–38 | 11 | 34 | E | — | 3-hit cross slash. Final hit launches. MP=25, CD=6s from baseline. No API data found for this skill. |
| 26 | OutrageBreak | 52 | 1–31 | 32–38 (slam) | 39–52 | 38 | 48 | E | — | Charge phase: max 60 frames hold. Slam: 7 active frames. MP=55, CD=8s from baseline. No API data found. |
| 27 | ExtremeOverkill | 48 | 1–11 | 12–17 (leap) + 18–26 (shockwave) | 27–48 | 17 | 44 | E | — | 11 startup, leap 6 + shockwave 9 active, 22 recovery. MP=68, CD=10s. No API data. |
| 28 | RagingFury2 | 60 | 1–9 | 10–14 (shockwave) + 12 pillars (odd frames 15–37) | 38–60 | 14 | 56 | E | — | 2nd awakening version. 12 blood pillars vs 10 in RagingFury. MP=200, CD=15s, cube cost=2. No API data. |
| 29 | BloodRuin | 40 | 1–11 | 12–40 (persistent field) | 41–40† | 40 | 36 | E | — | Persistent AoE dot field. MP=45, CD=8s. †recovery end < start = persistent effect. |
| 30 | BloodSword | 55 | 1–24 | 25–35 (sweep) | 36–55 | 35 | 51 | E | — | 24 startup (long windup), 11 active, 20 recovery. MP=90, CD=12s, cube cost=1. No API data. |
| 31 | BurstFury | 42 | 1–9 | 10–13 (stab) + 28–35 (detonate) | 36–42 | 13 | 38 | E | — | Stab 4 active, gap, detonate 8 active. MP=40, CD=7s. No API data. |
| 32 | EarthShatter | 35 | 1–7 | 8–12 (smash) + 18–25 (traveling shockwave) | 26–35 | 12 | 31 | E | — | Smash 5 active, shockwave 8 active. MP=20, CD=3s. No API data. |

### Enemy Actions

| # | Action ID | TF | SU | AC | RC | HCF | WCF | Tier | API | Notes |
|---|-----------|----|----|----|----|-----|-----|------|-----|-------|
| 33 | EnemyBasic | 36 | 1–8 | 9–14 | 15–36 | 24 | 30 | E | — | 8 startup, 6 active, 22 recovery. Tuned for enemy attack feel. |

### Debug / Development Actions

| # | Action ID | TF | SU | AC | RC | HCF | WCF | Tier | API | Notes |
|---|-----------|----|----|----|----|-----|-----|------|-----|-------|
| 34 | DebugReset | 1 | 1–1 | — | 2–1 | — | -3 | E | — | Dev tool |
| 35 | ForceDownPlayer | 1 | 1–1 | — | 2–1 | — | -3 | E | — | Dev tool |
| 36 | ForceBleed | 1 | 1–1 | — | 2–1 | — | -3 | E | — | Dev tool |
| 37 | SpawnTargets | 1 | 1–1 | — | 2–1 | — | -3 | E | — | Dev tool |
| 38 | RunScreenshotScenario | 1 | 1–1 | — | 2–1 | — | -3 | E | — | Dev tool |

---

## Summary Statistics

| Tier | Count | Percentage |
|------|-------|:----------:|
| **Verified (V)** | 0 | 0.0% |
| **Inferred (I)** | 0 | 0.0% |
| **Estimated (E)** | 38 | 100.0% |

### Secondary API Verification (Non-Frame Data)

Of the 38 actions, **11** have API-verified secondary data (CD, MP, hitCount, damage%, buff values) through the Neople Open API:

| API-Verified Skill | Action ID | Fields Verified |
|--------------------|-----------|-----------------|
| UpwardSlash | UpwardSlash | damage%, launch force %, CD=2s |
| MountainousWheel | MountainousWheel | downward dmg%, shockwave dmg%, hitCount=3, CD=4s, MP=17 |
| RagingFury | RagingFury | shockwave dmg%, pillar dmg%, hitCount=10, CD=13s, MP=142 |
| Bloodlust | Bloodlust | grab dmg%, eruption dmg%, bleed bonus%, CD=6s, MP=37 |
| Derange | Derange | skill atk +34%, atk/move speed +21%, CD=5s, casting time=0.5s |
| Diehard | Diehard | HP recover 20%, def +8382, CD=10s, MP=40, casting time=0.3s |
| Frenzy | FrenzyToggle | CD reduction 10%, CD=10s, MP=10, casting time=0.5s |
| BloodyCross | (passive) | skill atk +28.7%, 3-stage HP thresholds, speed values |
| VimAndVigor | VimAndVigor | bleed dmg=14, bleed duration=7s, gore cross size +10% |
| Backstep | Backstep | CD=null, MP=1 |
| QuickRebound | QuickRebound | CD=5s, MP=1, max hold=3s, release super armor=0.3s |

Note: `Frenzy`, `BloodyCross` are buff skills widely used in the game but their frame data is 1-frame (instant activation) and purely mechanical — frame counts don't apply to stat buffs.

---

## Gap Analysis — Weakest Evidence Coverage

### Frame fields ranked by evidence weakness

| Field | Actions Affected | Nature of Gap |
|-------|:---:|---------------|
| startupFrames (start/end) | 19 combat actions | No external source available. Values reflect animation feel, not DNF data. |
| activeFrames (start/end per hit) | 19 combat actions | Multi-hit timing (e.g., RagingFury pillar spacing at odd frames) is entirely tuned. |
| recoveryFrames (start/end) | 19 combat actions | Recovery windows are scaled proportionally to totalFrames with no external reference. |
| totalFrames | 19 combat actions | Values chosen for gameplay feel (e.g., NormalBasic3=31). |
| whiffCancelFrom | 19 combat actions | `totalFrames - 4` default offset; no DNF source confirms cancel window timing. |
| hitCancelFrom | 19 combat actions | Generally set to last active frame end; no DNF source confirms. |
| hitbox geometry (offsetX, w, d, h) | ~25 combat actions | All hitbox dimensions are local baseline (default: offsetX=64, w=110, d=40, h=60). Official DNF hitbox geometry is in PVF/ANI binary files — not researched. |
| rootMotion speedXPerTick | 2 (Walk=2.45, Run=4.15) | Movement speeds are tuned for game feel at 60Hz. |
| hitStop/Recoil frames | All actions with hit reaction | All values from local baseline reactions. |

### Actions with the weakest overall evidence

1. **GoreCross, OutrageBreak, ExtremeOverkill, RagingFury2, BloodRuin, BloodSword, BurstFury, EarthShatter** — These 8 DNF skills have zero API data (no CD, MP, hitCount verification) AND zero frame evidence. They exist purely as tuning-baseline constructs.
2. **Thirst, BloodMemory** — 5th-awakening-era buffs with no API coverage.
3. **FrenzyBasic1–3** — Frenzy state basic attacks are a DNF mechanic but frame timings for dual-wield attacks are not documented anywhere.

---

## Web Research Results

Comprehensive web searches were conducted across English, Korean, and Chinese DNF community sources:

| Search Query | Sources Searched | Results |
|-------------|-----------------|---------|
| DNF berserker skill frame data animation spreadsheet | Web (general) | No frame data tables found |
| DFO World Wiki berserker "frame" / "animation" / "speed" | DFO World Wiki | Wiki pages list CD, MP, damage, level tables — no frame counts |
| 던전앤파이터 버서커 스킬 프레임 데이터 | NamuWiki, Korean forums | NamuWiki pages list damage values, cooldowns, and mechanical descriptions — no frame data |
| DNF 狂战士 技能帧数表 帧率60 | Chinese DNF communities (bilibili, tieba, NGA) | Character tier lists and damage comparisons exist, but no systematic frame data compilations were found |

**Conclusion**: Frame data at 60fps render-tick granularity is not part of the public DNF community knowledge base. It exists only in:
- Neople's internal development toolchain
- Binary NPK/ANI files (not yet researched — CRT Batch C pending)
- Proprietary game engine data

---

## Recommendations

### Short-term (Combat Lab 0.3)

1. **Accept "Estimated" as current ceiling** — With zero external frame evidence and API not exposing frames, 100% "Estimated" is the honest state. No amount of web searching will change this.
2. **Maintain tuning-baseline.md as the authoritative frame source** — It correctly documents the source of every value as "local calibration."
3. **Cross-validate API secondary data** — For the 11 API-backed skills, ensure CD, MP, and hitCount in `actions/default.json` match `berserkerSkillFacts.ts`. This is the only evidence-gathering work that can be done without PVF/ANI research.

### Medium-term (CRT Batch C — PVF/ANI research)

4. **Extract frame data from PVF/ANI files** — DNF's binary asset formats (`.npk`, `.ani`) contain actual animation frame counts and event markers. Tools like `DNFExtractor` or community PVF parsers could yield:
   - Frame counts per animation clip
   - Event marker positions (hitbox activation, projectile spawn, cancel windows)
   - Hitbox/hurtbox geometry from `.atk` files
   This is the ONLY path to elevate actions from "Estimated" to "Inferred" or "Verified."
5. **Community DNF private server data dumps** — Some private servers expose frame data through their server configuration files. These are unofficial but may provide reference values for frame timing.

### Long-term (post-Combat Lab)

6. **Video frame-counting tooling** — If PVF research is infeasible, building a tool to frame-count from DNF gameplay recordings at 60fps could provide "Inferred" tier evidence:
   - Record skill usage at known framerate
   - Count frames from input to first active hitbox visual
   - Count active frames from first to last hit visual
   - Count recovery frames from last hit to idle stance
   - Requires high-quality reference footage and careful methodology

7. **Consider the value proposition** — For a demo-grade combat prototype, 100% gameplay-tuned frame data is acceptable. The frame values in the tuning baseline already produce a playable combat feel. The primary value of evidence tracking is transparency, not gameplay quality.

---

## Verification

- Source files consulted: `actions/default.json`, `berserkerSkillFacts.ts`, `localFrameTuning.ts`, `tuning-baseline.md`
- Web research: English (DFO World Wiki, general web), Korean (NamuWiki, forums), Chinese (百度贴吧, NGA, bilibili)
- 38 actions inventoried, 11 API-aligned skills identified
- 0 frame values verified from external sources
- Document created: 2026-05-09

---

## Related Tickets

| Ticket | Title | Status | Relationship |
|--------|-------|--------|-------------|
| CRT-001 | Version Freeze (70-85 classic pre-Metastasis) | Resolved | Defines the target version scope |
| CRT-002 | Frame Data Evidence Mapping | This document | — |
| CRT-003 | Hitbox Geometry Evidence | Open | Hitbox evidence — equally blocked by lack of PVF/ANI data |
| CRT-004 | Monster AI Evidence | Open | AI behavior evidence from community sources |
| CRT-005 | Armor/Equipment Evidence | Open | Equipment stat evidence |
| CRT-006 | Replay System Evidence | Open | Replay correctness evidence |
| Batch A | API level 1–10 expansion | Pending | More API data for secondary verification |
| Batch B | Wiki semantic calibration | Pending | Wiki data for mechanical descriptions |
| Batch C | PVF/ANI toolchain research | Pending | Only path to frame-level evidence |
