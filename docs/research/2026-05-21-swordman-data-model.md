# Swordman Data Model — Golden Reference for DNF-Native Kernel

**Status**: Phase 2 (post-physics) — full-field extraction of `swordman` base class.
**Branch**: `dnf-native`
**Date**: 2026-05-21
**Source**: `Script.pvf v66282` from `D:/BaiduNetdiskDownload/DNF客户端（2018年2月更新）/地下城与勇士/`.
**Tool**: `tools/dnf-extract.exe` (commit ≥ 89f9e01).
**Predecessor**: `docs/research/2026-05-21-dnf-air-physics-phase1.md` (physics constants).
**Successor**: `docs/plans/2026-05-21-dnf-native-kernel-design.md` (consumer plan).

This document is the master reference for the swordman base class (鬼剑士 base, before transform). All five transforms (weaponmaster / souledge / berserker / asura / demonicswordman) inherit from this dataset.

---

## 1. Scope, data sources, methodology

### 1.1 Scope (in / out)

| In scope | Out of scope (this pass) |
|---|---|
| `character/swordman/swordman.chr` — every section, all fields | Transform-specific .chr (only swordman.chr + demonicswordman.chr exist; demonic is a sibling not a transform) |
| `character/swordman/attackinfo/*.atk` (92 files) | Per-skill .skl level scaling deep-dive (only 23 active/passive landed; 80+ standby) |
| `character/swordman/animation/*.ani` (161 files, full parse; 24 core motion landed as TS) | `.act` cancel-window section IDs (371543/241483/371546/371547/371549 not surfaced by current parser) |
| `skill/swordman/cancel*.skl` (19 cancel passives) | Common shared motions (death/getup) — live under `character/common/`, deferred |
| `skill/swordman/*.skl` shared-active/passive selection (23 files) | Transform-specific .skl (kalla / illusionslash / bloodyrave / kazan / hundredsword …) |

### 1.2 Data sources

| Tier | Source | Files used |
|------|--------|------------|
| Tier 1 — PVF | `tools/dnf-extract.exe --pvf Script.pvf --file ...` | All `.chr`, `.atk`, `.ani`, `.skl` listed above |
| Tier 1 — derived | Pure-arithmetic derivations (e.g. peak height from `lift_up² ÷ 2g`) | inheritance from `physics.ts` |
| Tier 3 — baseline | DNF convention / extrapolation | hit-reaction → motion mapping in `motions.ts`; cancel window placeholders in `cancels.ts` |

### 1.3 Methodology

1. Listed swordman PVF tree (`--list --filter character/swordman/` → 1241 files, plus `skill/swordman/` → 208).
2. Batch-extracted via `--pipe` (single JSONL stream, `\n---\n` separators).
3. Decoded IEEE-754 little-endian integer-encoded floats in `.chr` (e.g. `1138163712` → `430.0`).
4. Identified mixed encoding: `jump speed` and `width` are plain ints (not float-reinterpretation). Confirmed by sanity checking decoded values (95 vs 1e-43).
5. Mapped each `.chr` `motion` slot to its `.ani` filename.
6. Parsed every `.atk` to canonical schema (18 fields × 92 files).
7. Parsed every core-motion `.ani` to per-frame structure.
8. Walked all 19 `cancel*.skl` passives; **cancel-window timings are NOT in the JSON output of the current dnf-extract** (the binary section IDs are not yet decoded by `SklAnalyzer.ts`).
9. Cross-referenced existing `src/data/official/dnf/physics.ts` + `characters.ts` for physics constants (gravity `-1500 px/s²`, axis convention).
10. Landed all results as `.ts` modules under `src/data/official/dnf/swordman/` with explicit `Provenance` metadata per field.

---

## 2. `.chr` schema + full-field table

### 2.1 Section catalog (`swordman.chr`, 257 sections total)

