# Stage 2 brainstorm topics — DNF-native engine layer (NOT implementation)

> **Status**: ideation only. **No code in this stage 2 yet.** Per
> [[combat-lab-dnf-alignment-pivot-2026-05-21]] memory and the user's
> goal directive, Stage 2 implementation waits for explicit sign-off on
> Stage 1 completion ([[2026-05-24-stage1-complete]]).
>
> Source of truth for shape: [`2026-05-22-dnf-native-v2-design.md`](2026-05-22-dnf-native-v2-design.md) §3 (13-system architecture).

## 1. Consumer surface (what Stage 2 reads)

Stage 2 systems consume the runtime JSON shards produced by Stage 1's
EXPORT stage:

```
dist/data/players/<job>.json    → PlayerRuntimeShape  (chr + skills + animations + attacks + etc)
dist/data/monsters/<id>.json    → MonsterRuntimeShape (mob + attacks + animations)
dist/data/dungeons/<id>.json    → DungeonRuntimeShape (dgn + maps + monsterRefs)
dist/data/shared/physics.json   → SharedPhysicsShape   (constants from dnf_enum_header.nut)
dist/data/shared/enums.json     → SharedEnumsShape     (ATTACKTYPE/ELEMENT/... + FIELD_TO_ENUM)
dist/data/manifest.json         → RuntimeManifest      (path + sha256 + sizeBytes per shard)
```

Stage 2 systems **read directly from these shards** — no view layer per
design §4.3. If a system finds itself building a derived view, that's a
signal to sink a helper function next to the system, not introduce a
view interface.

## 2. 13 systems (per v2 design §3)

Topics to think about for each (NOT a TODO list — these are brainstorm
prompts to surface unknowns):

### 2.1 PhysicsIntegrator
- Consumes: `shared/physics.json.constants` (DEFAULT_GRAVITY_ACCEL=-1500,
  SPEED_VALUE_DEFAULT=1000, ...) + `chr.jumpPower` / `chr.weight` per actor.
- **Unknowns**: jump_power unit ambiguity (Tier-3 marked
  `requiresManualVerification: true`); launch curves hardcoded in DNF.exe
  C++ binary (Tier-3); gravity per-frame scalar vs constant (uncertain).
- **Risk**: physical authenticity vs gameplay tunability. Stage 1's
  `local_baseline` marks are deliberately bug-loud — Stage 2 has to either
  validate against video reference or accept the local_baseline tier with
  visible "tunable" knobs.

### 2.2 MotionExecutor
- Consumes: `player.animations[<motion>].frames[]` for player; mob's
  `animations` for monsters.
- Stage 1 gap: AniDef not yet inlined (standalone parser). Stage 2 entry
  pulls the AniDef set alongside parsed[] from a separate load path.
- **Unknowns**: motion blending (does DNF blend frames or hard-cut?);
  motion priority / interrupt rules (per-section `motion priority` field
  in .chr but semantics unverified).

### 2.3 HitDetection
- Consumes: `ani.frames[frame].atk[]` (attack boxes) and `ani.frames[frame].dmg[]`
  (hurt boxes). 6-int `[x1,y1,z1,x2,y2,z2]` per CLAUDE.md verified note.
- Already implemented in `HitResolver2D5.ts` (combat kernel) for the
  in-tree Combat Lab. Stage 2 question: does the in-tree resolver match
  DNF.exe geometry, or do we need to port more of the C++ logic?
- **Unknowns**: 2.5D z-axis treatment (DNF treats z as depth slice;
  current Combat Lab uses it as projection layer). Verify against
  PvfAnimation.cpp box conventions.

### 2.4 DamageFormula
- Consumes: `chr.growth.physicalAttack[level]` + `chr.growth.magicalAttack` +
  AtkDef fields (attackEnemy / attackKind / element / hitReaction).
- Already in-tree (`DamageFormula.ts` with classic-profile.json). Stage 2:
  consume from runtime JSON instead of hand-tuned manifest.
