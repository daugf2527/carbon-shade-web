# Documentation Index

> Last updated: 2026-05-05

This index categorizes all project documentation by status. Navigate by category to find relevant documents.

---

## DNF/DFO Reference Rule

Neople official API verification is the first golden standard for any DNF/DFO field it exposes. DFO-specific wiki references such as DFO World are the second golden standard for fields that official API/pages do not expose, after checking freshness and conflicts. Put official API evidence ahead of wiki summaries, community notes, local baseline tuning, and prior assumptions.

The boundary is documented in `design/source-policy.md`: API-backed skill metadata, cooldowns, costs, option values, hit-count fields, and official text can be treated as official facts; DFO-specific wiki pages can support skill semantics, public level tables, command notes, and general mechanic descriptions when official sources are silent; Wikipedia/general encyclopedias are background-only and must not be used for combat numbers, frame data, hitboxes, damage formulas, skill scaling, AI behavior, or live balance values. Unexposed client frame data and server/network internals remain calibrated baseline unless another official source backs them.

Never commit `NEOPLE_API_KEY`; use local environment variables or a backend proxy.

Current implementation audit: `research/reference/neople-api-combat-implementation-audit.md`.

---

## Current / Authoritative

Documents that accurately describe the present codebase and actively maintained specifications.

| Document | Description |
|---|---|
| `design/02-project-identity-v0.2.md` | Official naming: 碳影 / Carbon Shade, repo `carbon-shade-web`, core terminology |
| `design/02-concept-art-game-design-v0.1.md` | Concept art game design philosophy: meta-narrative paradox, three-cycle game design, emotional arc, plugin derivative strategy, project moats & gaps |
| `design/source-policy.md` | Compliance boundaries: original code only, no DNF/DFO assets |
| `design/tuning-baseline.md` | Living combat parameter values (currently in use) |
| `engineering/combat-lab-0.2-r3-final-integrated-development-spec.md` | Master engineering specification — the authoritative spec for the current codebase |
| `engineering/combat-attack-hit-reaction-chain.md` | Attack → hit → reaction chain (matches current implementation) |
| `engineering/art-asset-pipeline-spec.md` | Art asset pipeline specification for protagonist sprite generation |
| `changelog/fix6-normalized-sprite-pipeline.md` | Current rendering pipeline: normalized fixed-cell spritesheets |
| `planning/04-gap-and-roadmap-v0.1.md` | Living roadmap with updated completion percentages |
| `planning/dfo-combat-implementation-backlog.md` | P0/P1 complete, P2 partially complete |
| `planning/training-ground-r1-r2-plan.md` | Complete — core deliverables implemented |
| `planning/training-ground-r3-r4-restoration-plan.md` | B/C/D segments complete, A partial, E pending |

---

## Historical / Superseded

Documents that record past states or approaches that have been replaced by later work.

| Document | Status |
|---|---|
| `changelog/handfeel-pass-notes.md` | Historical — initial handfeel pass base |
| `changelog/handfeel-fix1-notes.md` | Historical — pushback, facing, weapon arc fixes |
| `changelog/handfeel-fix2-notes.md` | Historical — direct locomotion, DNF-like pushbox |
| `changelog/handfeel-fix3-notes.md` | Historical — sprite-reference rendering, hit reactions |
| `changelog/handfeel-fix4-asset-update-notes.md` | Partially superseded by fix6 — variable crop-box approach replaced |
| `changelog/handfeel-fix5-anchor-notes.md` | Superseded by fix6 — `setCrop()` + `setDisplayOrigin()` approach replaced |
| `design/00-project-mainline-v0.1.md` | Historical snapshot — naming is superseded by `01-project-identity.md`, but core narrative (dual-layer, 人群谱系, social/individual layer) remains the narrative foundation |
| `design/01-core-concept-document-v0.1.md` | v0.1 draft — core vision & gameplay loops still valid; sections 6-7 deprioritized (concept art game, not commercial); naming finalized (碳影/Carbon Shade) |

---

## Aspirational / Planning

Documents describing desired future states, planned work, or proposed architecture.

| Document | Description |
|---|---|
| `engineering/02-technical-design-document-v0.1.md` | Superseded — superseded by `combat-lab-0.2-r3-final-integrated-development-spec.md`; retained as architecture vision reference |
| `engineering/03-development-workflow-v0.1.md` | Historical context — written for ChatGPT era; workflow principles still valid; all ChatGPT references should be read as Claude Code |
| `planning/dnf-combat-systems-master-spec.md` | 79-system taxonomy across P0-P4 for full DNF replication |
| `planning/dfo-action-handfeel-replication-plan.md` | Living alignment document — tracks pending DFO handfeel items |
| `planning/runtime-observability-three-phase-plan.md` | Runtime observability: three-phase telemetry, profiling, and replay validation plan |
| `planning/dfo-handfeel-next-backlog.md` | DFO handfeel next backlog: prioritized post-R3 sensation items |
| `planning/pvf-skl-extraction-plan.md` | PVF/SKL extraction plan: DNF client data extraction tooling and workflow |

---

## Research / Reference