| Section name | Rows | Field type | Semantic |
|---|---|---|---|
| job | 1 | string | "[swordman]" |
| body image path | 1 | string | sprite atlas template |
| jump power | 1 | float | initial jump force |
| jump speed | 1 | **int** | tempo (NOT a float reinterpretation) |
| move speed | 1 | float | % of SPEED_VALUE_DEFAULT |
| attack speed | 1 | float | % of SPEED_VALUE_DEFAULT |
| cast speed | 1 | float | % of SPEED_VALUE_DEFAULT |
| weight | 1 | float | audio-only (per dnf_enum_header) |
| width | 1 | int×2 | bounding-box width/depth |
| light resistance | 1 | float | % element resistance |
| dark resistance | 1 | float | % element resistance |
| hp max | 17 | float vector | row 0=base, rows 1-16=per-tier delta |
| mp max | 17 | float vector | as above |
| mp regen speed | 17 | float vector | as above |
| hit recovery | 17 | float vector | row 0=ms baseline, rows 1-16=multiplier |
| physical attack | 17 | float vector | as above |
| magical attack | 17 | float vector | as above |
| physical defense | 17 | float vector | as above |
| magical defense | 17 | float vector | as above |
| inventory limit | 17 | float vector | as above |
| module damage rate | 16 | float vector (×4 cols) | per equipment-slot damage modifier |
| weapon hit info | 6 | mixed row | per-weapon-class hit feedback |
| weapon wav | 6 | string row | per-weapon sound IDs |
| weapon skill info | 24 | float | layout unknown (likely 6×4) |
| weapon durability decrease rate | 6 | float | per-weapon-slot tick rate |
| upgrade weapon attack power rate | 12 | float | per-weapon × tier |
| attack motion | 1 | string×3 | attack1/2/3 ani paths |
| jumpattack motion | 1 | string | jumpattack ani |
| jumpattack info | 1 | string | jumpattack atk |
| dashattack motion | 1 | string | dashattack ani |
| dashattack info | 1 | string | dashattack atk |
| damage motion 1 | 1 | string | damage1 ani |
| damage motion 2 | 1 | string | damage2 ani |
| down motion | 1 | string | down ani |
| overturn motion | 1 | string | overturn ani |
| back motion | 1 | string | attack3 ani (aliased) |
| sit motion | 1 | string | sit ani |
| simple rest motion | 1 | string | simple_rest ani |
| rest motion | 1 | string | rest ani |
| waiting motion | 1 | string | stay ani |
| simple move motion | 1 | string | simple_move ani |
| move motion | 1 | string | move ani |
| dash motion | 1 | string | dash ani |
| jump motion | 1 | string | jump ani |
| getitem motion | 1 | string | getitem ani |
| ghost motion | 1 | string×2 | ghost + ghost_dodge |
| etc motion | 1 | string×119 | shared skill motion pool |
| throw motion 1-1/1-2 | 1 | string | throw1/throw2 |
| throw motion 2-1/2-2 | 1 | string | summon1/summon2 |
| buff motion | 1 | string | summon2 (aliased) |
| skill | 6 | int pairs | per-growtype skill ID/level list |
| awakening skill | 10 (4 non-empty) | int pair | id+level per slot |
| awakening name | 5 | string pair | empty in retail |
| awakening 1 / awakening 2 | 5 + 5 | — | empty in retail |
| growtype 1..6 | 6 | — | empty in retail |
| growtype name | 6 | string | empty in retail |
| initial value | 1 | — | empty |

**Not present in swordman.chr**: `fire resistance`, `ice resistance`, `independent attack`, `physical critical hit chance`, `magical critical hit chance`. These exist on other-class .chr files (gunner / mage) but **not** swordman.

### 2.2 .chr scalar values (row 0 of all single-value sections)

| Field | Value | Unit | Tier |
|---|---|---|---|
| jump power | 430.0 | px/s (H1) | 1 (value), 3 (unit) |
| jump speed | 95 | int (raw) | 1 (value), 3 (semantic) |
| move speed | 850.0 | %×SPEED_VALUE_DEFAULT | 1 |
| attack speed | 850.0 | %×SPEED_VALUE_DEFAULT | 1 |
| cast speed | 700.0 | %×SPEED_VALUE_DEFAULT | 1 |
| weight | 68000.0 | audio-only | 1 |
| light resistance | -20.0 | % | 1 |
| dark resistance | 20.0 | % | 1 |
| width box | [40, 10] | int | 1 (value), 3 (semantic) |

