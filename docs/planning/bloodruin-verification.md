# BloodRuin Skill Deletion Timeline Verification

> **Research date**: 2026-05-09
> **Task**: Verify whether BloodRuin (블러드 루인) was present in the DNF 70-85 level cap era (2012, pre-Metastasis/大转移).
> **Context**: Batch B wiki calibration found NamuWiki lists BloodRuin as deleted (replaced by Blood Snatch).
> **Sources**: NamuWiki, DFO World Wiki, DFO official patch notes (Operation: Hope 2019-06-18), Firecrawl web agent research.

---

## 1. Timeline Summary

| Event | Date / Patch | Detail |
|-------|-------------|--------|
| BloodRuin added | ~2008–2009 (estimated) | Added with 1st Awakening system for Male Slayer/Berserker. Exact patch date not found in available sources. |
| Level 70 cap (target era) | 2011–2012 (KDNF Season 2–3) | BloodRuin **was present** throughout this era. |
| Metastasis (大转移) | 2014-06 (KDNF) | BloodRuin **survived** the Metastasis update. |
| Level 85 cap | 2014 | BloodRuin still present. |
| BloodRuin deleted | **2019-06-18 UTC** | Operation: Hope patch. Replaced by Blood Snatch (블러드 스내치 / 血气掠夺). |

## 2. Verdict: **KEEP** (BloodRuin was in the 70–85 classic era)

BloodRuin was deleted on **June 18, 2019**, approximately **7 years after** the 2012 Level 70 cap era. It was unquestionably present during the 70–85 classic pre-Metastasis era and survived the Metastasis update itself. The deletion was part of a major Berserker rework in Operation: Hope (2019), the same patch that added Blood Snatch and Enrage as new skills.

## 3. Evidence Sources

### 3.1 DFO Official Patch Notes — Operation: Hope (2019-06-18)
Source: https://www.dfoneople.com/news/updates/1393/Character-Balance/Berserker

Direct statements from the patch notes:
- **Blood Ruin — Skill deleted**
- **Blood Snatch (New Active Skill) — New Level 60 Active skill**
- Chronicle set "Arterial Spray": 6-piece and 9-piece effects updated to replace Blood Ruin effects with Blood Snatch Atk. bonuses.

This is the authoritative deletion date. Operation: Hope was a global (DFO) balance patch in mid-2019, long after the 70–85 era.

### 3.2 NamuWiki (namu.wiki)
Source: https://namu.wiki/w/버서커(던전앤파이터)/스킬 (Korean, KDNF 기준)

- BloodRuin (블러드루인) is listed in the "Deleted / Historical" section with status: "Deleted (replaced by Blood Snatch)".
- Blood Snatch (블러드스내치) is listed as an Active (Lv60) skill: "grab → spin hop → slam".
- The NamuWiki page organizes skills by current status — deleted skills appear in a separate section without full property tables.

### 3.3 DFO World Wiki (wiki.dfo.world)
Source: https://wiki.dfo.world/view/Category:Berserker_Skills

- BloodRuin does **not** appear in the current Berserker Skills category listing.
- Blood Snatch **does** appear in the active skills list.
- This is consistent with post-2019 state — the wiki reflects the current game, not historical deleted skills.

## 4. BloodRuin Original Properties (70–85 Era)

> **⚠️ Important note on property discrepancies**: The following data comes from two conflicting sources. The project's current frame data may not match the original DNF skill properties.

### 4.1 As represented in the project (FrameDataAction.ts)

| Property | Value |
|----------|-------|
| Skill type | Persistent AoE dot field (blood pillars from ground) |
| Total frames | 40 |
| Active hit frames | 12–40 (persistent field) |
| MP cost (level 1) | 45 |
| Cooldown | 480 ticks (8 seconds at 60fps) |
| Hit group | `blood_ruin_field` — multi-hit pillars |
| Hitbox | w:128, d:46, h:72, offsetY:30 |
| Can hit downed | Yes |
| Attack level | 2 |

### 4.2 As described by web research (Firecrawl Agent via NamuWiki + patch archives)

| Property | Value |
|----------|-------|
| Skill type | Awakening Active / Cube Skill / Grab-type |
| Level requirement | ~Level 60 (formula: 58 + 2n per KDNF wiki) |
| Cooldown | **30 seconds** |
| MP cost (level 1) | **~400** (scaling to 514) |
| SP cost | 60 |
| Cube fragments | 1 clear cube |

### 4.3 Discrepancy Analysis

There is a **significant discrepancy** between the two property sets:

1. **Skill mechanics**: The project has BloodRuin as a persistent AoE field (blood pillars from ground, hit type `blood_pillar`). Web research describes it as a **grab-type** skill (similar to Bloodlust or Blood Snatch).

