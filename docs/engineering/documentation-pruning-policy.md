# Documentation Pruning Policy

## Purpose

Carbon Shade has too many parallel markdown narratives.
This policy defines which docs stay authoritative, which docs become archive-only,
and how future docs must reference trunk docs instead of repeating them.

## Canonical Trunk Docs

The current trunk docs are:

- `docs/README.md`
- `docs/planning/2026-06-04-engine-native-rewrite-roadmap.md`
- `docs/engineering/combat-retirement-audit-2026-06-10.md`
- `docs/engineering/p5-static-blocker-matrix-2026-06-10.md`
- `docs/engineering/sot-map.md`

Any new overview doc should point to these before inventing a parallel summary.

## Archive Rules

Move a doc to archive or historical posture if one of these is true:

1. it describes an implementation path already replaced by a newer path
2. it repeats another doc's decisions with weaker freshness
3. it references runtime ownership that has already moved
4. it is useful as evidence but no longer useful as an entry point

Archived docs may stay on disk, but must be labeled clearly and must not be used as entry docs.

## Narrative Rules

1. One trunk doc per topic.
2. Other docs link upward instead of restating the same narrative.
3. Do not let `docs/README.md` keep historical skeletons as if they were current.
4. If a doc mixes current state and history, split it or mark one side explicitly.
5. Future docs must say whether they are trunk, supporting, or archive.