### 2.3 Per-level vectors (row 0 = base, rows 1-16 = increments)

See `src/data/official/dnf/swordman/chr.ts → SWORDMAN_CHR_GROWTH`. Highlights:

| Vector | row 0 (base) | sample increment |
|---|---|---|
| hpMax | 180 | +45..+55 per tier |
| mpMax | 140 | +15..+30 per tier |
| mpRegenSpeed | 50 | +2.5..+5 per tier |
| hitRecovery | 600 (ms base) | +1..+3 (multiplier) per tier |
| physicalAttack | 7.5 | +3.5..+5.5 per tier |
| magicalAttack | 4.5 | +3.5..+5.5 per tier |
| physicalDefense | 7.5 | +3.5..+6.0 per tier |
| magicalDefense | 4.5 | +3.5..+5.5 per tier |
| inventoryLimit | 48000 | +270..+300 per tier |

### 2.4 Module damage rate (16 rows × 4 cols)

Per-skill-class × equipment-slot multiplier. See `chr.ts → SWORDMAN_CHR_MODULE_DAMAGE_RATE`. Pattern: defaults to 1.0, with periodic 0.7–1.2 variations.

### 2.5 Weapon hit info (6 rows × 6 cols)

| Slot | Hit | Blood | %scale | crit | pushBack | launch |
|---|---|---|---|---|---|---|
| 0 (mineralswda) | [cut]  | [blood]    |  90 | 1.00 |  0.00 |  0.00 |
| 1 (katanaa)     | [cut]  | [blood]    |  70 | 0.86 | -0.10 |  0.00 |
| 2 (sticka)      | [blow] | [no blood] | 100 | 1.20 |  0.10 | -0.95 |
| 3 (squareswda)  | [cut]  | [blood]    | 120 | 1.40 |  0.20 |  0.00 |
| 4 (—)           | [cut]  | [blood]    | 100 | 1.00 |  0.00 |  0.00 |
| 5 (beamswda)    | [cut]  | [blood]    |  60 | 0.85 | -0.15 |  0.00 |

Slot 4 has weapon_wav empty (skip in retail).

### 2.6 Skill IDs per growtype

| Growtype | Skill (id, level) pairs |
|---|---|
| 0 (base, shared) | 181-2, 182-2, 184-1, 179-7, 5-1, 46-1, 169-1, 174-1 |
| 1 (weaponmaster) | 27-1, 33-1, 37-1, 8-1, 25-1, 65-1, 94-1, 197-1 |
| 2 (souledge)     | 35-1, 29-1, 25-1, 65-1, 93-1, 197-1 |
| 3 (berserker)    | 56-1, 25-1, 65-1, 76-1, 197-1 |
| 4 (asura)        | 47-1, 55-1, 61-1, 25-1, 65-1, 20-1, 197-1 |
| 5 (demonicswordman variant) | 8-1, 25-1, 65-1, 20-1, 94-1, 27-1, 33-1, 37-1, 56-1, 187-1 |

Awakening (row 0/2/4/6, non-empty rows): 91-1, 89-1, 90-1, 92-1.

---

## 3. `.atk` schema + full-field table

### 3.1 Section catalog (across 92 swordman .atk files)

