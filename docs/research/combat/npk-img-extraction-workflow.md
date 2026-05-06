# NPK/IMG Frame Data Extraction Workflow
> **Status: [EXTRACTION] — NPK/IMG 资源提取工作流**

> Status: Pipeline design — NOT executed. Requires C# runtime and DNF client resources.
> Target: Extract per-animation frame counts, frame durations, anchor points, and hitbox attachment frames from Berserker skill IMG files.

## Overview

DNF stores all 2D sprite animations in **NPK** (resource packages) containing **IMG** (image containers). Each IMG file holds a single character/object's animation frames. This workflow documents how to extract frame-level metadata — not just sprite images — for Berserker combat actions.

## Prerequisites

### Required tools
| Tool | Purpose | Status |
|---|---|---|
| **OjoDnfExtractor** | NPK/IMG v1-6 extraction (C#, GPLV3) | [GitHub](https://github.com/HsOjo/OjoDnfExtractor) — 45 stars, active |
| **DNF-Porting** | Dual PVF+NPK extraction library (C#) | [GitHub](https://github.com/flwmxd/DNF-Porting) — 29 stars |
| .NET SDK 6.0+ | Runtime for C# tools | Required |
| **Python 3.10+** | Post-processing extracted data into TypeScript | Optional (manual conversion works too) |

### Required data sources
- DNF client installation (KDNF or CDNF) containing `ImagePacks2/` directory
- Decrypted NPK files (some NPKs are encrypted in recent DNF versions)
- Target IMG files for Berserker actions (skill animations, basic attacks, hit reactions)

### Legal boundary
**Extract numerical data only** — frame counts, durations, anchor points, hitbox attachment frames. Do NOT redistribute or embed DNF sprite images, textures, or other copyrighted visual assets. This is consistent with the project's `docs/design/source-policy.md`.

## Step 1: Identify target IMG files

Berserker animations are stored in NPK files under `ImagePacks2/`. The NPK naming convention maps to character classes:

```
sprite_character_swordman_equipment_XXXX.NPK  → equipment/weapon sprites
sprite_character_swordman_effect_XXXX.NPK     → skill effect sprites
```

Use OjoDnfExtractor's NPK browser to:
1. Open `ImagePacks2/` directory
2. Filter by "swordman" to find Berserker-relevant NPKs
3. Within each NPK, identify IMG files by internal name matching Berserker skill names

Expected IMG targets for core Berserker actions:
- `MountainousWheel` / equivalent Korean internal name
- `RagingFury` / equivalent
- `Bloodlust` / equivalent
- `Frenzy` / equivalent
- `BasicAttack1-3` sequences
- `UpwardSlash`
- `Diehard` / `Derange` buff casts
- `QuickRebound`
- `GoreCross` / `OutrageBreak` / `ExtremeOverkill` (future backlog)

## Step 2: Extract frame metadata using OjoDnfExtractor

OjoDnfExtractor provides both GUI and command-line modes. For automation:

### 2a. Extract IMG container structure
```bash
# Command-line extraction (check OjoDnfExtractor docs for exact flags)
OjoDnfExtractor.exe extract --input "ImagePacks2/sprite_character_swordman_effect_XXXX.NPK" --output "./extracted/" --format json
```

### 2b. Parse IMG frame headers
Each IMG file contains a header with per-frame metadata:
```
IMG Header:
  - version: 1-6 (OjoDnfExtractor handles all)
  - frame_count: int
  - frames[]:
      - duration: ticks (1 tick ≈ 16.67ms at 60fps)
      - width: px
      - height: px
      - anchor_x: px (horizontal offset from origin)
      - anchor_y: px (vertical offset from origin)
      - raw_data_offset: byte position in container
```

### 2c. Extract frame durations
Frame durations in IMG files are NOT uniform. DNF animations use variable frame timing:
- Some frames hold for 2 ticks (~33ms)
- Impact/key frames may hold for 3-5 ticks
- Fast attack windups may use 1-tick frames

Extract the exact duration per frame — this directly feeds into `totalFrames` and phase boundaries in `FrameDataAction`.

### 2d. Extract anchor points
Frame anchor points (`anchor_x`, `anchor_y`) define the sprite's registration point relative to its bottom-center. This is critical for:
- Validating that the project's bottom-center anchoring (`setCrop()` positioning) matches DNF official
- Correcting foot-position offsets for ground alignment

### 2e. Map hitbox attachment frames
DNF hitboxes activate/deactivate on specific animation frames. In the IMG file, hitbox timing is stored as:
- Attach point markers in the IMG metadata (if available in the version)
- Or inferred from .skl file references (see PVF/.skl workflow)

When hitbox attachment data is in the IMG, extract:
- `hitbox_attach_frame`: frame index where a hitbox activates
- `hitbox_detach_frame`: frame index where it deactivates

This directly maps to `HitBoxFrameWindow.start` and `HitBoxFrameWindow.end` in `FrameDataAction`.

## Step 3: Convert to TypeScript data module

### 3a. Map DNF tick timing to Combat Lab
```
DNF tick → Combat Lab frame: 1:1 mapping (both 60fps)
DNF frame duration → Combat Lab totalFrames: sum of per-frame durations in ticks
DNF active attach/detach frames → HitBoxFrameWindow start/end
```

### 3b. Output format (`src/data/berserker.frame-data.ts`)
```typescript
// Auto-generated from NPK/IMG extraction — do not hand-edit
// Source: DNF client ImagePacks2/ via OjoDnfExtractor
// Date: YYYY-MM-DD

export interface BerserkerFrameData {
  skillName: string;
  totalFrames: number;          // sum of per-frame durations
  frames: {
    index: number;               // 0-based frame index
    durationTicks: number;       // 1 tick ≈ 16.67ms
    anchorX: number;             // pixel offset from origin
    anchorY: number;             // pixel offset from origin
  }[];
  hitboxWindows: {
    id: string;
    attachFrame: number;         // frame index where hitbox activates
    detachFrame: number;         // frame index where hitbox deactivates
  }[];
}

export const BERSERKER_FRAME_DATA: Record<string, BerserkerFrameData> = {
  // Populated by extraction pipeline
};
```

### 3c. Cross-reference with existing tuning-baseline
After extraction, compare extracted frame data against `docs/design/tuning-baseline.md`:
- Mark entries where baseline matches extracted data as VERIFIED
- Flag discrepancies > 2 ticks as BASELINE_ERROR
- Add extracted anchor point data to tuning baseline

## Step 4: Automation script (Python post-processing)

For repeatability, create a Python script that:
1. Reads OjoDnfExtractor JSON output
2. Filters to Berserker-relevant IMG files
3. Sums frame durations into totalFrames
4. Extracts hitbox attachment frames
5. Generates `src/data/berserker.frame-data.ts`

```python
# scripts/extract-frame-data.py
# Run: python scripts/extract-frame-data.py --input ./extracted/ --output src/data/berserker.frame-data.ts

import json, sys
from pathlib import Path

def parse_img_metadata(img_json: dict) -> dict:
    frames = img_json.get("frames", [])
    total_frames = sum(f.get("duration", 1) for f in frames)
    return {
        "totalFrames": total_frames,
        "frames": [
            {
                "index": i,
                "durationTicks": f.get("duration", 1),
                "anchorX": f.get("anchor_x", 0),
                "anchorY": f.get("anchor_y", 0),
            }
            for i, f in enumerate(frames)
        ],
    }

# ... full script would map skill names to extracted data
```

## Known limitations

1. **Encrypted NPKs**: Recent DNF versions encrypt some NPK files. OjoDnfExtractor may not handle encrypted v6+ IMG formats without updates.
2. **No dedicated Python tool**: All major NPK/IMG extractors are C#. Cross-platform use requires .NET runtime.
3. **Hitbox attachment data**: Not all IMG versions store hitbox timing in the IMG itself. Fall back to .skl file cross-referencing (see PVF workflow).
4. **Version drift**: DNF patches change frame data. Extraction must be version-pinned to a specific DNF client version.
5. **Skill name mapping**: Korean internal skill names in IMG files differ from English wiki names. A name mapping table is needed.

## Alternatives considered

| Approach | Effort | Accuracy | Notes |
|---|---|---|---|
| **OjoDnfExtractor (C#)** | Medium | 95%+ | Gold standard — extracts exact frame metadata |
| **DNF-Porting library** | Medium | 95%+ | Alternative C# lib, also handles PVF |
| **Port to Python** | High | 70-80% | No existing Python IMG parser; would need reverse engineering |
| **Video frame analysis** | Low-medium | 80-90% | Fallback — 60fps recording + manual frame count |

## Output deliverables

1. `src/data/berserker.frame-data.ts` — extracted frame tables
2. Updated `docs/design/tuning-baseline.md` — values marked VERIFIED or corrected
3. `docs/research/art/npk-img-berserker-extraction-results.md` — raw extraction notes

## Next steps after extraction

- Compare extracted frame data against PVF/.skl data (Phase 2B) for cross-validation
- Update `FrameDataAction.ts` with verified frame counts and phase boundaries
- Run `npm run static:test` to detect config validation failures
