# PVF/.skl Skill Data Extraction Workflow
> **Status: [EXTRACTION] — PVF/SKL 技能数据提取工作流**

> Status: Pipeline design — NOT executed. Requires C# runtime, PVF file, and decryption tools.
> Target: Extract skill frame phases, hitbox parameters, launch/gravity values, and attack coefficients from DNF server-side PVF files.

## Overview

DNF stores all server-authoritative game data in **PVF** (Package Version File) format. When decrypted, PVF content is plain-text structured data in zipped directories. The `.skl` files within PVF contain skill definitions including frame phase durations, hitbox references, launch physics, and attack power coefficients.

## Prerequisites

### Required tools
| Tool | Purpose | Status |
|---|---|---|
| **PvfPlayer** | PVF unpack/packer for DNF Taiwan | [GitHub](https://github.com/ariakeumi/PvfPlayer) — 3 stars, under development |
| **DNF-Porting** | Dual PVF+NPK extraction library (C#) | [GitHub](https://github.com/flwmxd/DNF-Porting) — 29 stars |
| **DNF-PVF-decode-program** | PVF decoder | [GitHub](https://github.com/SoraKasvgano/DNF-PVF-decocde-program) — 4 stars |
| .NET SDK 6.0+ | Runtime for C# tools | Required |
| **Python 3.10+** | Post-processing extracted data into TypeScript | Recommended |

### Required data sources
- Decrypted PVF file (matching target DNF version, e.g., KDNF Season 8 or CDNF equivalent)
- Knowledge of Berserker skill internal IDs (mapping Korean internal names to English wiki names)

### Legal boundary
**Extract numerical data only** — frame counts, hitbox parameters, physics values, attack coefficients. Do NOT redistribute PVF files, .skl source text, or any DNF server-side intellectual property. This is consistent with `docs/design/source-policy.md`.

## Step 1: Unpack PVF archive

### 1a. Obtain decrypted PVF
PVF files are encrypted in official DNF distributions. Community tools can decrypt them. The decrypted PVF is a standard archive containing plain-text data.

Reference: [Reddit: Is there a way to extract skill data from the game?](https://www.reddit.com/r/DFO/comments/9y2f6c/is_there_a_way_to_extract_skill_data_from_the_game/) confirms that decrypted PVF files contain plain-text zipped directories with skill data, monster stats, and item stats.

### 1b. Unpack with PvfPlayer or DNF-Porting
```bash
# Using PvfPlayer (check repo for exact CLI)
PvfPlayer.exe unpack --input "path/to/decrypted.pvf" --output "./pvf_extracted/"

# Or using DNF-Porting library
DNFPorting.exe extract-pvf --input "path/to/decrypted.pvf" --output "./pvf_extracted/"
```

Expected directory structure after extraction:
```
pvf_extracted/
├── skill/           ← .skl files — skill definitions
├── character/       ← character stat tables
├── monster/         ← monster/NPC data
├── item/            ← equipment/item data
├── etc/             ← miscellaneous (damage formula constants, etc.)
└── ...
```

## Step 2: Locate Berserker .skl files

### 2a. Skill ID mapping
DNF uses internal numeric IDs for skills. Berserker (버서커) skills map to specific ID ranges:

```
Class ID for Berserker (Male Slayer → Berserker): 0x05 (?)
Skill ID range: varies by DNF version
```

Use the skill name lookup table within PVF to find exact IDs:
```
skill/list.skl  → master skill list with name → ID mapping
skill/[id].skl  → individual skill definition
```

### 2b. Target .skl files for core Berserker skills
Expected .skl targets (Korean internal names → English):
- 산등성이휠 → MountainousWheel
- 레이징퓨리 → RagingFury  
- 블러드러스트 → Bloodlust
- 프렌지 → Frenzy
- 폭주 → Derange
- 다이하드 → Diehard
- 고어크로스 → GoreCross
- 블러디크로스 → BloodyCross
- 아웃레이지브레이크 → OutrageBreak
- 익스트림오버킬 → ExtremeOverkill
- 퀵리바운드 → QuickRebound
- 갈증 → Thirst
- 블러드메모리 → BloodMemory
- 기본공격1-3 → BasicAttack1-3

## Step 3: Parse .skl file structure

### 3a. .skl file format
Decrypted .skl files are structured text (typically key-value or section-based). Each .skl contains:

```
[skill]
id = <int>
name = "<Korean name>"
class = <int>
level_required = <int>
max_level = <int>
master_level = <int>
sp_cost = <int>
command = "<input command>"

[cast]
cast_time = <int>          # startup frames (ticks)
cast_animation = <string>   # animation reference

[active]
duration = <int>            # active phase frames
hitbox_ids = <list>         # hitbox references
hit_interval = <int>        # multi-hit interval (ticks)

[recovery]
duration = <int>            # recovery phase frames

[hitbox.<id>]
type = <string>             # "slash", "grab", "projectile", "shockwave"
size_x = <float>
size_y = <float>
size_z = <float>
offset_x = <float>
offset_y = <float>
offset_z = <float>
attack_power = <float>      # percentage multiplier (e.g., 2300.0 = 2300%)
fixed_damage = <int>        # fixed damage component
hit_count = <int>
max_targets = <int>

[physics]
launch_force = <float>      # Y-axis launch velocity
gravity_modifier = <float>  # gravity multiplier during float
float_duration = <int>      # float time in ticks
knockback_x = <float>
knockback_z = <float>
hitstun_duration = <int>    # hitstun in ticks
can_otg = <bool>
can_air_hit = <bool>

[cooldown]
cooldown_ticks = <int>
mp_cost = <int>
cube_cost = <int>
```

### 3b. Map .skl fields to Combat Lab FrameDataAction
```
.skl field                        → FrameDataAction field
──────────────────────────────────────────────────
cast.cast_time                   → startup phase duration (sum of all startup frames)
active.duration                  → active phase duration (HitBoxFrameWindow span)
recovery.duration                → recovery phase duration
hitbox.<id>.attack_power         → baseDamage (percentage scaling)
hitbox.<id>.size_x/y/z           → HitBoxFrameWindow.w/d/h
hitbox.<id>.offset_x/y/z         → HitBoxFrameWindow.offsetX/Y/Z
hitbox.<id>.max_targets          → HitBoxFrameWindow.maxTargets
hitbox.<id>.hit_count            → number of hit windows to create
physics.launch_force             → HitReactionProfile.launchVelocityY
physics.gravity_modifier         → HitReactionProfile.horizontalFriction (inverse)
physics.float_duration           → HitReactionProfile.downFrames (approximate)
physics.knockback_x              → HitReactionProfile.knockbackX
physics.hitstun_duration         → HitReactionProfile.hitStunFrames
cooldown.cooldown_ticks          → CooldownProfile.independentCooldownFrames
cooldown.mp_cost                 → CostProfile.mpCost
```

## Step 4: Extract damage formula constants

### 4a. Locate damage formula data
PVF's `etc/` directory contains global game constants including:
- Defense reduction formula parameters
- Elemental damage (属强) modifier curve
- Critical hit multiplier base
- Fixed damage vs percentage damage scaling factors
- Level difference penalty curve

### 4b. Extract key constants
```
etc/damage_formula.dat (or equivalent):
├── def_reduction_curve: [(def, reduction%), ...]
├── ele_damage_percent: float  (e.g., 0.0045 = 0.45% per point)
├── crit_base_multiplier: 1.5
├── fixed_damage_scalar: float
├── level_penalty_table: [(level_diff, penalty%), ...]
└── pvp_damage_modifier: float (separate from PVE)
```

### 4c. Cross-reference with dcalc calculator
The cloned [dnfcalc/dcalc](https://github.com/dnfcalc/dcalc) repository at `D:\tmp-dnfcalc` contains a SQLite database with equipment data. Its damage formula logic is in:
- `backend/generate/equ.py` — equipment stat generation
- `backend/core/` — damage calculation engine (Python)

Extract formula constants from dcalc code and validate against PVF-extracted values.

## Step 5: Convert to TypeScript data module

### 5a. Output format (`src/data/berserker.skill-data.ts`)
```typescript
// Auto-generated from PVF/.skl extraction — do not hand-edit
// Source: DNF PVF via PvfPlayer/DNF-Porting
// Date: YYYY-MM-DD

export interface BerserkerSkillData {
  skillName: string;
  internalId: number;
  internalName: string;  // Korean name
  
  // Frame phases (all in ticks, 1 tick ≈ 16.67ms)
  castTime: number;       // startup
  activeDuration: number; // active
  recoveryTime: number;   // recovery
  
  // Hitbox parameters
  hitboxes: {
    id: string;
    type: 'slash' | 'grab' | 'projectile' | 'shockwave';
    sizeX: number;
    sizeY: number;
    sizeZ: number;
    offsetX: number;
    offsetY: number;
    offsetZ: number;
    attackPower: number;    // percentage (e.g., 2300 = 2300%)
    fixedDamage: number;
    maxTargets: number;
  }[];
  
  // Physics
  launchForce: number;
  gravityModifier: number;
  floatDuration: number;
  knockbackX: number;
  hitstunDuration: number;
  
  // Resources
  cooldownTicks: number;
  mpCost: number;
  cubeCost: number;
}

export const BERSERKER_SKILL_DATA: Record<string, BerserkerSkillData> = {
  // Populated by extraction pipeline
};
```

## Step 6: Automation script (Python)

```python
# scripts/extract-pvf-skill-data.py
# Run: python scripts/extract-pvf-skill-data.py --input ./pvf_extracted/skill/ --output src/data/berserker.skill-data.ts

import os, re, json
from pathlib import Path

def parse_skl_file(filepath: str) -> dict:
    """Parse a .skl text file into structured skill data."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    data = {}
    
    # Parse sections (actual format depends on DNF version)
    # This is a template — adjust regex patterns for actual .skl format
    data['castTime'] = int(re.search(r'cast_time\s*=\s*(\d+)', content).group(1))
    data['activeDuration'] = int(re.search(r'active_duration\s*=\s*(\d+)', content).group(1))
    data['recoveryTime'] = int(re.search(r'recovery_duration\s*=\s*(\d+)', content).group(1))
    data['cooldownTicks'] = int(re.search(r'cooldown\s*=\s*(\d+)', content).group(1))
    data['mpCost'] = int(re.search(r'mp_cost\s*=\s*(\d+)', content).group(1))
    
    # Parse hitbox sections
    hitbox_pattern = r'\[hitbox\.(\w+)\]\n(.*?)(?=\n\[|\Z)'
    hitboxes = []
    for match in re.finditer(hitbox_pattern, content, re.DOTALL):
        hb_id = match.group(1)
        hb_content = match.group(2)
        hitboxes.append({
            'id': hb_id,
            'attackPower': float(re.search(r'attack_power\s*=\s*([\d.]+)', hb_content).group(1)),
            'sizeX': float(re.search(r'size_x\s*=\s*([\d.]+)', hb_content).group(1)),
            'sizeY': float(re.search(r'size_y\s*=\s*([\d.]+)', hb_content).group(1)),
            # ... etc
        })
    data['hitboxes'] = hitboxes
    
    return data

def generate_typescript(skills: dict) -> str:
    """Generate TypeScript source from parsed skill data."""
    # Template for the output file
    pass

# Main entry point
if __name__ == '__main__':
    input_dir = sys.argv[sys.argv.index('--input') + 1]
    output_file = sys.argv[sys.argv.index('--output') + 1]
    # ... parse all .skl files and generate output
```

## Known limitations

1. **PVF version dependency**: .skl format varies across DNF seasons. The parser must be version-matched.
2. **No dedicated .skl parser**: All existing tools are general PVF unpackers. The .skl parser must be custom-built.
3. **Encryption**: PVF files are encrypted in official distributions. Decryption requires community tools.
4. **Internal ID mapping**: Korean internal skill names must be manually mapped to English wiki names.
5. **Hitbox-to-animation mapping**: .skl files reference hitbox IDs, but the mapping from hitbox ID to animation frame requires cross-referencing with IMG/ANI files.
6. **Damage formula location**: The exact location of damage formula constants in PVF varies by version.

## Alternatives considered

| Approach | Effort | Accuracy | Notes |
|---|---|---|---|
| **PVF unpack + custom .skl parser** | High | 95%+ | Gold standard — extracts server-authoritative data |
| **DNF-Porting library** | Medium | 90%+ | C# lib that handles both PVF and NPK |
| **Neople Open API** | Low | 60-70% | Only exposes subset: CD, MP, level tables, skill text. No frame data or physics. |
| **COLG 礁石22222 tables** | Low | 80-90% | Screenshot-based tables — numerical values but no frame/phase data |
| **Video frame analysis** | Medium | 80-90% | Fallback for frame counts only — no physics/hitbox data |

## Output deliverables

1. `src/data/berserker.skill-data.ts` — extracted skill parameters
2. Updated `docs/design/tuning-baseline.md` — values marked VERIFIED or EXTRACTED
3. `docs/research/combat/pvf-skl-berserker-extraction-results.md` — raw extraction notes

## Integration with NPK/IMG pipeline

The NPK/IMG pipeline (Phase 2A) and PVF/.skl pipeline (Phase 2B) are complementary:
- **PVF/.skl** provides: frame phase durations, hitbox geometry, physics parameters, damage coefficients
- **NPK/IMG** provides: per-frame durations, anchor points, hitbox attachment frame indices

Cross-reference both sources to validate frame data:
```
.skl cast_time              → should match sum of IMG frame durations before first hitbox
.skl active.duration        → should match IMG frames with active hitbox
.skl recovery.duration      → should match remaining IMG frames after last hitbox
```

Discrepancies between .skl and IMG data indicate version mismatch or decryption errors — resolve before importing into Combat Lab.