| Section | Files using | Semantic |
|---|---|---|
| damage reaction | 92 | always present marker (kind?) |
| attack type | 92 | always present (subtype unknown) |
| elemental property | 90 | always present marker |
| attack enemy | 90 | bool 0/1 |
| attack direction | 87 | bool marker |
| lift up | 84 | int — upward launch velocity (px/s) |
| weapon damage apply | 84 | bool 0/1 |
| push aside | 81 | int — horizontal pushback (px/s, signed) |
| no element | 73 | bool — no elemental damage type |
| physic | 66 | bool — physical class |
| damage | 48 | (none in swordman files) |
| hit down | 43 | bool — target plays hit_down reaction |
| hit wav | 40 | string — override hit sound |
| hit info | 38 | (overrides hit response) |
| down | 33 | bool — target enters knockdown state |
| magic | 26 | bool — magical class |
| damage bonus | 25 | int % — added on top of skill formula |
| hit horizon | 25 | bool — horizontal flinch |
| hit lift up | 19 | bool — airborne flinch (paired with lift up) |
| dark element | 17 | bool |
| pvp | 12 | bool — PvP-only attack |
| none (state) | 11 | bool |
| blood | 9 | (parameter) |
| knuck back | 9 | int — knockback (-1 = no knockback) |
| cut | 7 | bool |
| no blood | 6 | bool |
| blow | 4 | bool |
| etc | 4 | bool |
| hit direction | 4 | bool |
| front | 3 | bool |
| ignore weight | 2 | bool |
| stuck | 2 | bool |
| stun | 1 | bool |
| active status | 1 | (status payload) |
| bounce | 1 | bool |
| back | 1 | bool |
| attack friend | 1 | bool |

### 3.2 Reference values (key motion .atk)

| Atk | liftUp | pushAside | bonus | kind | element | reaction | down |
|---|---|---|---|---|---|---|---|
| attack1   |  75 |  30 | -15 | physic | none | hit_down    | false |
| attack2   |  90 |  30 | —   | physic | none | hit_horizon | false |
| attack3   | 300 |  40 |  20 | physic | none | hit_lift_up | true  |
| hardattack| 300 | 300 | —   | magic  | dark | hit_down    | true  |
| dashattack|  80 |  50 |  40 | physic | none | hit_horizon | false |
| jumpattack| 180 | 270 |  10 | physic | none | hit_down    | true  |
| hitback   | 220 | 600 | —   | physic | none | hit_lift_up | true  |
| grab      |   0 |   0 | —   | physic | none | hit_horizon | false |

### 3.3 Distribution stats

| Field | n | min | median | max |
|---|---|---|---|---|
| liftUp | 84 | -300 | 100 | 550 |
| pushAside | 81 | -200 | 40 | 600 |
| damageBonus | 24 | -40 | 20 | 110 |

---

## 4. `.skl` schema + landed shared skills

### 4.1 Schema (per .skl)

| Section | Type | Semantic |
|---|---|---|
| type | string | [active] / [passive] / [buff] / [autoskill] |
| weapon effect type | string | [physical] / [magical] / [special] |
| feature skill index | int | engine numeric ID |
| skill class | int | 1=offense, 2=movement, 3=charge, 4=utility |
| maximum level | int | runtime cap |
| growtype maximum level | int×6 | one per growtype slot |
| skill fitness growtype | int[] | eligible growtype list |
| required level | int | unlock |
| required level range | int | unlock cohort |
| pre required skill | int×2 | dependency (id, level) |
| command | string[] | input sequence tokens |
| consume mp | int×N | MP cost per level (usually [base, lvl20]) |
| cool time | int×2 | [dungeon_ms, pvp_ms] |
| casting time | int×2 | [base_ms, lvl20_ms] |
| durability decrease rate | int % | per cast |
| purchase cost | int | SP to learn |
| icon | string + int (×2) | atlas frame + lit variant |
| static data | int[] | formula-dependent payload |
| level property | mixed | formula schema |
| level info | mixed | per-level data table |
| dungeon / pvp / warroom / death tower | bool | scene availability flags |

### 4.2 Sample shared skills (landed in `skills.ts`)

| Skill | Type | Class | Req lvl | Command | Pre-req |
|---|---|---|---|---|---|
| guard | active | 1 | 5 | (down),(down),(attack) | — |
| hardattack | active | 3 | 1 | (up)&(skill) | — |
| backstep | active | 4 | 1 | (down)&(jump) | — |
| jumppowerup | active | 4 | 10 | (up),(buff) | — |
| statusup | passive | 4 | 2 | — | — |
| basicattackup | passive | 4 | 1 | — | — |
| quickstanding | active | 4 | 1 | (jump) | — |
| throwmastery | passive | 4 | 10 | — | — |
| diehard | active | 2 | 20 | (up),(up),(buff) | — |
| reckless | active | 2 | 25 | (right),(right),(buff) | — |
| ghoststep | active | 3 | 20 | (up),(down),(buff) | (41, 1) |

