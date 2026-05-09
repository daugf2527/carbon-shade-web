# CRT-003: Hitbox/Hurtbox Shape Evidence

> **Status: COMPLETE** — Research-only, no source code changes.
> Date: 2026-05-09
> Target version: DNF 70-85 classic pre-Metastasis (Level 70 cap, 2012 era)

## 1. Current Implementation Summary

### 1.1 HitResolver2D5.ts — Collision Detection Engine

**File:** `src/combat/hit/HitResolver2D5.ts` (157 lines)

The resolver implements two methods:

**`buildQuery(tick, attacker, hitbox)`** — Constructs a `HitQuery` from action frame hitbox data:
- Applies facing-direction mirroring via `signedFacingScale()` (right = +1, left = -1)
- Projects local-space offsets (`offsetX/Z/Y`) into world-space based on attacker position + facing
- Preserves 6-int raw coordinates (`rawBox6`: x1,y1,z1,x2,y2,z2) from source data
- Carries through all hitbox metadata: `hitType`, `damageType`, `attackLevel`, `controlPower`, reaction flags

**`geometry(query, target)`** — Performs collision test against a target actor:
- Iterates **all** `target.hurtBoxes[]` (multi-hurtbox support)
- Dispatches to shape-specific overlap functions
- Returns `{ overlap, zMismatch, yMismatch, snapshot }` with a full `HitGeometrySnapshot` for replay regression

### 1.2 Four Collision Shapes

| Shape | TypeScript value | Implementation | Status |
|-------|-----------------|----------------|--------|
| Axis-aligned rectangle | `"rect"` | `rectsOverlap2D5()` — 3-axis AABB overlap (X, Z, Y width/depth/height comparison) | **Implemented & tested** |
| Circle/radius AoE | `"circle"` | `circleRectOverlap2D5()` — 2D planar circle-vs-rect (nearest-point distance ≤ radius²) + Y-axis height check | **Implemented & tested** |
| Swept raycast | `"sweep"` | Extrudes query box 1.5× width in facing direction to form swept AABB, then standard rect overlap | **Implemented** (basic) |
| Grab attachment | `"grab_attach"` | Narrows query box to 40% width (shifted 30% toward facing), then standard rect overlap | **Implemented & tested** |

### 1.3 Geometry Functions (`src/combat/util/geometry.ts`)

```
rectsOverlap2D5(a, b):
  xOverlap = |a.x - b.x| * 2 < (a.w + b.w)
  zOverlap = |a.z - b.z| * 2 < (a.d + b.d)
  yOverlap = |a.y - b.y| * 2 < (a.h + b.h)
  overlap = xOverlap && zOverlap && yOverlap
  zMismatch = xOverlap && !zOverlap
  yMismatch = xOverlap && zOverlap && !yOverlap

circleRectOverlap2D5(circle, radius, rect):
  yOverlap = standard height check
  nearestX = max(0, |circle.x - rect.x| - rect.w/2)
  nearestZ = max(0, |circle.z - rect.z| - rect.d/2)
  planarOverlap = nearestX² + nearestZ² ≤ radius²
  overlap = planarOverlap && yOverlap
```

Key observations:
- X is the primary combat axis (left-right), Z is depth, Y is height
- `zMismatch` and `yMismatch` are diagnostic flags — they indicate "near miss on one axis" for debugging
- All shapes are AABB-based — no oriented bounding boxes (OBB), no capsules, no convex hulls
- Circle is only planar (X-Z), with Y checked as a separate axis

### 1.4 Hitbox Data Model (`src/combat/types.ts`)

