# DNF/DFO Mechanics Gap Analysis

Date: 2026-04-28

## Sources Checked

- English: DFO World `Quick Rebound`, `Raging Fury`, `Frenzy`, and `Berserker` pages.
- English official: Neople DFO Berserker balance notes.
- Chinese: Chinese DNF wiki/community search results for Berserker and `受身蹲伏`.
- Korean: Korean search results for Berserker/`프렌지`/`레이징 퓨리` plus GameMeca class guide snippets.

Primary links:

- https://wiki.dfo.world/view/Quick_Rebound
- https://wiki.dfo-world.com/view/Raging_Fury
- https://wiki.dfo-world.com/view/Frenzy
- https://wiki.dfo-world.com/view/Berserker
- https://www.dfoneople.com/news/updates/1393/Character-Balance/Berserker
- https://df.nexon.com/df/news/update?mode=view&no=1624704
- https://dnf.fandom.com/zh/wiki/%E7%8B%82%E6%88%98%E5%A3%AB
- https://www.gamemeca.com/view.php?gid=840287

## Current Match

- QuickRebound entry condition is close: downed state plus C/Jump pressed edge, maintained by held key.
- RagingFury is correctly not a single radial hit: it has a shockwave plus 10 blood-pillar hit groups.
- Frenzy has activation HP cost, real upkeep HP drain that pauses during HitStop, swaps basic attack routing to Frenzy basics, reduces supported Berserker cooldowns by 20%, adds a replay-visible skill attack multiplier for supported Berserker actions, shortens incoming stagger recovery, and restores HP after killing a bleeding target.
- The baseline movement/action layer now includes DashAttack, Jump, and JumpAttack routes.
- Bloodlust has a baseline grab hitbox plus grab-immune damage fallback with replay-visible grab success/failure events.
- Bleed DOT is separated from normal hit reaction through `sourceKind=status_dot` and `reactionPolicy=status_tick_feedback_only`.

## Important Gaps

1. RagingFury now targets the current DFO reference baseline: DFO World skill growth shows blood pillar damage as `x10`, and Neople/Nexon balance notes reference the `8 -> 10` hit-count change. Keep the old 8-hit behavior only as a future legacy tuning profile if needed.

2. Frenzy is still simplified. Real DFO Frenzy includes level-scaled HP activation/upkeep cost, hit rate, hit recovery, Berserker skill attack increase, selected cooldown reduction, dual-wield basic/dash/jump conversion, and HP restoration from killing bleeding enemies. Current code covers activation/upkeep HP cost, basic routing, DashAttack/JumpAttack entry, cooldown reduction hooks, a fixed skill attack multiplier, incoming stagger recovery shortening, and bleeding-kill HP restoration.

3. QuickRebound duration is not level-aware. DFO World lists invulnerability duration growth and short super armor after crouch release. Current implementation uses a fixed max hold and 18F getting-up armor without skill level or PvP/PvE profile distinction.

4. Vim and Vigor/Bleed relationship now has a source gate for RagingFury. Remaining work is making Vim and Vigor a learned/passive profile instead of a manually applied buff in tests.

5. Derange, Diehard, BloodyCross, and later Berserker passives are placeholders compared with DFO behavior. Diehard should be low-HP gated healing/defense/recovery logic, not just an action shell.

6. Grab-immune handling has a Bloodlust-style fallback discharge baseline. Remaining work is the full held-target animation/state, not the damage fallback.

## Suggested Supplement Order

1. Add a versioned tuning profile: `legacy_0_2_spec` vs `current_dfo_reference`, especially for old/new skill hit counts and PvP/PvE differences.
2. Expand Frenzy into data profiles: hit rate, level-scaled values, PvE/PvP split, and versioned tuning.
3. Make QuickRebound data-driven: duration table, release armor duration, PvE/PvP profile, and replay-visible release reason.
4. Promote VimAndVigor from manual buff/test gate into a learned passive/profile switch.
5. Implement Diehard and Bloodlust held-target animation before adding more high-level skills.