(Other 12+ landed; see `skills.ts → SWORDMAN_SKILL`.)

### 4.3 Pending extraction

~80 additional `.skl` are listed in `SWORDMAN_SKILL_PENDING_EXTRACTION`. They include weapon-mastery passives, ex-upgrades, transform-shared offensive specials (tripleslash / momentaryslash / wave family), and utility passives.

---

## 5. `.ani` schema + frame sequences

### 5.1 Per-frame schema

| Field | Type | Semantic |
|---|---|---|
| i | int | frame index (0-based) |
| delay | int (ms) | hold time; `10000` = wait-for-engine-event sentinel |
| imgParam | int | atlas frame index in body sprite (.img) |
| sprite | string | atlas template (`...sm_body%04d.img`) |
| x, y | int | aniOffset (top-left → feet anchor) |
| dmg | int×6 [] | hurtbox 3D boxes (x, y, z, w, h, d) |
| atk | int×6 [] | active hitbox 3D boxes (when present) |

### 5.2 Core motion summary (24 motions landed in `animations.ts`)

| Motion | frames | loop | timed ms | external waits | has atk | aniOffset (frame 0) |
|---|---|---|---|---|---|---|
| stay | 6 | true | 720 | — | — | (-232, -333) |
| simple_rest | 4 | true | 1050 | — | — | (-232, -333) |
| rest | 4 | true | 1050 | — | — | (-232, -333) |
| move | 8 | true | 800 | — | — | (-232, -333) |
| simple_move | 8 | true | 800 | — | — | (-232, -333) |
| dash | 8 | true | 800 | — | — | (-232, -333) |
| jump | 16 | false | 1150 | [7, 14] (apex hold + landing hold) | — | (-232, -333) |
| jumpattack | 6 | false | 300 | — | frame 2 | (-232, -333) |
| attack1 | 10 | false | 600 | — | — | (-232, -333) |
| attack2 | 11 | false | 650 | — | — | (-232, -333) |
| attack3 | 9 | false | 550 | — | frames 2-3 | (-232, -333) |
| hardattack | 18 | false | 950 | — | — | (-232, -333) |
| dashattack | 10 | false | 630 | — | frames 2-3 | (-232, -333) |
| damage1 | 1 | false | 0 | [0] | — | (-232, -333) |
| damage2 | 1 | false | 0 | [0] | — | (-232, -333) |
| hitback | 9 | false | 850 | — | — | (-232, -333) |
| down | 6 | false | 660 | [3, 4] | — | (-232, -333) |
| overturn | 1 | false | 0 | [0] | — | **(-226, -246)** |
| sit | 1 | false | 150 | — | — | (-232, -333) |
| getitem | 1 | false | 200 | — | — | (-232, -333) |
| ghost | 4 | true | 640 | — | — | (-232, -333) |
| guard | 2 | false | 0 | [0, 1] | — | (-232, -333) |
| throw1 | 6 | false | 300 | — | — | (-232, -333) |
| throw2 | 11 | false | 600 | — | — | (-232, -333) |

### 5.3 jump.ani phase breakdown (Tier-1 raw)

```
frame 0-1 (imgParam 125-126, delay 100ms): liftoff ramp-up
frame 2-6 (imgParam 127-128, delay 80ms):  rising arc
frame 7   (imgParam 128, delay 10000):     apex hold — waits for sq_JumpDownStartFrame trigger
frame 8   (imgParam 129, delay 100ms):     descent start
frame 9-13(imgParam 130-131, delay 80ms):  falling arc
frame 14  (imgParam 131, delay 10000):     landing hold — waits for ground-collision event
frame 15  (imgParam 132, delay 50ms):      landing recovery
```

The two `delay=10000` markers are how the engine couples animation frames to physics-driven events (apex detected by `vz<=0`, landing detected by `z<=0`). The exact event tags (sq_JumpUpStartFrame / sq_JumpDownStartFrame / sq_JumpLandStartFrame) are NOT extracted into JSON — they are encoded in `.ani` `delay_event` records that the current `tools/dnf-extract.exe` parser does not emit.