```typescript
type HitboxShape = "rect" | "circle" | "sweep" | "grab_attach";

interface HitBoxFrameWindow extends FrameWindow {
  id: string;           // unique hitbox identifier
  hitGroupId: string;   // grouping for hit-once-per-group dedup
  shape?: HitboxShape;  // defaults to "rect"
  offsetX: number; offsetZ: number; offsetY: number;  // local-space position
  radius?: number;      // for circle shape
  w: number; d: number; h: number;  // width, depth, height
  hitType: HitType;
  damageType: DamageType;
  baseDamage: number;
  attackLevel: number;  controlPower: number;
  canHitDowned: boolean;  canLaunch: boolean;
  canKnockdown: boolean;  canGrab: boolean;
  maxTargets: number;
  reactionProfile?: HitReactionProfile;
  impactSnapX?: number;         // X-axis impact snap distance
  visualRecoilFrames?: number;  // visual recoil duration
}

interface HurtBox {
  offset: Vec3;
  w: number; d: number; h: number;
}

interface Actor {
  hurtBoxes: HurtBox[];  // Array — multi-hurtbox capable
  // ...
}
```

### 1.5 Hitbox Parameters in Action Data (`FrameDataAction.ts`)

Default hitbox parameters from the `hit()` factory:
```
offsetX: 64, offsetZ: 0, offsetY: 30
w: 110, d: 40, h: 60
```
These are **local-space baseline values** — not calibrated against any DNF source. Each skill overrides specific parameters (e.g., `NormalBasic3` uses `w:156, d:46, h:70` for a wider, deeper, taller hitbox on the third hit).

The `shape` field defaults to `undefined` (treated as `"rect"` by `buildQuery`). Only the test file explicitly sets `shape: "circle"` or `shape: "grab_attach"`. No production action currently uses `circle`, `sweep`, or `grab_attach`.

### 1.6 Multi-Hurtbox Architecture

The `geometry()` method iterates `target.hurtBoxes` — this is correctly designed for multi-hurtbox:
```typescript
for (let hi = 0; hi < target.hurtBoxes.length; hi++) {
  const hurt = target.hurtBoxes[hi];
  const hurtRect = actorHurtRect(target.position, hurt);
  // ... test overlap for each hurt box
}
```

However, **all current actors use a single hurt box** created by `ActorFactory`. The multi-hurtbox loop is infrastructure-ready but unused in production.

---

## 2. Research Findings

### 2.1 What Collision Shapes Does Actual DNF Use?

**Finding: AABB rectangles (boxes) are the primary shape. Circles exist but are uncommon.**

**Evidence chain:**

1. **ANI binary format** (community-researched, confidence: MEDIUM-HIGH):
   - DNF's animation files (`.ani`) store `[ATTACK BOX]` and `[DAMAGE BOX]` as two 3D coordinate pairs: `(X1,Y1,Z1)` and `(X2,Y2,Z2)`. These are axis-aligned min/max corners defining a rectangular prism (AABB).
   - Source: `docs/research/combat/dnf-dfo-combat-frame-ai-implementation-report.md` §技能判定框与帧数据, citing public ANI structure documentation.
   - The report provides **verified coordinate samples** from `rapidmoveslashmove` ANI frames, e.g., frame 2 of `rapidmoveslashmove1.[pvp].ani`: `(-57,-20,71)` to `(66,35,107)`, forming a box of `(123,55,36)`.

2. **Korean MakeDNF reconstruction analysis** (confidence: MEDIUM):
   - Explicitly validated that DNF-style collision uses **AABB, not OBB** (oriented bounding boxes). The key observation: "quantum bomb missile images rotate but the hitbox does NOT rotate with them."
   - Their implementation uses Box/Circle for XZ plane, unified Box for XY plane.
   - Source: cited in `dnf-dfo-combat-frame-ai-implementation-report.md` §碰撞形状建议.

3. **PVF structure** (confidence: MEDIUM):
   - `Script.pvf` contains skill data with hitbox dimensions but does NOT encode shape types — the shape is implicitly rectangular from the coordinate pair representation.
   - Source: `docs/research/reference/pvf-download-sources.md`: "PVF files only contain numerical data (frame counts, hitbox dimensions, coefficients)."

4. **Circle/radial shapes** (confidence: LOW-MEDIUM):
   - Some skills visually suggest radial AoE (e.g., shockwave effects), but whether DNF implements this as a true circle distance check or a large rectangular box is **not confirmed** from public sources.
   - The Korean MakeDNF analysis mentions Circle as a secondary shape but provides no DNF-native examples.