Investigative reports and reference material that inform the project but do not describe implemented code. Organized into four subdirectories under `research/` plus one root-level cross-cutting file.

### research/combat/ — DNF Combat Kernel Research (26 source files + 4 synthesis docs + audit/index)

DNF/DFO combat system reconstruction, replication, data models, extraction pipeline, frame AI, and mechanics gap analysis. Start with the four `SYNTHESIS-*.md` documents for current reading paths, then use `research/combat/INDEX.md` for source-document routing and `research/combat/CHAPTER-AUDIT.md` for chapter-level overlap governance.

| Document | Title |
|---|---|
| `research/combat/SYNTHESIS-OVERVIEW.md` | Combat research synthesis overview and reading route |
| `research/combat/SYNTHESIS-DATA-RUNTIME-PIPELINE.md` | Data/runtime pipeline synthesis: PVF/ANI/NPK, manifest, parser, tests, compliance |
| `research/combat/SYNTHESIS-COMBAT-KERNEL.md` | Combat kernel synthesis: Input -> Replay chain and P2 implementation priorities |
| `research/combat/SYNTHESIS-PERIPHERAL-SYSTEMS.md` | Peripheral systems synthesis: PvP, scoring, raid/party/buff, room/NPC/drop boundaries |
| `research/combat/INDEX.md` | Combat research reading order, document roles, and duplicate-risk tags |
| `research/combat/CHAPTER-AUDIT.md` | Chapter-level overlap audit and detail-preservation rules |
| `research/combat/dnf-combat-system-reconstruction-engineering-report.md` | [SUPPORTING] Reverse reconstruction engineering (unique data model tables migrated to extraction-runtime canonical via Appended: sections) |
| `research/combat/dnf-combat-replica-implementation-technical-report.md` | [SUPPORTING] Technical route for replication (unique Backstep/fixed-frame/replay content migrated to frame-AI + replication-impl canonicals) |
| `research/combat/dnf-dfo-mechanics-gap-analysis.md` | Mechanics gap analysis: current implementation vs reference |
| `research/combat/dnf-dfo-combat-data-model-and-damage-report.md` | Data model and damage systems |
| `research/combat/dnf-dfo-combat-extraction-runtime-pipeline-report.md` | Extraction and runtime pipeline |
| `research/combat/dnf-dfo-combat-frame-ai-implementation-report.md` | Frame AI implementation approach |
| `research/combat/dnf-dfo-research-vs-current-system-technical-report.md` | Research vs current system gap analysis |
| `research/combat/dnf-dfo-combat-replication-implementation-report.md` | Overall replication implementation |
| `research/combat/dnf-dfo-combat-kernel-development-report.md` | Kernel development approach |
| `research/combat/dnf-dfo-combat-technical-pipeline-report.md` | [OVERLAPPING] Technical pipeline report (unique job samples/event bus content migrated to frame-AI canonical) |
| `research/combat/dnf-dfo-combat-1v1-spec-report.md` | 1v1 combat specification |
| `research/combat/1v1-combat-system-spec-compact.md` | 1v1 combat system spec (compact) |
| `research/combat/code-level-dnf-replication-gap-assessment.md` | Code-level replication gap assessment |
| `research/combat/combat-cleanroom-v2.md` | Combat subsystem clean-room replication |
| `research/combat/combat-replication-implementation-v1.md` | Combat system replication implementation |
| `research/combat/combat-replication-implementation-v2.md` | Combat system replication (DFO variant) |
| `research/combat/combat-replication-scoring.md` | Replication: version boundaries, damage formulas, scoring |
| `research/combat/combat-replication-tech-report.md` | [SUPPORTING] Replication tech pipeline (unique 2.5D pseudocode/JSON-CSV samples migrated to frame-AI canonical) |
| `research/combat/combat-system-implementation-details.md` | [SUPPORTING] Implementation details (unique tick/priority/random/Miss-Crit-Guard-Pierce pseudocode migrated to kernel-dev canonical) |
| `research/combat/combat-system-freeze-replication.md` | Combat system freeze replication study |
| `research/combat/combat-technical-replication.md` | Combat technical replication (raid, party sync, buffs, sets, durability) |
| `research/combat/berserker-action-frame-calibration.md` | Berserker action frame calibration against DFO reference |
| `research/combat/dnf-dfo-combat-technical-data-replay-report.md` | Technical data replay: combat event recording and determinism |
| `research/combat/npk-img-extraction-workflow.md` | NPK/IMG extraction workflow from DNF client |
| `research/combat/pvf-skl-extraction-workflow.md` | PVF/SKL extraction workflow for skill data |
| `research/combat/berserker-data-gap-report.md` | Berserker data gap report: API vs wiki vs local baseline |

### research/art/ — Art Pipeline & Asset Research (7 files)

NPK/IMG/PVF art pipeline specifications, paper doll compositing, UI/atlas/font systems, and performance budgets.

