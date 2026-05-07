# Combat Research Tickets

> Purpose: turn the research corpus into implementation-shaped evidence tickets. Source documents remain the archive; this file tracks what evidence is still needed before runtime data can be treated as DNF-facing truth.

## Ticket Schema

Each ticket uses these fixed fields:

| Field | Meaning |
|-------|---------|
| ID | Stable ticket identifier. |
| 问题 | Single implementation-shaped research question. |
| 证据层级 | Expected evidence class, following project source policy. |
| 所需证据 | Exact artifacts needed before code or manifest changes can claim DNF parity. |
| 影响 runtime surface | Runtime code/data/test area affected by the answer. |
| 输出物 | Concrete document, manifest, fixture, or test output to produce. |
| 状态 | Current ticket state. |

## Open Tickets

| ID | 问题 | 证据层级 | 所需证据 | 影响 runtime surface | 输出物 | 状态 |
|----|------|----------|----------|----------------------|--------|------|
| CRT-001 | Which exact DNF classic PvE version is the replication target? | User-selected target + official/client-version evidence | User-approved version identifier, region, date/build range, and why later balance patches are excluded. | All DNF-facing manifests, replay metadata labels, public DoD language. | Planning Target Version Freeze update; versioned manifest namespace plan. | pending_user_selection |
| CRT-002 | What are Berserker frame, hitbox, hurtbox, hitstop, recoil, and cancel timings for the frozen version? | Client asset extraction or frame-accurate captured evidence; official API only for exposed skill facts | Per-action frame timeline, hit windows, hitbox/hurtbox geometry, root motion, cancel windows, and confidence/source metadata. | `src/data/manifest/actions/default.json`, `FrameDataAction` adapter, hit resolver tests, replay frame metadata. | Versioned action manifest patch plus provenance and DFO replica regressions. | open |
| CRT-003 | What damage and status formulas are valid for classic PvE in the frozen version? | Official formula references where available; client/resource extraction or high-confidence community reverse engineering for hidden formulas | Percent/fixed damage paths, defense reduction, elemental strength/resistance factor, critical/counter buckets, status DOT timing/damage/resistance rules, and conflict notes. | Damage formula profiles, status manifest profiles, `DamageFormula`, `StatusEffectSystem`, replay metadata. | `damage/classic-profile.json`, expanded `status/default.json`, formula fixture tests. | open |
| CRT-004 | What armor, grab, downed, invulnerability, super armor, reaction, and holding rules apply to PvE targets? | Client behavior evidence + official/community rule references | State flag priority, grab immune fallback behavior, downed-hit exceptions, launch/knockdown rules, holding tolerance, reaction decay, and PvE/PvP exclusions. | `HitRejectionResolver`, `GrabResolver`, `ReactionResolver`, hit decision events, replay/golden tests. | Runtime rule matrix doc, fixture scenarios, targeted static tests. | open |
| CRT-005 | What enemy AI parameter and pattern data should drive default mobs and bosses? | Client/resource extraction or source-backed behavior tables | Detect range, attack range, aggro/target switching, cooldowns, movement speed, phase triggers, pattern weights, boss transition rules, and provenance per field. | `src/data/manifest/ai/enemy-default.json`, enemy AI runtime, boss pattern loader, replay evidence. | AI manifest profile update, boss pattern fixture, AI regression tests. | open |
| CRT-006 | What deterministic replay and hash metadata proves a runtime run used the frozen data set? | Project infrastructure policy + manifest content hashes + runtime smoke evidence | Required manifest hashes, dataSources labels, source-policy version, build hash, frame state hash, action/status/AI profile IDs, and excluded runtime surfaces. | `ReplayRecorder`, runtime evidence collector, browser/static verification gates. | Replay metadata DoD checklist and tests covering action/status/AI manifest source labels. | open |
