# Batch A Execution Plan — Neople API Data Completeness Expansion

> Created: 2026-05-09
> Based on: `evidence-source-execution-plan.md` Batch A scope, `neople-api-combat-implementation-audit.md`, existing `berserkerSkillFacts.ts`
> Status: Ready to execute (needs `NEOPLE_API_KEY`)

---

## 一、Goal

Replace all `"scaled"` placeholder values in `src/data/official/berserkerSkillFacts.ts` with actual API-fetched level 1–10 data from the Neople Open API. Currently 11 skills have only level-1 API-verified facts; levels 2–10 use baseline scaling formulas that need to be replaced with real data.

## 二、API Reference

### Endpoint

```
GET https://api.neople.co.kr/df/skills/{jobId}/{skillId}?apikey={NEOPLE_API_KEY}
```

### Key Identifiers

| Field | Value |
|---|---|
| API Base | `https://api.neople.co.kr` |
| Job | Male Slayer (귀검사(남)) |
| `jobId` | `41f1cdc2ff58bb5fdc287be0db2a8df3` |
| Job Grow | Neo Berserker (眞 버서커) |
| `jobGrowId` | `6d459bc74ba73ee4fe5cdc4655400193` |
| API Docs | https://developers.neople.co.kr/contents/apiDocs/df |

### Skill Detail Response Format

The `/df/skills/{jobId}/{skillId}` response returns a single skill object with a `.levels[]` array. Each level entry contains:

| Field | Type | Description |
|---|---|---|
| `level` | number | Skill level (1–max) |
| `description` | string | Korean description |
| `consumeMp` | number | Initial MP cost |
| `coolTime` | number | Cooldown in seconds |
| `castingTime` | number | Cast time in seconds |
| `optionValue` | object | Key-value map of level-specific parameters (damage%, hit count, range%, buff values, etc.) |

The endpoint returns **all levels in one response** — no per-level requests needed. Each API call fetches one skill's complete level table.

### Rate Limiting

Neople API free-tier rate limit is approximately **100 requests per 10 minutes** per API key. With 15 actual API-mapped skills, this is well within limits but we include a **500ms delay between requests** to be safe.

---

## 三、Action-to-Skill Mapping

The project has **38 actions** in `default.json`. Not all map to DNF skills:

### Tier 1 — DNF Skills with Known Skill IDs (must fetch)

These 11 skills already have level-1 API facts and known `skillId` hashes:

| Local Action | Official Name | skillId | Category | Notes |
|---|---|---|---|---|
| `UpwardSlash` | 어퍼 슬래쉬 | `fc7a3f4c2852c832a2f20af63d5d212f` | Active (damage) | 8%/level scaling |
| `MountainousWheel` | 붕산격 | `6e33d47e6622ce03b6defdd912140270` | Active (damage) | 3-hit downward + shockwave |
| `RagingFury` | 레이징 퓨리 | `506e7ed77d517419a6e1c437a2cedb17` | Active (damage) | 10 blood pillars |
| `Bloodlust` | 블러드러스트 | `3829c15bf5f520c13998a3479ba0ce7b` | Active (grab) | Grab/eruption/bonus damage paths |
| `Derange` | 폭주 | `e8c1f4b2...` (**placeholder** — needs real ID) | Buff | Atk/spd/def/resist modifiers |
| `Diehard` | 다이하드 | `d9e2a5c3...` (**placeholder** — needs real ID) | Buff | Low-HP heal/defense buff |
| `Frenzy` | 프렌지 | `f7a3b1c4...` (**placeholder** — needs real ID) | Buff/Toggle | CD reduction, HP drain |
| `BloodyCross` | 혈십자 | `c3d1e5f7...` (**placeholder** — needs real ID) | Passive | HP-stage passive |
| `VimAndVigor` | 혈기왕성 | `b4a2d6e8...` (**placeholder** — needs real ID) | Passive | Bleed on post-class skills |
| `QuickRebound` | 퀵 스탠딩 | `ce26c6b6...` (**placeholder** — needs real ID) | Utility | Invul on wake-up |
| `Backstep` | 백스텝 | `7822d6d5...` (**placeholder** — needs real ID) | Utility | No CD, MP 1 |

**Critical**: 4 skills have real skillId hashes; 7 have `...` placeholders. The placeholder IDs must be resolved before fetching. Use the skill list endpoint to map names → skillIds:

```
GET https://api.neople.co.kr/df/skills/{jobId}?jobGrowId={jobGrowId}&apikey={API_KEY}
```

This returns all skills for Neo Berserker with their `skillId` values.

