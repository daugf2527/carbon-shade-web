# Documentation Index

> Last updated: 2026-04-29

This index categorizes all project documentation by status. Navigate by category to find relevant documents.

---

## Current / Authoritative

Documents that accurately describe the present codebase and actively maintained specifications.

| Document | Description |
|---|---|
| `design/01-project-identity.md` | Official naming: 碳影 / Carbon Shade, repo `carbon-shade-web`, core terminology |
| `design/source-policy.md` | Compliance boundaries: original code only, no DNF/DFO assets |
| `design/tuning-baseline.md` | Living combat parameter values (currently in use) |
| `engineering/combat-lab-0.2-r3-final-integrated-development-spec.md` | Master engineering specification — the authoritative spec for the current codebase |
| `engineering/combat-attack-hit-reaction-chain.md` | Attack → hit → reaction chain (matches current implementation) |
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
| `changelog/asset-update-fix4-notes.md` | Partially superseded by fix6 — variable crop-box approach replaced |
| `changelog/handfeel-fix5-anchor-notes.md` | Superseded by fix6 — `setCrop()` + `setDisplayOrigin()` approach replaced |
| `design/00-project-mainline-v0.1.md` | Historical — tentative naming, superseded by `01-project-identity.md` |
| `design/01-core-concept-document-v0.1.md` | v0.1 draft — sections 6 and 7 incomplete, tentative naming |

---

## Aspirational / Planning

Documents describing desired future states, planned work, or proposed architecture.

| Document | Description |
|---|---|
| `engineering/02-technical-design-document-v0.1.md` | Aspirational — describes future 4-layer architecture, most modules at 0-25% |
| `engineering/03-development-workflow-v0.1.md` | Historical context — written for ChatGPT era, now using Claude Code |
| `planning/dnf-combat-systems-master-spec.md` | 79-system taxonomy across P0-P4 for full DNF replication |
| `planning/dfo-action-handfeel-replication-plan.md` | Living alignment document — tracks pending DFO handfeel items |

---

## Research / Reference

Investigative reports that inform the project but do not describe implemented code.

| Document | Title |
|---|---|
| `research/02-neople-dnf-open-api-auxiliary-material.md` | Neople DNF Open API integration design |
| `research/code-level-dnf-replication-gap-assessment.md` | What can be extracted from public sources |
| `research/dnf-combat-system-reconstruction-engineering-report.md` | Reverse reconstruction engineering |
| `research/dnf-combat-replica-implementation-technical-report.md` | Technical route for replication |
| `research/dnf-dfo-mechanics-gap-analysis.md` | Mechanics gap analysis |
| `research/dnf-dfo-combat-data-model-and-damage-report.md` | Data model and damage systems |
| `research/dnf-dfo-combat-extraction-runtime-pipeline-report.md` | Extraction and runtime pipeline |
| `research/dnf-dfo-combat-frame-ai-implementation-report.md` | Frame AI implementation approach |
| `research/dnf-dfo-research-vs-current-system-technical-report.md` | Research vs current system gap analysis |
| `research/dnf-dfo-combat-replication-implementation-report.md` | Overall replication implementation |
| `research/dnf-dfo-combat-kernel-development-report.md` | Kernel development approach |
| `research/dnf-dfo-client-data-extraction-report.md` | Client data extraction methodology |
| `research/dnf-dfo-combat-technical-pipeline-report.md` | Technical pipeline |