### 5.4 Active hitbox extraction examples

| Motion | Frame | atk hitbox [x, y, z, w, h, d] |
|---|---|---|
| attack3 | 2 | [-32, -13, 0, 179, 26, 94] |
| attack3 | 3 | [15, -13, 1, 137, 26, 138] |
| jumpattack | 2 | [13, -13, -11, 88, 26, 167] |

Other attacks (attack1/attack2/hardattack) leave the `.ani` without explicit `atk` blocks — the active window is bound at runtime by .skl referencing the corresponding `.atk` file, with the engine treating the entire animation as active or using a default selection.

---

## 6. `.act` cancel system

### 6.1 Coverage status

19 `cancel*.skl` passives extracted (`SWORDMAN_CANCEL` in `cancels.ts`). Each passive records:

- source motion name (parsed from filename: `cancelupperslash` → source = `upperslash`)
- required level / purchase cost / eligible growtype list
- growtype max-level vector

### 6.2 Cancel window timings — PARTIAL (2026-05-22 update)

**Original status** (incorrect): assumed `dnf-extract` does not surface IDs 371543/241483/371546/371547/371549.

**Verified state** (Tier-1, dnf-extract output of `cancelhardattack.skl`): the C++ tool **does** emit these sections — they appear under standard stringtable names with dual semantics in cancel files:
- `[purchase cost]` = cancelWindowStart (int, frame number; e.g. `10`)
- `[required level]` = cancelWindowDuration (int, frame count) — when present
- `[skill class]` = cancelGroup (int; e.g. `3`)
- `[growtype maximum level]` = cancelWeaponMask (int[6]; e.g. `[1,1,1,1,1,1]`)
- `[skill fitness growtype]` = cancelTargetSlots (int[]; e.g. `[0,1,2,3,4]`)

**Real gap**: Node-side dual-semantics interpreter was deleted in commit `e1f3e0f` (2026-05-19, full TS extraction stack removal). The `SklAnalyzer.ts` referenced in CLAUDE.md no longer exists. ~80 lines TS / ~1h to restore in `src/data/official/dnf/swordman/cancels.ts` — filename-pattern detection `cancel*` + map standard sections to dual semantics.

`cancels.ts` placeholder-null fields remain until restoration commit.

### 6.3 Cancel sources observed

| Source motion | Pasive learnable by | Required level |
|---|---|---|
| upperslash    | growtypes 0-4 (universal) | 1 |
| hardattack    | universal | 2 |
| guard         | universal | 15 |
| tripleslash   | universal | 20 |
| triplestab    | universal | varies |
| backstep      | universal | varies |
| throwitem     | universal | varies |
| wave          | universal | varies |
| reflectguard  | universal | varies |
| chargecrash   | growtype 3 only | 25+ |
| hopsmash      | growtype 3 only | 25+ |
| moonlightslash | growtype 2 only | 25+ |
| gorecross     | varies | varies |
| flowmind      | varies | varies |
| bloodsword / bloodblast / vaneslash / grabblastblood / ghostsidewind | varies | varies |

---

## 7. Shared hit/death motion truths

| Motion | Where defined | Notes |
|---|---|---|
| damage1 | swordman.chr `damage motion 1` | 1 frame, delay=10000 sentinel, light flinch |
| damage2 | swordman.chr `damage motion 2` | 1 frame, delay=10000, medium flinch |
| hitback | swordman.chr `etc motion` (also used via swordman.chr `hitback` slot present? — no, only via etc-motion list) | 9 frames, ~850ms |
| down | swordman.chr `down motion` | 6 frames, ~660ms timed, external waits at frames 3-4 |
| overturn | swordman.chr `overturn motion` | 1 frame, **distinct aniOffset (-226, -246) for lying pose** |
| sit | swordman.chr `sit motion` | 1 frame, 150ms |
| guard | swordman.chr `etc motion` (and aliased via the guard skill) | 2 frames, delay=10000 each = engine-controlled hold |
| getitem | swordman.chr `getitem motion` | 1 frame, 200ms |
| **getup** | NOT in swordman.chr motion slots | likely in `character/common/` — pending extraction |
| **death** | NOT in swordman.chr motion slots | likely in `character/common/` — pending extraction |
| **quick rebound** | NOT in swordman.chr | `quickstanding` skill exists; ani path not in chr |