### Tier 2 — DNF Skills Added in Combat Lab 0.3 (new, need skillId lookup)

These 10 skills were added to `default.json` in the 0.3 phase and also map to DNF skills:

| Local Action | Suspected Official Name | Category | Notes |
|---|---|---|---|
| `GoreCross` | 고어 크로스 (Gore Cross) | Active (damage) | 3-hit slash combo |
| `OutrageBreak` | 아웃레이지 브레이크 (Outrage Break) | Active (damage) | Slam attack |
| `ExtremeOverkill` | 익스트림 오버킬 (Extreme Overkill) | Active (damage) | Leap + shockwave |
| `RagingFury2` | 레이징 퓨리 강화 (Raging Fury Upgrade) | Active (damage) | More pillars, more damage |
| `BloodRuin` | 블러드 루인 (Blood Ruin) | Active (AoE) | Persistent blood field |
| `BloodSword` | 블러드 소드 (Blood Sword) | Active (damage) | Heavy slash |
| `BurstFury` | 버스트 퓨리 (Burst Fury) | Active (damage) | Stab + detonate |
| `EarthShatter` | 어스 섀터 (Earth Shatter) | Active (damage) | Smash + ground wave |
| `Thirst` | 갈증 (Thirst) | Buff | HP% cost, atk buff |
| `BloodMemory` | 블러드 메모리 (Blood Memory) | Buff | MP cost, status buff |

### Tier 3 — Not DNF Skills (skip API fetch)

These 12 actions are movement, debug, or lab-only and should NOT be fetched from the API:

| Local Action | Reason to Skip |
|---|---|
| `Idle`, `Walk`, `Run` | Movement — not API skills |
| `NormalBasic1/2/3`, `DashAttack` | Basic attacks — no specific skill API |
| `Jump`, `JumpAttack` | Movement/air attack — no specific API |
| `FrenzyBasic1/2/3` | Frenzy-modified basics — no separate skill API |
| `FrenzyToggle` | Same skill as Frenzy — already counted |
| `DebugReset`, `ForceDownPlayer`, `ForceBleed`, `SpawnTargets`, `RunScreenshotScenario` | Lab debug only |
| `EnemyBasic` | Enemy AI — not a player skill |

---

## 四、Script: `scripts/batch-a-fetch.mjs`

### What It Does

1. Reads `NEOPLE_API_KEY` from environment
2. Fetches the skill list for Neo Berserker to resolve name→skillId mappings
3. Fetches level 1–10 data for all 21 API-mapped skills
4. Saves raw API responses to `src/data/api/raw/`
5. Writes normalized structured data to `src/data/api/skills.json`

### How to Run

```bash
# Set your API key (never commit this)
export NEOPLE_API_KEY="your-api-key-here"

# Run the script
node scripts/batch-a-fetch.mjs
```

### Output Files

| Path | Description |
|---|---|
| `src/data/api/raw/{skillName}.json` | Raw API response for each skill |
| `src/data/api/skills.json` | Normalized structured data, ready to replace scaled values in `berserkerSkillFacts.ts` |

### Error Handling

- Rate limit hits → waits 10s and retries (max 3 retries)
- Missing skills → logs warning, continues with remaining
- API key missing → exits with clear error message
- Network errors → retries up to 3 times with exponential backoff

---

## 五、After Fetch: Manual Follow-up Steps

1. **Copy data into `berserkerSkillFacts.ts`**: Replace the `"scaled"` comments and computed values with actual API data from `skills.json`
2. **Update `extract-actions.mjs`**: Update the `fieldProvenance` block to mark all 21 skills' `costProfile` and `cooldownProfile` as `official_api` source
3. **Regenerate `default.json`**: Run `node scripts/extract-actions.mjs` to bake updated provenance into the manifest
4. **Update alignment test**: Expand `tests/static/official-api-alignment.test.ts` to cover all 21 skills
5. **Run verification**: `npm run static:test` and `npm run typecheck` to confirm no regressions

---

## 六、Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Placeholder skillIds (7 of 11) are wrong | Medium | Script resolves IDs from skill list endpoint first |
| Some 0.3 skills don't exist in 70-85 cap | Medium | Script skips 404s gracefully; these are documented |
| API returns Korean-only optionValue keys | Low | Script preserves raw keys; human maps to English names |
| Rate limit exceeded | Low | 500ms delay + retry logic; ~21 requests total |
| API key not available | High | Script is ready; user provides key when ready |

---

**Next: Run `node scripts/batch-a-fetch.mjs` when NEOPLE_API_KEY is available.**