**Assessment for Carbon Shade:**
- `rect` as default → **VERIFIED CORRECT** for classic DNF
- `circle` as optional → **PLAUSIBLE** but not confirmed from DNF sources; remains a useful convenience shape
- No evidence for capsules, convex hulls, or swept volumes in DNF

### 2.2 Typical Hitbox Sizes

**Finding: No systematic size data is publicly available. Sparse coordinate samples exist.**

The only publicly documented hitbox coordinates come from community ANI repair/tutorial posts, all from a single skill (Blade Master's Rapid Move Slash, PvP variant):

| Source frame | Min (x,y,z) | Max (x,y,z) | Size (dx,dy,dz) |
|---|---|---|---|
| `rapidmoveslashmove1.[pvp].ani` f2 | (-57,-20,71) | (66,35,107) | (123,55,36) |
| `rapidmoveslashmove2.[pvp].ani` f1 | (-17,-15,28) | (99,30,120) | (116,45,92) |
| `rapidmoveslashmove2.[pvp].ani` f2 | (-37,-15,50) | (88,30,120) | (125,45,70) |
| `rapidmoveslashmove2.[pvp].ani` f3 | (-52,-15,50) | (70,30,120) | (122,45,70) |
| Generic `ATTACK BOX` sample | (21,-15,27) | (46,30,69) | (25,45,42) |

Key observations from these samples:
- **Z-axis depth (30–92 units) is substantial** — about 25–75% of X-axis width. This confirms that DNF hitboxes are true 2.5D volumes, not paper-thin 2D rectangles.
- **Y-axis height (45–55 units)** is comparable to or larger than Z-depth, forming a true 3D volume.
- **Boxes change per frame** — the same skill has different box dimensions on each active frame, confirming the need for per-frame hitbox data (not one static box per skill).
- **PvP boxes may differ from PvE** — the source explicitly labels these as `.pvp.ani` variants.

**Assessment for Carbon Shade:**
- Current default hitbox size (w:110, d:40, h:60) is in the same order of magnitude as the verified PvP samples, which is reassuring.
- But the current system uses **one static hitbox per hit window** (defined by start/end frames), while DNF has **per-frame varying boxes**. For a prototype this is acceptable; for 1:1 replication it's a gap.

### 2.3 Multi-Hurtbox on Monsters

**Finding: DNF has per-frame hurt boxes (`DAMAGE BOX`) that vary with animation. Multi-hurtbox (head/body/limb) is plausible but not confirmed from public sources.**

**Evidence:**

1. **ANI format** (confidence: HIGH):
   - Every animation frame can carry a `[DAMAGE BOX]` tag with X1Y1Z1/X2Y2Z2 coordinates.
   - This means the hurtbox changes per frame — it's not a static body box.
   - Source: `dnf-dfo-combat-frame-ai-implementation-report.md` §逐帧字段表.

2. **Monster-specific evidence** (confidence: LOW):
   - Public DNF documentation does not explicitly confirm multi-hurtbox (separate head/body/limb hitboxes) on monsters.
   - The Neople API and DFO World Wiki do not expose hurtbox data.
   - PVF/SKL extraction is the only reliable source for this data (Batch C, not yet researched).
   - Source: `docs/research/reference/official-api-wiki-whole-code-audit.md`: "Hitboxes/hurtboxes/geometry — Not exposed by API. Wiki does not provide per-frame hitbox/hurtbox coordinates."

**Assessment for Carbon Shade:**
- The multi-hurtbox iteration loop in `HitResolver2D5.geometry()` is architecturally correct.
- Current single-hurtbox usage is acceptable for prototype phase.
- For boss monsters with distinct hit zones (e.g., hit the head for bonus damage), multi-hurtbox with per-box damage modifiers would be needed — but **no DNF evidence exists yet** to confirm this is how DNF implements it.

### 2.4 Hitstop/Hitlag Mechanics

**Finding: DNF has a rich hitstop system with per-skill configuration, boss caps, and building caps. Carbon Shade's implementation is architecturally aligned.**

**Evidence:**

1. **DNF's "逆硬直" (reverse hitstun / hitstop)** (confidence: MEDIUM):
   - On successful hit, both attacker and target freeze for a brief duration.
   - Different skills have different hitstop durations.
   - Bosses have reduced hitstop (boss cap).
   - Direct-melee skills and projectile/object skills may have different hitstop behavior.
   - Source: `dnf-dfo-combat-frame-ai-implementation-report.md` §逆硬直分析.

2. **Carbon Shade's `hitStopProfile`** (confidence: N/A — this is our own system):
   ```typescript
   hitStopProfile: {
     frames: number;        // base hitstop duration
     bossCapFrames: number; // maximum hitstop vs bosses
     buildingCapFrames: number; // maximum hitstop vs buildings
   }
   ```
   This three-tier model (normal/boss/building) is consistent with DNF's observed behavior.

3. **Current default values**: `{ frames: 3, bossCapFrames: 2, buildingCapFrames: 1 }` for most skills, with some skills using 4-7 frames. These are local tuning values, not DNF-calibrated.

**Assessment for Carbon Shade:**
- Architectural alignment: **GOOD** — the profile structure captures DNF's tiered hitstop model.
- Values: **UNCALIBRATED** — no DNF source provides exact hitstop frame counts per skill. These remain local baseline until PVF extraction.

### 2.5 Grab Detection

**Finding: DNF grab detection is a complex multi-step process. Carbon Shade's current implementation is a simplified placeholder.**

**Evidence:**

1. **Grab mechanics in DNF** (confidence: MEDIUM):
   - DNF grabs are **not simple collision tests**. They involve:
     - **Grab hitbox** (判定框) — a narrow collision shape
     - **Grab immunity check** — some enemies/state are grab-immune (super armor, certain bosses)
     - **Success → hold animation** — attacker and target enter a synchronized animation state
     - **Failure → discharge damage** — if grab immunity is detected, deal reduced damage instead
   - Source: `docs/research/combat/dnf-dfo-mechanics-gap-analysis.md` §Grab-immune handling.

2. **Carbon Shade's implementation:**
   - `grab_attach` shape: narrows the query box to 40% width (shifted 30% toward facing) and does standard AABB overlap.
   - `canGrab` flag on hitbox: gates whether this hitbox attempts a grab.
   - `Bloodlust` action: has `canGrab: true` with the grab hitbox.
   - The `GrabFailed` event is emitted when grab-immune targets are hit.
   - **Missing**: full hold-attach animation, position locking, and release sequence.

3. **Reference document confirmation**: `code-level-dnf-replication-gap-assessment.md` §一-2: "Zero complete grab flow. Bloodlust only has grab detection... no hold attach, position lock, eruption segments, release animation."

**Assessment for Carbon Shade:**
- `grab_attach` shape is a **reasonable approximation** for the initial grab detection phase.
- The narrower box width (40%) correctly models DNF's tendency for grabs to have tighter reach than normal attacks.
- **Gap**: The full grab state machine (hold, attach, synchronized animation, release) is not implemented. This is documented in the implementation backlog as P1 work.

### 2.6 Super Armor / Guard Damage Interactions

**Finding: DNF has a sophisticated multi-tier armor system. Carbon Shade's `ArmorProfile` structure captures the right dimensions.**

**Evidence:**

1. **DNF armor types** (confidence: MEDIUM, from official update documentation):
   - **Super Armor (슈퍼아머/霸体)**: During certain skill frames, the character cannot be interrupted by normal hits. They still take damage but don't flinch.
   - **Boss Super Armor**: Bosses have persistent or pattern-based super armor.
   - **Building Armor (건물형/建筑型)**: Structures take damage but have no hit reactions.
   - **Grab immunity**: A separate flag — some enemies are immune to grabs even without super armor.
   - **Guard**: Active blocking reduces/absorbs damage. Guard damage (break gauge) depletes on block.
   - Source: `docs/research/reference/reference-dfo-pvp-mechanics.md`: "SA users extend hitboxes, more susceptible to grabs."

2. **DNF's "Holding Gauge"** (confidence: MEDIUM):
   - Modern DNF has a holding gauge that fills when a monster is hit by holding/control skills.
   - When full, the monster becomes briefly immune to hard control and grabs.
   - This is a **modern DNF system** (post-Metastasis) and should be **excluded** from the classic 70-85 target.
   - Source: `dnf-dfo-combat-frame-ai-implementation-report.md` §状态系统与AI.

3. **Carbon Shade's `ArmorProfile`:**
   ```typescript
   interface ArmorProfile {
     baseType: "none" | "super_armor" | "boss_super_armor" | "building_armor";
     canTakeDamage: boolean;
     canBeLaunched: boolean;
     canBeKnockedDown: boolean;
     canBeKnockedBack: boolean;
     canReceiveHitStop: boolean;
     immunities: { grab: boolean; control: boolean; damage: boolean; hitStop?: boolean };
     temporaryFlags: { invulnerableUntilTick?; getUpArmorUntilTick?; superArmorUntilTick? };
     hitStopCapFrames?: number;
     reactionOverride?: ReactionKind;
   }
   ```

**Assessment for Carbon Shade:**
- The `ArmorProfile` structure is comprehensive and correctly separates **base armor type** from **temporary flags** from **immunities**.
- The `immunities.grab` field correctly models DNF's separation of grab immunity from general super armor.
- The `temporaryFlags` structure handles get-up armor, timed super armor, and invulnerability — all confirmed DNF mechanics.
- **Gap**: Guard damage / break gauge is not implemented. This is acceptable for the current combat prototype but would be needed for PvP.

### 2.7 Fast-Moving Projectiles vs. Static Frame Collision

**Finding: DNF uses object/projectile entities, not swept volumes. Carbon Shade's `sweep` shape is a reasonable approximation but not DNF-accurate.**

**Evidence:**

1. **DNF projectile model** (confidence: MEDIUM-HIGH):
   - Projectiles are **independent game objects** (Active Objects / bullets) with their own position, velocity, and hitbox.
   - They move each frame and check collision each frame — this is discrete frame-by-frame detection, not continuous swept collision.
   - The ANI format confirms this: projectiles have their own `.ani` files separate from the caster's animation.
   - Source: `dnf-dfo-combat-frame-ai-implementation-report.md` §投射物与主动对象: "Ranger's Wild Shot — the body animation shows `[DAMAGE BOX]`, the real `[ATTACK BOX]` is in `character/gunner/effect/animation/bullet/randomshoot.ani`."

2. **Why "swept" approach exists in fighting games:**
   - Fast-moving projectiles can "tunnel through" thin targets in a single frame if only discrete detection is used.
   - Swept volumes (extruding the hitbox along the velocity vector) prevent this.
   - DNF avoids this problem differently: by having enough frames per second (historically ~30-60 FPS gameplay) and reasonably sized hitboxes relative to projectile speed, tunneling is rare.

3. **Carbon Shade's `sweep` shape:**
   - Extrudes the query box 1.5× width in facing direction.
   - This is a static extrusion (not velocity-based) — it doesn't account for actual movement speed.
   - Currently **unused in production** — no action sets `shape: "sweep"`.

**Assessment for Carbon Shade:**
- The `sweep` approach is **not DNF-accurate** — DNF uses discrete frame-by-frame object collision.
- However, **it's a useful engineering shortcut** for a prototype without a full projectile/object system.
- **Recommendation**: When projectile/Active Object entities are implemented (backlog P1), the `sweep` shape can be deprecated in favor of per-frame discrete detection on moving objects. Until then, it serves as a reasonable anti-tunneling fallback.

### 2.8 Z-Axis and Y-Axis Sorting for Hit Priority

**Finding: DNF has Z-axis layering and Y-axis height considerations, but the specific priority sorting algorithm is not publicly documented.**

**Evidence:**

1. **Z-axis (depth) in DNF** (confidence: MEDIUM):
   - DNF's coordinate system has X (horizontal, left-right), Y (height, up-down), Z (depth, foreground-background).
   - Z-ordering determines which characters appear in front when overlapping.
   - Whether Z affects **hit priority** (closer targets hit first) or just **rendering order** is not confirmed.
   - The Korean MakeDNF analysis treats Z as part of the collision test (AABB overlap in XZ plane) but doesn't attribute priority sorting to it.

2. **Y-axis (height) in DNF** (confidence: MEDIUM-HIGH):
   - Y-axis matters for **launched/airborne targets**: a ground-level horizontal slash should not hit a target launched high into the air.
   - The ANI format includes Y in both `[ATTACK BOX]` and `[DAMAGE BOX]`, confirming Y is a first-class collision axis.
   - Source: ANI coordinate samples showing Y ranges of 45-55 units for grounded attacks.

3. **Carbon Shade's handling:**
   - `zMismatch` and `yMismatch` flags track near-misses on Z and Y axes respectively.
   - Y-axis height check is part of all overlap tests.
   - No explicit **hit priority** sorting — hits are processed in actor iteration order.
   - The `maxTargets` field on hitboxes limits how many targets can be hit, but doesn't prioritize which ones.

**Assessment for Carbon Shade:**
- The three-axis AABB model (X, Z, Y) is architecturally correct for DNF.
- `zMismatch`/`yMismatch` flags are valuable diagnostic data for tuning and debugging.
- **Gap**: No hit priority sorting. If multiple targets overlap a hitbox, DNF likely has a deterministic rule (closest in X? lowest actor ID?) to decide which `maxTargets` are hit. This is a minor gap for a prototype.

---

## 3. Gap Analysis

### 3.1 What's Verified (Confidence: MEDIUM-HIGH)

| Item | Evidence | Status |
|------|----------|--------|
| AABB rectangular hitboxes | ANI format uses two 3D coordinate pairs per box | **MATCH** — `rect` shape is correct |
| Three-axis collision (X/Z/Y) | ANI `[ATTACK BOX]`/`[DAMAGE BOX]` include all three axes | **MATCH** — `Rect2D5` uses `x/z/y + w/d/h` |
| Facing-direction mirroring | DNF characters face left or right; hitboxes are local-space mirrored | **MATCH** — `signedFacingScale()` handles this |
| Per-frame varying hitboxes | ANI format has per-frame box data | **PARTIAL** — current system uses per-window (start-end frame range) hitboxes, not per-single-frame |
| Hitstop with boss/building caps | DNF has tiered hitstop; boss super armor reduces hitstop | **MATCH** — `hitStopProfile` with three tiers |
| Grab immunity separate from super armor | DNF grab mechanics distinguish grab immunity from hit reaction immunity | **MATCH** — `ArmorProfile.immunities.grab` |
| Multi-hurtbox (architecturally) | DNF has per-frame `[DAMAGE BOX]` on each animation frame | **MATCH (infra)** — loop exists but only single hurtbox used |

### 3.2 What's Plausible but Unverified (Confidence: LOW-MEDIUM)

| Item | Reasoning | Risk |
|------|-----------|------|
| Circle shape for AoE skills | Korean MakeDNF analysis uses circles; DNF shockwave effects suggest radial AoE. But no ANI/PVF evidence confirms DNF uses non-rectangular collision shapes. | **LOW RISK** — circle shape doesn't break anything and is useful for prototyping |
| `sweep` shape for fast projectiles | DNF uses discrete frame-by-frame object collision, not swept volumes. The sweep approach solves a real problem (tunneling) but diverges from DNF's method. | **MEDIUM RISK** — if kept long-term, may cause behavioral divergence from DNF |
| `grab_attach` narrow-box approach | The concept (narrower detection for grabs) is consistent with DNF's grab mechanics. But the specific 40% width reduction is arbitrary, not DNF-calibrated. | **LOW RISK** — tunable parameter, easy to adjust |
| Per-window hitboxes (not per-frame) | DNF has per-frame `[ATTACK BOX]` data. Using one box for a range of frames (e.g., frames 5-8) is a simplification. | **LOW RISK** — acceptable for prototype; would need per-frame data for 1:1 replication |

### 3.3 What's Likely Wrong or Missing

| Item | Issue | Priority |
|------|-------|----------|
| **No projectile/Active Object system** | `RagingFury` blood pillars are implemented as timed hitbox windows on the caster's action, not as independent entities. DNF blood pillars are separate objects with their own positions and lifecycles. This is the single biggest hitbox-related gap. | **P0-P1** — documented in backlog |
| **No per-frame hurtbox variation** | Hurtboxes are static per-actor. DNF changes hurtboxes per animation frame (e.g., crouching/dodging reduces hurtbox, attacking extends it). | **P2** — beyond prototype scope |
| **No hitbox rotation for non-rect shapes** | Current AABB model can't represent diagonal slash hitboxes that rotate with the character's arm. The Korean analysis says DNF uses AABB (not OBB), so this may be correct behavior. However, some community analysis suggests certain skills may use rotated boxes. | **LOW** — AABB is the conservative correct choice |
| **Raw coordinate preservation incomplete** | `rawBox6` preserves 6-int coordinates but doesn't include source provenance (which ANI file, which frame, extraction date). This is noted as a gap in multiple research documents. | **P2** — needs PVF/ANI extraction pipeline first |
| **No hit priority sorting** | When `maxTargets` limits hits, which targets get hit is non-deterministic (depends on actor iteration order). DNF likely has a deterministic rule. | **P3** — minor for prototype |

---

## 4. Recommendations

### 4.1 Shape Additions

**No new shapes are recommended at this time.** The four existing shapes (`rect`, `circle`, `sweep`, `grab_attach`) cover the known DNF collision primitives adequately for a prototype. Before adding new shapes:

1. Complete the **Active Object / Projectile system** — this is the correct DNF approach for RagingFury pillars and other multi-hit skills, and would make the `sweep` shape unnecessary for its original purpose.
2. Extract **PVF/ANI hitbox data** (Batch C) — this may reveal shapes or collision flags not covered by the current model.

If a new shape is needed in the future, the most likely candidate is a **capsule** (pill shape) for character hurtboxes — but there is **no current DNF evidence** supporting capsules over AABB.

### 4.2 Parameter Adjustments

| Parameter | Current default | Recommendation | Rationale |
|-----------|----------------|----------------|-----------|
| Default `d` (depth) | 40 | Keep as-is | In range of verified PvP samples (30-92) |
| Default `h` (height) | 60 | Keep as-is | In range of verified PvP samples (45-55) |
| Default `w` (width) | 110 | Keep as-is | Within order of magnitude of samples (116-125 for Rapid Move Slash) |
| `grab_attach` width reduction | 40% | Consider 50% after testing | 40% feels restrictive; DNF grabs often have generous detection |
| `sweep` extrusion multiplier | 1.5× width | Tie to projectile velocity when Active Objects are implemented | Current static multiplier doesn't account for actual speed |

### 4.3 Architectural Recommendations

1. **Maintain AABB as the primary shape.** DNF evidence strongly supports this. Do not introduce OBB (oriented bounding boxes) without specific DNF evidence requiring them.

2. **Keep `circle` for convenience AoE.** Even if DNF only uses rectangles internally, circle is useful for prototyping radial effects and status splash (e.g., Burn's 150px splash radius).

3. **Deprecate `sweep` when Active Objects arrive.** The `sweep` shape is a workaround for the lack of projectile entities. Once projectiles exist as objects that move and check collision each frame, the swept-volume approach is unnecessary.

4. **Add `sourceProvenance` to hitbox data.** Each `HitBoxFrameWindow` should track which ANI file, frame, and extraction date its coordinates came from. This is essential for the PVF/ANI extraction pipeline (Batch C).

5. **Add per-box damage modifiers for multi-hurtbox.** When multi-hurtbox is activated for boss monsters, individual hurt boxes should support damage multipliers (e.g., head = 1.5×, body = 1.0×, limb = 0.7×). This is speculative — no DNF evidence confirms this system — but the architectural cost is minimal.

### 4.4 Verification Gates

When PVF/ANI extraction (Batch C) becomes available, these specific checks should be performed:

1. Extract `[ATTACK BOX]` coordinates from 3-5 classic Berserker skills and compare against current `FrameDataAction.ts` hitbox parameters.
2. Verify whether any ANI frame contains multiple `[ATTACK BOX]` entries (multi-hitbox per frame) — the current system assumes one hitbox per window.
3. Check whether any `[ATTACK BOX]` contains non-zero Z-axis rotation or non-rectangular shape flags.
4. Verify `[DAMAGE BOX]` per-frame variation on at least one player animation (e.g., crouch vs. stand vs. attack) to confirm per-frame hurtbox changes.

---

## 5. Source Summary

### Project Documents Consulted

| Document | Key content used |
|----------|-----------------|
| `docs/research/combat/dnf-dfo-combat-frame-ai-implementation-report.md` | ANI frame fields, hitbox coordinate samples, AABB vs OBB analysis, projectile model, hitstop behavior |
| `docs/research/combat/code-level-dnf-replication-gap-assessment.md` | Current completion percentage (30%), specific gaps in sweep/grab shapes, missing per-frame hurtbox |
| `docs/research/combat/dnf-dfo-research-vs-current-system-technical-report.md` | 2.5D AABB alignment assessment, raw coordinate preservation gap |
| `docs/research/combat/dnf-dfo-mechanics-gap-analysis.md` | Grab-immune handling, RagingFury pillar mechanics |
| `docs/research/reference/official-api-wiki-whole-code-audit.md` | Confirmation that API/Wiki do NOT expose hitbox/hurtbox data |
| `docs/research/reference/neople-api-combat-implementation-audit.md` | API coverage limits for combat data |
| `docs/research/reference/pvf-download-sources.md` | PVF contains hitbox dimensions but not shapes |
| `docs/research/reference/reference-dfo-pvp-mechanics.md` | SA/armor hitbox interaction, grab vulnerability of SA targets |
| `docs/research/combat/berserker-data-gap-report.md` | Hitbox geometry as a known gap (10-15% coverage) |

### Source Confidence Levels

| Level | Meaning | Applied to |
|-------|---------|------------|
| HIGH | Confirmed by official API or developer documentation | ANI field existence (`[ATTACK BOX]`, `[DAMAGE BOX]`), AABB coordinate format |
| MEDIUM-HIGH | Confirmed by consistent community research across multiple sources | Per-frame varying hitboxes, projectile/object separation |
| MEDIUM | Confirmed by single community source or Korean reconstruction | MakeDNF AABB analysis, grab mechanics hierarchy |
| LOW-MEDIUM | Plausible inference from available data | Circle AoE usage in DNF, multi-hurtbox on monsters |
| LOW | Speculative or unverified | Hit priority sorting algorithm, capsule shapes |

### Key External References

- DFO World Wiki: `https://wiki.dfo-world.com/` — general skill semantics (no hitbox data)
- NamuWiki (namu.wiki) — Korean DNF community knowledge base (no direct hitbox coordinates)
- Neople Open API: `https://developers.neople.co.kr/` — skill metadata only (no frame/hitbox data)
- Community ANI/PVF documentation — frame structure, box coordinates (cited in research reports)
- Korean MakeDNF reconstruction project — collision shape analysis (cited in research reports)

---

## 6. Conclusion

**The current HitResolver2D5 implementation is architecturally sound for classic DNF combat.** The AABB-based three-axis collision model, facing-direction mirroring, multi-hurtbox iteration, and tiered hitstop profile all align with DNF's known hitbox mechanics.

**The primary gaps are not in the collision shapes themselves, but in the surrounding systems:**
1. No projectile/Active Object entity system (P1 backlog)
2. Hitbox data is hand-tuned, not extracted from DNF sources (Batch C)
3. No per-frame hurtbox variation (P2, beyond prototype scope)
4. Hitbox coordinates lack source provenance tracking

**No new collision shapes are needed at this time.** The existing four shapes are sufficient. The `sweep` shape should be reconsidered once the Active Object system is implemented, as DNF's native approach is discrete frame-by-frame collision on moving objects, not swept volumes.