---

## 8. Behavior-rule derivations

### 8.1 Reaction selection: .atk → motion

Working baseline (Tier 3, `motions.ts → SWORDMAN_REACTION_RULES`):

1. If `.atk.liftUp >= 200` → `hitback` motion (airborne arc).
2. Else if `.atk.causesDown == true` → `down` motion.
3. Else if `.atk.hitReaction == "hit_lift_up"` → `hitback`.
4. Else if `.atk.hitReaction == "hit_down"` → `damage2`.
5. Else if `.atk.hitReaction == "hit_horizon"` → `damage1`.

Falsifiable by: reverse-engineering DNF.exe combat dispatch (or by frame-accurate in-game sampling).

### 8.2 Cancel passive learnability

A cancel passive is learnable iff the player's current growtype index appears in `cancelXxx.eligibleGrowtypes`. **Whether the cancel triggers** at runtime depends on the un-extracted `cancelWindow.startFrame` / `durationFrames` / `allowedTargetSlots` — placeholder `null` until reverse engineered.

---

## 9. Physics derivations

### 9.1 Inherited from physics phase 1

- `DEFAULT_GRAVITY_ACCEL = -1500 px/s²` (Tier 1, from `sqr/dnf_enum_header.nut`)
- `FORCE_TO_VELOCITY_CONST = 4000` — formula `v = k × F / weight`
- `SPEED_VALUE_DEFAULT = 1000` (1000 = 100%)
- `X_NORMALMOVE_VELOCITY = 143 px/s` (at SPEED_VALUE_DEFAULT)
- See `src/data/official/dnf/physics.ts` for full table.

### 9.2 Launch arcs (Tier 1, pure arithmetic)

For `.atk.liftUp = v0` (px/s) launched against gravity `g = 1500 px/s²`:

| atk | v0 | peak (px) | rise (s) |
|---|---|---|---|
| attack3 | 300 |  30.0 | 0.20 |
| hardattack | 300 |  30.0 | 0.20 |
| jumpattack | 180 |  10.8 | 0.12 |
| hitback | 220 |  16.1 | 0.147 |

(Already landed in `src/data/official/dnf/attacks.ts → SWORDMAN_ATK_DERIVED`.)

### 9.3 Pushback × weight ratio

`v_push = FORCE_TO_VELOCITY_CONST × pushAside / target_weight`. For a swordman target hit by hitback (`pushAside=600`, target `weight=68000`):

```
v_push = 4000 × 600 / 68000 = 35.29 px/s
```

This is the horizontal pushback velocity. Subject to engine override (some .atk flag `ignore weight`).

### 9.4 jump_power → initial Z velocity

H1 hypothesis (carried over from physics phase 1): `jump_power = 430.0` is read directly as `initialZVelocity` (px/s). Under H1, peak height = `430² / 3000 = 61.6 px` and rise time = `430 / 1500 = 0.287 s`. **Falsifiable by**: reverse engineering DNF.exe jump-initiator.

H2 alternative: `jump_power` is a %-scaler over an engine hidden base (e.g. 1800 px/s × 430/1000 → 774 px/s). Both H1 and H2 remain open; mark `requiresManualVerification`.

---

## 10. Completeness matrix

### 10.1 Tier 1 (PVF-extracted, high confidence)

| Component | Files | Field count |
|---|---|---|
| `.chr` scalar | 1 | 12 scalars |
| `.chr` growth vectors | 1 | 9 × 17 = 153 |
| `.chr` module damage rate | 1 | 16 × 4 = 64 |
| `.chr` weapon hit info | 1 | 6 × 6 = 36 |
| `.chr` weapon wav | 1 | 6 × 4 = 24 |
| `.chr` weapon skill info | 1 | 24 |
| `.chr` motion ani map | 1 | 24 + 119 etc-motion |
| `.atk` files | 92 | ~18 each (~1656 datapoints) |
| `.ani` core motions | 24 | per-frame structure |
| `.ani` all files indexed | 161 | (raw JSON exists in `.tmp/`) |
| `.skl` shared-class active/passive | 23 | per-skill schema |
| `cancel*.skl` passives (meta) | 19 | learnability + level |