- **Unknowns**: PvP-specific multipliers (still in raw, not typed
  out); skill chain / pre-required skill bonuses.

### 2.5 StatusEffectSystem
- Consumes: `atk.causesDown / causesStun / causesBounce / causesStuck`
  for status-cause; per-actor `weight` for resistance.
- Already in-tree. Stage 2: feed from AtkDef directly.
- **Unknowns**: status tolerance accumulation curve (project-baseline
  per status/default.json).

### 2.6 MonsterAI
- Consumes: `mob.warlike / sight / weight / hpMax / attackInfo /
  animationRefs / category` plus boss-level pattern config.
- Already in-tree (`EnemyAI.ts` + `ai/enemy-default.json`). Stage 2:
  marshal from MobDef.
- **Unknowns**: real DNF AI is hardcoded in DNF.exe + .aic files (.aic
  parser doesn't exist yet — Stage 2 adds it?). For now Combat Lab uses
  FSM 9-state which matches DNF behavior but isn't 1:1 to .aic semantics.

### 2.7 EquipmentLayerSystem
- Consumes: layered sprite paths from .ani files (`equipment/character/
  <job>/avatar/...`). Per CLAUDE.md "DNF costume / equipment layer
  rendering" verified note — paths are `equipment/character/<job>/avatar/
  {coat,hair,pants,shoes}/{layer}_<style>/<action>.ani`.
- Z-order: body → shoes_a → pants_a → coat_a → hair_a.
- **Unknowns**: weapon layer (separate, not under avatar/); style ID
  encoding in `%02d%02d`; transparency handling for partially-rendered
  layered sprites.

### 2.8 InputManager
- No PVF dependency — pure input mapping. Already in-tree.

### 2.9 ReplayRecorder
- No PVF dependency. Already in-tree (`ReplayRecorder.ts`).

### 2.10 FrameDataAction (controller)
- Currently in-tree, manifest-driven (`actions/default.json`). Stage 2
  question: keep manifest-driven action layer, or generate FrameDataAction
  from PVF .atk + .skl? The latter is more PVF-faithful but loses the
  hand-tuned `actions/default.json` priority/cancel decisions.

### 2.11 BossPatternSystem
- Consumes: `boss-patterns.json` (in-tree manifest) + future `.aic`
  parsing if implemented.

### 2.12 SoundSystem
- Consumes: `chr.weaponWav[]` (4 shapes verified) + map.sounds[].
- **Unknowns**: actual .wav asset paths — PVF references `weapon wav`
  via `.wav` filename only; runtime needs to resolve via NPK or sound
  directory.

### 2.13 SceneManager
- Consumes: `dungeon` shard → `maps[]` for room layout, `monsterRefs[]`
  for spawn enumeration. Maps' `monster` section is packed positional
  — needs unpacker.

## 3. Cross-cutting unknowns / unresolved invariants

These don't fit in any one system but need to be resolved before Stage 2
ships its first integration:

### 3.1 Animation loading topology
Stage 1 leaves AniDef standalone. Stage 2 needs a unified loader that
pulls AniDef[] alongside parsed[], so PlayerRuntimeShape.animations and
MonsterRuntimeShape.animations are actually populated. Options:

- **A**: Stage 2 reads `dist/data/{players,monsters}/*.json` then
  separately resolves `chr.motionRefs[]` against on-disk `.ani` files
  (loaded via AniParser).
- **B**: Backport AniDef inlining into Stage 1 EXPORT — emit
  `players/<job>.json` with animations[] already populated. Adds
  significant size (some chr have 100+ motion refs).
- **C**: A separate `animations/<job>/{motion}.json` shard tree with
  per-motion files; runtime composes lazily. Smaller initial load,
  more file I/O.

Decision criterion: load-time budget vs file-count budget. Brainstorm
later when we know Stage 2 entry-point latency target.

### 3.2 .aic / .ai files (monster AI tables)
Not parsed in Stage 1. Real DNF monster AI lives in `.aic` files (per
v2 design §2). Stage 2 either:
- Builds `AicParser` (probably standalone like AniParser, since shape
  differs from PvfDocument), OR
- Keeps the current FSM-driven `EnemyAI.ts` and treats `.aic` as
  out-of-scope (per CLAUDE.md the 9-state FSM "matches DNF behavior").

### 3.3 .map "monster" / "passive object" / "special passive object" unpackers
MapDef preserves these as raw `PvfAttribute[]`. Stage 2 SceneManager
needs unpackers that decode the positional layout into typed
`MonsterSpawn[]` / `PassiveObject[]`. Pattern observed in real .map:

```
"monster": [int, int, int, x, y, z, int, int, "[fixed]", "[normal]", ...]
                                              ^^^^^^^^^   ^^^^^^^^^
                                              spawn type  AI variant
```

Pattern needs to be reverse-engineered from a wider sample (4.map only
exposed one shape — boss / event maps likely vary).

### 3.4 PvP system gating
Stage 1 emits PvE-only shards (`AtkDef.pvpOnly=true` omitted;
`MapDef.pvpStartArea` cleared). But the SQLite Mirror still has the
PvP raw data (per design §6). Stage 2 question: does the runtime ever
need PvP fields, or do we fully delete the SQLite raw on production
build? Per [[feedback-dnf-pve-scope-only]] runtime ignores — but the
audit trail might still want the raw.

### 3.5 Reverse lookup tooling
Per design §4.4, "which actor references .ani X?" queries go to SQLite
(`refs` table) NOT runtime JSON. Stage 2 should expose a small dev-only
helper (`scripts/find-ref-consumers.mjs` or similar) so the developer
question loop doesn't need raw SQL.

### 3.6 Visual fidelity benchmark
Stage 2's correctness benchmark is "does it look like DNF?" We need a
side-by-side comparison harness — recorded DNF gameplay vs Combat Lab
replay — so engineers can spot drift. Topic: video-reference fixture set,
per-frame compare tooling, regression flags.

## 4. Tooling carry-over

These Stage 1 tools also serve Stage 2:

- `scripts/pipeline.mjs` `--incremental` mode — re-runs are fast when
  PVF doesn't change (modulo the timestamp-noise debt noted in
  [[2026-05-24-stage1-complete]]).
- `scripts/completion.mjs` — extend with Stage 2 system gates.
- `scripts/stage1-baseline.mjs` → fork for Stage 2 system baselines
  per [[2026-05-24-stage1-complete]] §"What Stage 2 looks like".
- `.claude/skills/closed-loop/` — same 9-step workflow applies; will
  re-target audit topics from "stage1 deliverables" to "stage 2 system
  invariants".

## 5. What NOT to do

Per [[feedback-dnf-pve-scope-only]] and roadmap §5.1 铁律:

- ❌ Don't simplify the 13-system architecture down to fewer systems
  for "engineering economy". The PVE 1:1 fidelity goal requires all 13.
- ❌ Don't start Stage 2 implementation before Stage 1 final 收口 is
  signed off by the user.
- ❌ Don't pre-optimize. Stage 2 first pass should be naïve direct
  consumption of runtime JSON shards. Tighten when profiling shows it.
- ❌ Don't introduce a view-layer abstraction unless 3 systems
  independently demand the same derived shape.

## 6. Open questions to ask before Stage 2 kickoff

1. Which job ships first as Stage 2's reference player — swordman
   (Combat Lab default), berserker (closest to current in-tree
   actions/default.json), or something else?
2. Is `dist/data/manifest.json` the canonical version index, or do we
   add a `schema-version.json` separately for runtime negotiation?
3. Do we wire `.aic` parsing into Stage 2 entry, or punt to Stage 3?
4. PvP fields: full erase at EXPORT (current) or audit-log-only?
5. Replay format: keep current `ReplayRecorder.ts` JSONL, or upgrade
   to manifest-aware (records which manifest/runId it was recorded
   against)?