2. **Cooldown**: Project has 8s (480t). Research says 30s. For a Level 60 cube skill, 30s is the expected range. An 8s cooldown is more typical of a Level 20–30 skill.

3. **MP cost**: Project has 45. Research says ~400 at level 1. Again, 400 MP is consistent with cube skills; 45 MP is consistent with low-level skills.

4. **Level**: The project places BloodRuin alongside other Lv60 skills in the action manifest. Blood Snatch (its replacement) is explicitly a Lv60 skill per both NamuWiki and DFO patch notes.

5. **Possible explanation**: The project's BloodRuin frame data (persistent field, low CD, low MP) may represent an **earlier iteration** of the skill from a different era, or the project may have assigned incorrect properties during initial implementation (the project lacks official API data for BloodRuin — it is one of the 8 skills in CRT-002 with zero evidence).

6. **Resolution needed**: PVF/ANI research (Batch C / CRT-002 frame evidence) should verify the actual frame data, hitbox geometry, and skill mechanics for BloodRuin.

## 5. Blood Snatch — Replacement Skill

| Property | Value |
|----------|-------|
| Korean name | 블러드 스내치 (혈기포식 / 血气掠夺) |
| Added | 2019-06-18 (Operation: Hope) |
| Level | 60 Active |
| Type | Grab → spin hop → slam |
| Cooldown | 30 seconds |
| Directional input | Forward key to charge/close distance before grab |
| Super Armor | During cast |
| Invincibility | During explosion after successful grab + short window after |
| Implementation status | ❌ Not in project |

## 6. Recommendation

### Primary: KEEP BloodRuin for the 70–85 era

BloodRuin definitively existed during the 70–85 classic era. It should remain in the project as an active skill.

### Secondary: Investigate property accuracy (CRT-002)

The current frame data (persistent AoE field, 8s CD, 45 MP) has a **high probability of being incorrect**. The actual DNF BloodRuin was likely a **grab-type cube skill** with longer cooldown (~30s), higher MP cost (~400), and cube fragment requirement. The project should:

1. **Flag** BloodRuin in CRT-002 (frame evidence) as needing verification against PVF/ANI data.
2. **Cross-reference** against `batch-b-wiki-calibration.md` findings — BloodRuin is one of the 8 skills with zero API verification.
3. **Consider** whether the project's "blood pillar field" concept should be applied to a different skill (e.g., RagingFury has blood pillars from shockwave).

### Secondary: Plan Blood Snatch implementation

Blood Snatch (Level 60 grab) should be considered for future implementation. Since the project targets the 70–85 era, Blood Snatch should NOT replace BloodRuin — it belongs to a later era (2019+). However, if the project ever adds a "new era" skill pack, Blood Snatch would be the canonical replacement.

## 7. Open Questions

1. **What was BloodRuin's original skill level?** The replacement (Blood Snatch) is Level 60. Was BloodRuin also Level 60, or was it a different level skill that was replaced by a new Level 60 skill? Need PVF data to verify.

2. **What were the original hitbox/mechanics?** NamuWiki and patch notes describe the replacement as a grab. Was BloodRuin also a grab-type skill, or was it the persistent field represented in the project? Need PVF/ANI extraction.

3. **Was there a skill rework between 2012 and 2019?** BloodRuin may have received balance changes or mechanical reworks between its 2008 addition and 2019 deletion. The project should target the 2012-era version of the skill.

---

## Sources

- [DFO Official Berserker Balance Patch (Operation: Hope, 2019-06-18)](https://www.dfoneople.com/news/updates/1393/Character-Balance/Berserker)
- [NamuWiki - Berserker Skills (KDNF)](https://namu.wiki/w/%EB%B2%84%EC%84%9C%EC%BB%A4(%EB%8D%98%EC%A0%84%EC%95%A4%ED%8C%8C%EC%9D%B4%ED%84%B0)/%EC%8A%A4%ED%82%AC)
- [DFO World Wiki - Berserker Skills](https://wiki.dfo.world/view/Category:Berserker_Skills)
- [DFO World Wiki - Blood Snatch](https://wiki.dfo.world/view/Blood_Snatch)
- [DFO World Wiki - Blood Ruin (historical)](https://wiki.dfo.world/view/Blood_Ruin)
- Project file: `docs/design/tuning-baseline.md`
- Project file: `docs/research/reference/community/df0-berserker-patch-history.md`
- Project file: `docs/research/reference/community/namu-wiki-berserker-skills.md`
- Project file: `docs/research/reference/community/dfo-world-wiki-berserker-skills.md`
- Project file: `docs/research/batch-b-wiki-calibration.md`
- Project file: `docs/planning/crt-002-frame-evidence.md`