### 10.2 Tier 3 (local_baseline / requiresManualVerification)

| Field | Reason |
|---|---|
| cancel window start/duration/allowedSlots/weaponMask/groupId | dnf-extract does not surface section IDs 371543/241483/371546/371547/371549 |
| `.ani` delay_event tags (jump phase / cancel window) | parser does not emit delay_event records |
| hit-reaction → motion mapping | engine dispatch is undocumented |
| weapon_skill_info column/row layout | layout (6×4 vs other) needs DNF.exe RE |
| upgrade_weapon_attack_power_rate layout | same |
| jump_power unit (px/s vs %-scaler) | inherited from physics phase 1 H1 |
| jump_speed semantic | plain int — usage unclear |
| width_box semantic | int pair — collision vs render unclear |
| death motion / getup motion paths | not in swordman.chr; live in shared common/ |

---

## 11. Pending work

### 11.1 Pending extraction (data exists, not yet landed)

- ~80 swordman `.skl` files listed in `SWORDMAN_SKILL_PENDING_EXTRACTION` (`skills.ts`).
- `character/common/` motion .ani (death / getup / quick_rebound).
- Per-frame `delay_event` tags inside .ani (need parser upgrade).
- `.skl` cancel-window section IDs (need parser upgrade).

### 11.2 Pending verification (Tier 3 → 1/2)

- jump_power / jump_speed unit closure (RE DNF.exe).
- Hit-reaction → motion dispatch rule (RE or in-game frame sampling).
- Weapon_skill_info / upgrade_weapon_attack_power_rate layout (RE or cross-reference with other-class .chr).

### 11.3 Pending engineering

- Wire `swordman` re-export into consumer code (`combat/` kernel — out of scope this pass).
- Add a static test verifying `SWORDMAN_ANI` matches frame counts in raw JSONL.
- Decide whether to deprecate the top-level `attacks.ts` (covers only swordman lift_up) — see file header note.

---

## 12. File manifest (this pass)

### 12.1 Raw extraction artifacts (not committed)

```
.tmp/dnf-research/swordman/
├── list.json                  ← 1241 swordman files
├── skl-list.json              ← 208 skill/swordman/ files
├── chr.json                   ← swordman.chr full dump
├── stay.ani.json              ← reference for .ani schema
├── critical-anis.jsonl        ← jumpattack/dashattack/jump/damage/down/overturn
├── anis-dump.jsonl            ← 161 .ani all-batch dump
├── atks-dump.jsonl            ← 92 .atk all-batch dump
├── atk-parsed.json            ← normalized 92 .atk
├── cancels-dump.jsonl         ← 6 cancel*.skl sample
├── cancel-skls.jsonl          ← 19 cancel*.skl all
├── common-skls.jsonl          ← 23 shared active/passive
├── more-skls.jsonl            ← 29 additional skl
├── atk/                       ← 92 per-atk JSON
├── ani/                       ← 161 per-ani JSON
└── skl/                       ← 71 per-skl JSON
```

### 12.2 Landed `.ts` modules

```
src/data/official/dnf/swordman/
├── chr.ts          ← 12 scalar + 9 growth vectors + module/weapon/skill metadata
├── attacks.ts      ← 92 .atk fully parsed
├── animations.ts   ← 24 core-motion frame sequences
├── cancels.ts      ← 19 cancel passives (window timings = null)
├── skills.ts       ← 23 shared-class .skl
├── motions.ts      ← reaction-mapping baseline + core hit-motion facts
└── index.ts        ← re-export
```

`src/data/official/dnf/index.ts` updated to also re-export `swordman` namespace.

### 12.3 Verification

```
npm run typecheck   → passed
npm run static:test → 50/50 passed
```