| Document | Title |
|---|---|
| `research/art/deep-research-art-pipeline-dev-guide.md` | Art pipeline development guide |
| `research/art/deep-research-art-system-dnf-1to1.md` | DNF-style 2D action game art system 1:1 replication |
| `research/art/deep-research-npk-img-art-pipeline-spec.md` | NPK/IMG art pipeline specification |
| `research/art/deep-research-paper-doll-avatar-compositor.md` | Paper doll avatar compositor system |
| `research/art/deep-research-performance-budget-benchmarks.md` | Performance budget benchmarks for art assets |
| `research/art/deep-research-spk-npk-img-pvf-compatible-replication.md` | SPK/NPK/IMG/PVF compatible replication |
| `research/art/deep-research-ui-panel-atlas-font.md` | UI panel, atlas, and font system replication |

### research/systems/ — Game Systems Research (9 files)

Core subsystems (equipment/skill/fatigue), hell mode/economy/guild, account/login, character, and town/hub systems.

| Document | Title |
|---|---|
| `research/systems/core-subsystems-replication.md` | Three core subsystems: equipment growth, skill tree, fatigue/difficulty |
| `research/systems/hell-economy-guild-replication.md` | Classic Hell mode, auction house economy, and guild/party systems |
| `research/systems/account-login-subsystem.md` | Account and login subsystem (authentication, MFA, launcher) |
| `research/systems/assets-achievement-subsystem.md` | Assets and achievement subsystem (vault, binding, achievements) |
| `research/systems/character-subsystems-report.md` | Character-side subsystems (creation, deletion, rename, job, slots) |
| `research/systems/town-hub-systems.md` | Town/hub systems (lobby, AOI, NPC interaction, dungeon entrance) |
| `research/systems/town-subsystem-details.md` | Town subsystem details (scenes, channels, player sync, movement) |
| `research/systems/classic-hell-economy-guild-party-replication.md` | Classic DNF hell mode, economy, guild, and party system replication |
| `research/systems/current-live-core-subsystems-report.md` | Current live DNF/DFO core subsystems report |

### research/reference/ — API & Wiki Reference Docs (27 files)

Neople Open API reference and DFO World Wiki system documentation — raw reference material, not analysis.

| Document | Title |
|---|---|
| `research/reference/neople-dnf-open-api-auxiliary-material.md` | Neople DNF Open API integration design |
| `research/reference/neople-api-combat-implementation-audit.md` | Official API audit of all current DNF/DFO-aligned implementation |
| `research/reference/official-api-wiki-whole-code-audit.md` | Official API + DFO wiki whole-code combat audit |
| `research/reference/reference-api-auction-economy.md` | Auction & economy — Neople Open API |
| `research/reference/reference-api-character-model.md` | Character data model — Neople Open API |
| `research/reference/reference-api-items.md` | Item data model — Neople Open API |
| `research/reference/reference-api-jobs.md` | DNF job tree — Neople Open API |
| `research/reference/reference-api-skills.md` | Skill data — Neople Open API |
| `research/reference/reference-dfo-amplification.md` | Amplification (增幅) — DFO World Wiki |
| `research/reference/reference-dfo-auction.md` | Auction Hall (拍卖行) — DFO World Wiki |
| `research/reference/reference-dfo-fatigue-points.md` | Fatigue Points (疲劳值) — DFO World Wiki |
| `research/reference/reference-dfo-guild.md` | Guild (公会) — DFO World Wiki |
| `research/reference/reference-dfo-hell-mode.md` | Hell Mode (深渊模式) — DFO World Wiki |
| `research/reference/reference-dfo-party.md` | Party (组队) — DFO World Wiki |
| `research/reference/reference-dfo-pvp-mechanics.md` | PvP Mechanics — DFO World Wiki |
| `research/reference/reference-dfo-pvp.md` | PvP (决斗场) — DFO World Wiki |
| `research/reference/reference-dfo-reinforcement.md` | Reinforcement (强化) — DFO World Wiki |
| `research/reference/reference-dfo-skill-points.md` | Skill Points (SP) — DFO World Wiki |
| `research/reference/reference-dfo-avatar-costume.md` | Avatar & Costume — DFO World Wiki |
| `research/reference/reference-dfo-dungeon-design.md` | Dungeon Design — DFO World Wiki |
| `research/reference/reference-dfo-economy-adventure.md` | Economy & Adventure — DFO World Wiki |
| `research/reference/reference-dfo-pet-quest-enchant.md` | Pet, Quest, Enchant — DFO World Wiki |
| `research/reference/reference-dfo-status-effects.md` | Status Effects — DFO World Wiki |
| `research/reference/community/dfo-world-wiki-berserker-skills.md` | Berserker skills — DFO World Wiki community reference |
| `research/reference/pvf-download-sources.md` | PVF download sources and reference links |
| `research/reference/community/df0-berserker-patch-history.md` | DFO Berserker patch history — community reference |
| `research/reference/community/namu-wiki-berserker-skills.md` | Berserker skills — Namu Wiki reference |
| `research/reference/community/damage-formula-audit-from-dcalc.md` | Damage formula audit from dcalc — community analysis |

### Root-level

| Document | Title |
|---|---|
| `research/source-links-appendix.md` | Source links appendix — priority reference links |
| `documentation-audit-overlap-report.md` | Documentation deduplication audit (2026-05-01) |
