# PVF/ANI/NPK Toolchain Feasibility Research — Batch C

**Date**: 2026-05-09  
**Scope**: Combat Lab 0.3 — Evidence Source Layer 3  
**Status**: Research complete; no implementation  
**Target version**: DNF 70–85 classic pre-Metastasis (2012 era)

## Executive Summary

PVF/ANI/NPK are the three primary file formats in the DNF/DFO client. This report assesses feasibility of extracting combat-relevant data (frame timings, hitbox geometry, launch/gravity curves, monster AI params, animation data) that the Neople Open API and community wikis do not expose.

**Key findings**:
- **NPK/IMG**: Format is well-documented by community reverse-engineering. Multiple open-source tools exist. Frame extraction (sprites, pivot points, frame dimensions) is **highly feasible**.
- **PVF**: Format is well-documented. Script data (skill params, monster stats, equipment tables) is extractable. Several GitHub tools provide unpack/pack functionality. **Feasible for structured data extraction**.
- **ANI**: The binary format is **not publicly documented**. NDC 2014 confirms it stores "which image per frame in what order," but no open-source parser exists for the raw binary. This is the **highest-risk format**.

**Overall recommendation**: Proceed with NPK and PVF extraction. Use a clean-room sidecar approach for ANI data, building a compatible JSON-based animation clip format until a reliable ANI parser can be developed or sourced.

---

## 1. Format Overview

### 1.1 NPK (Neople Pack)

**Role**: Resource package container. Holds collections of IMG (image) files and OGG (audio) files.

**Binary structure** (community-documented):

| Field | Size | Description |
|-------|------|-------------|
| Magic | 16 bytes | ASCII `NeoplePack_Bill` + null padding |
| imgCount | 4 bytes | Number of IMG entries |
| Index entries | 264 × imgCount | Each: offset (4), size (4), nameEnc (256) |
| Checksum | 32 bytes | Package-level integrity |
| IMG data | variable | Raw IMG blobs at indexed offsets |

**Internal path convention**: `sprite/character/<class>/<category>/<action>.img`

**Common NPK categories** (community-documented):

| NPK File | Contents |
|----------|----------|
| `sprite_map*.NPK` | Environment, breakables, dungeon props |
| `sprite_map_npc.NPK` | NPC standing sprites |
| `sprite_interface*.NPK` | UI panels, NPC portraits, event stills |
| `sprite_item*.NPK` | Item/weapon icons |
| `sprite_character_common*.NPK` | Generic skill icons, character UI |
| `sprite_pet*.NPK` | Pet effects, pet icons |
| `sprite_character_<class>*.NPK` | Class-specific sprites |

### 1.2 IMG (Neople Image)

**Role**: Frame image collection within NPK. The minimum unit of visual asset organization.

**Binary structure** (community-documented):

| Field | Size | Description |
|-------|------|-------------|
| Magic | 16–20 bytes | `Neople Img File` + version indicator |
| indexSize | 4 bytes | Size of index table |
| reserved | 4 bytes | Usually 0 |
| version | 4 bytes | IMG version (2/4/5/6) |
| indexCount | 4 bytes | Number of frames |

**Per-frame entry** (actual frames):

| Field | Size | Description |
|-------|------|-------------|
| colorMode | 4 bytes | Pixel format (see below) |
| compression | 4 bytes | 5=uncompressed, 6=ZLIB |
| width | 4 bytes | Image width in pixels |
| height | 4 bytes | Image height in pixels |
| dataSize | 4 bytes | Compressed/uncompressed data size |
| x | 4 bytes | Pivot/placement X (int32) |
| y | 4 bytes | Pivot/placement Y (int32) |
| frameWidth | 4 bytes | Frame bounding box width |
| frameHeight | 4 bytes | Frame bounding box height |

**Link frames**: When `colorMode == 0x11`, the entry stores only a `linkFrame` index referencing a prior actual frame — used for frame deduplication.

**IMG versions and color formats** (community-documented):

| Version | Name | Color Modes | Use Case |
|---------|------|-------------|----------|
| V2 | Standard color | 0x0E=1555, 0x0F=4444, 0x10=8888 | UI, icons, maps, markers |
| V4 | Palette-indexed | Same as V2 | Avatar/costume with recolor |
| V5 | DDS texture | 0x12/0x13/0x14 | Skill effects (DDS blocks) |
| V6 | Multi-palette | Same as V4 | Multi-scheme palette variants |

### 1.3 PVF (Package Version File / Script Archive)

**Role**: Script and data archive. Contains game logic, skill parameters, monster stats, equipment tables, quest data, and string tables.

**Binary structure** (community-documented):

| Section | Description |
|---------|-------------|
| Header | uuidLength, uuid, fileVersion |
| Directory Tree | dirTreeLength, dirTreeCrc32, headerFilesCount, encHeaderTree |
| File Pack | Sequential file data blobs |

**Directory tree entry** per file:

| Field | Description |
|-------|-------------|
| fileNumber | Numeric file ID |
| filePathLength | Path string length |
| filePath | Path, CP949-encoded |
| fileLength | Data size |
| fileCrc32 | Integrity check |
| relativeOffset | Offset within filePack |

**Key internal files** (community-documented):

| File | Purpose |
|------|---------|
| `stringtable.bin` | String index ranges |
| `n_string.lst` | Index-to-text mapping (BIG5/CP949) |
| `equipment/equipment.lst` | Equipment definitions |
| `skill/<class>/*.skl` | Skill script chunks |
| `monster/*.mst` | Monster stat tables |
| `map/*.map` | Dungeon/room definitions |

**Script chunk types** (community-documented): Int, Float, Section, Command, String, StringLink — organized in a bytecode-like format.

### 1.4 ANI (Animation)

**Role**: Animation timeline file. Defines which IMG frame to display at each point in time.

**What is publicly known**:
- NDC 2014 presentation confirmed: ".ani files record which image to use for each frame and in what order" (NDC2014_0066)
- ANI files constitute a large proportion of the client's non-image/non-audio data (~50% of 540K data files)
- ANI files drive the frame-animation pipeline; they are NOT a general-purpose skeletal animation system

**What is NOT publicly known**:
- Binary layout (byte order, field sizes, versioning)
- How link frames from IMG are referenced within ANI timelines
- Whether ANI supports blend/transition/interpolation
- Event/socket/hitbox trigger encoding within ANI
- Whether multiple ANI versions exist across DNF eras

### 1.5 SPK (Script Pack)

**Role**: Client-side patch/delta container for distributing updates.

**Binary structure** (community-documented):

| Field | Description |
|-------|-------------|
| Magic | `0x1B111` |
| Filename table | 260-byte entries |
| Block table | 48-byte per-block headers |
| Block data | BZ2-compressed or raw, per-block SHA256 |
| Target | Decompresses back to NPK files |

SPK is the outermost distribution layer: `sprite_interface.NPK.spk` decompresses to `sprite_interface.NPK`. It is a patching format, not a data format — the CI pipeline should decompress SPK to NPK as a preprocessing step.

---

## 2. Existing Tools

### 2.1 NPK/IMG Tools

| Tool | Repository | Language | Platform | Capabilities |
|------|-----------|----------|----------|--------------|
| **DFOToolBox** | `LHCGreg/DFOToolBox` | C++ | Windows | Browse NPK, export to GIF, command-line `npk2gif` |
| **OjoDnfExtractor** | `HsOjo/OjoDnfExtractor` | C# | Windows | Extract IMG V1–V6, export to PNG/JSON/XML/GIF/MP4 |
| **npk-api** | `hooyantsing/npk-api` | JavaScript | Cross | Read/write NPK/IMG; `doc/` directory contains detailed format specs for NPK, IMG V2/V4/V5/V6, SPK |
| **DNF Extractor** | Various (Chinese community) | C++/C# | Windows | GUI tool for browsing and extracting NPK contents |
| **DNF ImagePacks2 Tools** | Various (Chinese forums) | Various | Windows | Batch NPK extraction, especially for sprite sheets |

**Strongest recommendation**: `npk-api` for format reference + `OjoDnfExtractor` for batch extraction.

### 2.2 PVF Tools

| Tool | Repository | Language | Platform | Capabilities |
|------|-----------|----------|----------|--------------|
| **similing4/pvf** | `similing4/pvf` | JavaScript | Cross | Read PVF tree, `getPvfFileByPath("equipment/equipment.lst")`, Python bindings via Node |
| **PvfPlayer** | `ariakeumi/PvfPlayer` | C++ | Windows | Unpack/pack PVF files, oriented toward Taiwan server PVF |
| **PVFEditor** | `kahotv/PVFEditor` | C++ | Windows | GUI search across skills, items, monsters, quests, maps, dungeons |
| **pvfDotnet** | Various | C# | Windows | .NET PVF parser, path-based file extraction |
| **SuperPVF** | Various (Chinese community) | C++ | Windows | Popular Chinese PVF editor with search and edit |

**Strongest recommendation**: `similing4/pvf` for programmatic extraction + `PVFEditor` for manual inspection/verification.

### 2.3 ANI Tools

**No open-source ANI parser was found.** The format's binary structure remains undocumented in public forums, GitHub repositories, and community wikis.

NDC 2014 confirms the format exists and describes its semantic role, but the binary layout has not been publicly reverse-engineered. Several community NPK tools mention ANI as a companion file to IMG but do not parse it.

### 2.4 SPK Tools

The `npk-api` repository documents the SPK format in its `doc/` directory, including the `0x1B111` magic number and block table structure. Some NPK tools include SPK decompression as a preprocessing step (e.g., DFOToolBox can handle SPK-wrapped NPK files).

---

## 3. Feasibility Assessment

### 3.1 What CAN Be Extracted

| Data Type | Source Format | Extracted Via | Confidence |
|-----------|---------------|---------------|------------|
| Sprite frames (RGBA pixels) | NPK → IMG V2/V4/V5/V6 | OjoDnfExtractor, npk-api | **High** |
| Per-frame pivot points (x, y) | IMG | All IMG parsers | **High** |
| Per-frame bounding box (frameWidth, frameHeight) | IMG | All IMG parsers | **High** |
| Link frame references (deduplication) | IMG | All IMG parsers | **High** |
| Palette/color scheme data | IMG V4/V6 | OjoDnfExtractor, npk-api | **High** |
| DDS effect textures | IMG V5 | OjoDnfExtractor | **Medium** |
| Skill script parameters | PVF | similing4/pvf, PVFEditor | **High** |
| Monster stat tables | PVF | similing4/pvf, PVFEditor | **High** |
| Equipment definitions | PVF | similing4/pvf, PVFEditor | **High** |
| String tables (KR/CN/TW) | PVF | similing4/pvf (CP949/BIG5 decode) | **Medium** |
| NPK internal directory structure | NPK | All NPK tools | **High** |
| Skill-to-IMG resource bindings | PVF + NPK | Cross-reference PVF scripts with NPK paths | **Medium** |
| Frame count per animation | ANI via NDC description | (No ANI parser; inference from IMG frame count + community data) | **Low** |
| Frame duration/timing | ANI | **NOT possible without ANI parser** | **N/A** |
| Hitbox geometry (per frame) | PVF scripts? | Uncertain — may be in PVF script chunks or compiled code | **Low** |
| Launch curves / gravity params | PVF scripts? | Uncertain — may be in PVF constants or hardcoded | **Low** |
| Combo-protection thresholds | PVF scripts? | Uncertain — likely in PVF constants | **Low** |
| Monster AI behavior trees | PVF | Extractable if in PVF scripts (partially confirmed) | **Medium** |

### 3.2 What CANNOT Be Reliably Extracted

| Data Type | Blocker | Alternative |
|-----------|---------|-------------|
| **Per-frame animation timing** (which frame lasts how long) | ANI binary format undocumented | Frame-capture from 60fps gameplay video; heuristic timing from IMG frame counts |
| **Hitbox active window frames** | Unknown storage location (ANI? PVF? hardcoded?) | 60fps video frame-counting with visual hit spark alignment |
| **Hurtbox dimensions per frame** | Unknown storage location | Gameplay video measurement; clean-room estimation |
| **Launch/gravity physics curves** | Unknown — likely hardcoded or in undocumented PVF sections | In-game measurement; clean-room cubic bezier approximation |
| **Combo protection exact thresholds** | Unknown storage | DFO World Wiki research + in-game testing |
| **Guard/parry frame windows** | Unknown storage | Video analysis |

### 3.3 The ANI Problem in Detail

The ANI format is the single largest blind spot. Here's what we know, what we don't, and what it means:

**Evidence we have**:
- NDC 2014: ".ani files are frame-order files — which image per frame in what order"
- ANI files are abundant: the 2014 talk said ~50% of the 540K non-image/audio files are ANI
- Community IMG parser authors have noted link-frame references (0x11) in IMG, strongly suggesting ANI references these directly

**What we lack**:
- Binary field layout — no public hex dumps, no struct definitions
- Version information — V2/V4/V5/V6 IMG likely have different ANI versions
- Event/socket encoding — where hitboxes, sound triggers, and cancel windows live

**Why this matters for Combat Lab 0.3**:
- Without ANI timing data, we cannot extract **per-frame durations** for action startup/active/recovery phases
- Our current 38-action `actions/default.json` uses hand-tuned frame counts — ANI data would be the gold standard
- The project's source policy already restricts direct asset use, so ANI data would be used as **reference numbers for calibration**, not runtime-loaded files

---

## 4. Legal Considerations

### 4.1 Project Source Policy Alignment

The project's `docs/design/source-policy.md` states:

> This demo uses original code and placeholder rendering only. It does not include DNF/DFO client assets, leaked code, private-server code, reverse-engineered client code, official fonts, official sounds, official maps, or original sprites.

And the DNF/DFO Truth Hierarchy prioritizes:
1. Neople Official API
2. Archived API snapshots
3. DFO World Wiki / NamuWiki
4. Wikipedia (background only)
5. Clean-room local baseline tuning

**PVF/ANI/NPK fit into layer 3** (below API, below wiki). This research proposes using PVF/ANI/NPK **only as a data source for calibration values**, never as an asset pipeline.

### 4.2 Risk Assessment

| Activity | Risk Level | Rationale |
|----------|------------|-----------|
| Reading publicly-documented format specs (npk-api docs, NDC talks) | **Low** | Public research, no client access needed |
| Using open-source parsers on legally-obtained client files | **Medium** | EULA prohibits reverse engineering; but format research for interoperability is defensible in some jurisdictions |
| Extracting individual numeric values (skill params, frame counts) for calibration | **Medium** | Using as reference data, not redistributing |
| Extracting and redistributing sprite images | **High** | Direct copyright violation |
| Running a private server or distributing server binaries | **High** | Explicitly prohibited |

### 4.3 Recommended Clean-Room Approach

Follow the same clean-room pattern established in the existing art pipeline research:

1. **Group A (Research)**: Runs open-source tools on legally-obtained client files, extracts numeric reference data, documents provenance
2. **Group B (Implementation)**: Works from Group A's written specifications only, creates original data files
3. **Repository policy**: No DNF/DFO client files, extracted sprites, or raw PVF dumps in version control
4. **Provenance tracking**: Every extracted data point must carry: source file, tool used, extraction date, version info

---

## 5. Recommended Approach

### 5.1 Tiered Implementation Plan

#### Phase 1: NPK/IMG Frame Reference Extraction (Week 1–2)

**Goal**: Extract per-action frame counts, pivot points, and bounding box dimensions for Berserker actions.

**Pipeline**:

**Output**: `docs/research/data/npk-frame-index.json` — per-action frame counts, pivot offsets, bounding boxes.

**Time estimate**: 8–16 hours (tool setup: 2h, extraction: 2h, action-matching: 4–8h, documentation: 2h)

#### Phase 2: PVF Skill/Monster Data Extraction (Week 2–3)

**Goal**: Extract skill parameter tables, monster stat tables, and equipment definitions for cross-reference with API/wiki data.

**Pipeline**:

**Output**: `docs/research/data/pvf-skill-params.json`, `docs/research/data/pvf-monster-stats.json`

**Time estimate**: 16–24 hours (PVF tool setup: 2h, script chunk parsing: 8–12h, cross-reference: 4–8h, documentation: 2h)

#### Phase 3: ANI Workaround — Frame-Timing Calibration (Week 3–4)

**Goal**: Since ANI binary format is undocumented, use alternative methods to get frame-timing data.

**Approach**:
1. Extract known frame counts from IMG (Phase 1 output)
2. Record 60fps gameplay video of each Berserker action
3. Frame-count startup/active/recovery windows using visual hit spark alignment
4. Cross-reference with DFO World Wiki skill data (cooldown, cast time)
5. Build clean-room animation clip JSON matching our existing sidecar format

**Output**: `docs/research/data/ani-frame-timing-calibration.json`

**Time estimate**: 24–40 hours (video capture: 4h, frame counting: 12–20h, sidecar authoring: 4–8h, cross-reference: 4h)

### 5.2 Sidecar Strategy for ANI

Until a verified ANI binary parser exists, use a clean-room compatible animation format. This is consistent with the existing art pipeline research which recommended sidecar JSON for hitboxes, sockets, and nine-slice data — none of which have confirmed binary representations in the original formats.

**Recommended ANI-compatible sidecar format**:


This format is **not** a reverse-engineered ANI parser output — it's a clean-room observation record. Each field is annotated with its extraction method and can be independently verified or replaced when better data becomes available.

### 5.3 Toolchain Summary


**Critical rule**: Extracted reference data lives in `docs/research/data/` (not committed if it contains copyrighted values). Clean-room manifests live in `src/data/manifest/`. The pipeline from extracted data to manifest is manual, documented, and reviewer-verifiable.

---

## 6. Time Estimates

| Phase | Activity | Estimate | Dependencies |
|-------|----------|----------|--------------|
| 1 | NPK/IMG frame extraction pipeline | 8–16 hours | None |
| 2 | PVF skill/monster data extraction | 16–24 hours | None |
| 3 | ANI workaround — frame timing calibration | 24–40 hours | Phase 1 (frame counts) |
| — | **Total (phased)** | **48–80 hours** | |
| — | Tool environment setup (one-time) | 4–8 hours | Windows dev environment |
| — | Cross-reference validation | 8–12 hours | Phases 1 + 2 + API/wiki data |
| — | Documentation & provenance tracking | 8–12 hours | Distributed across phases |

**Overall estimate**: 2–4 weeks part-time, 8–10 days full-time.

---

## 7. Open Questions & Risks

| # | Question | Risk | Mitigation |
|---|----------|------|------------|
| 1 | Are hitbox definitions in PVF script chunks or hardcoded in the client binary? | High — if hardcoded, PVF extraction won't find them | Start with PVF extraction; if not found, treat as "not available" and use video calibration |
| 2 | Does the target version (70–85 classic, pre-Metastasis) use the same PVF/IMG format versions as later eras? | Medium — format versions may differ | Test with a 2012-era client sample first |
| 3 | Are ANI binary format details documented in non-English (Chinese/Korean/Vietnamese) private forums not indexed by GitHub? | Medium — information may exist but be hard to find | Include Chinese/Korean search terms in ongoing research; monitor `dnf.qq.com` community tools |
| 4 | Can legally-obtained DNF/DFO clients still be downloaded for the 70–85 era? | High — most official downloads are current-version only | Research archive.org; consider using current-version client with caveats about version mismatch |
| 5 | Do the tools listed above work on Windows? | Medium — some are Linux-only or have Windows build issues | Primary dev environment is Windows; test each tool before committing to pipeline |
| 6 | Is the ANI format the same between KDNF, CDNF, and DFOG? | Low — likely same format, different content | Not a blocker for format research |

---

## 8. References & Source Links

### 8.1 Official / Authoritative Sources
- **NDC 2014 Presentation** — "DNF Client Loading Speed Optimization" (NDC2014_0066): Describes file count (540K), ANI file purpose, 64KB block compression, preload strategies. Available at `ndcreplay.nexon.com`.
- **Neople Open API** — Skill data for cross-reference validation.
- **DFO EULA** — Legal restrictions on reverse engineering and asset use. Available at `dfoneople.com/policy/eula`.

### 8.2 Community Documentation
- **npk-api** (`hooyantsing/npk-api`) — Most comprehensive NPK/IMG/SPK format documentation. `doc/` directory covers V2/V4/V5/V6 IMG, NPK indexing, SPK block format.
- **similing4/pvf** (`similing4/pvf`) — PVF format documentation in `chunk.md`. Covers header structure, file tree, CP949 path encoding, stringtable/n_string, script types.
- **DFO World Wiki** (`wiki.dfo-world.com`) — Skill data cross-reference for PVF-extracted values.

### 8.3 Tools
- **DFOToolBox** (`LHCGreg/DFOToolBox`) — NPK browser, `npk2gif` CLI.
- **OjoDnfExtractor** (`HsOjo/OjoDnfExtractor`) — IMG V1–V6 extraction to PNG/JSON.
- **PvfPlayer** (`ariakeumi/PvfPlayer`) — Taiwan-server PVF unpack/pack.
- **PVFEditor** (`kahotv/PVFEditor`) — GUI search across PVF content.

### 8.4 Project-Internal References
- `docs/design/source-policy.md` — Source policy and truth hierarchy.
- `docs/research/art/deep-research-npk-img-art-pipeline-spec.md` — Prior NPK/IMG pipeline research with detailed format specs.
- `docs/research/art/deep-research-spk-npk-img-pvf-compatible-replication.md` — SPK/NPK/IMG/PVF compatible replication research.
- `docs/research/art/deep-research-art-system-dnf-1to1.md` — DNF art system 1:1 replication research with ANI limitations documented.

---

## Appendix A: CRT Ticket Impact

| CRT Ticket | Affected? | How PVF/ANI/NPK Data Helps |
|------------|-----------|----------------------------|
| CRT-002 (Frame data calibration) | Yes — primary target | ANI + IMG frame counts provide ground truth for startup/active/recovery windows |
| CRT-003 (Hitbox geometry) | Yes — secondary target | If hitbox defs are in PVF, extraction is possible; otherwise video calibration |
| CRT-004 (AI behavior params) | Yes — secondary target | PVF monster stat tables + AI constants (if in script format) |
| CRT-005 (Armor/defense formula) | Partial | PVF equipment tables + defense formula constants |
| CRT-006 (Replay fidelity) | Indirect | More accurate frame data improves replay determinism |

## Appendix B: Recommended Next Steps (If Approved)

1. **Immediately**: Set up `OjoDnfExtractor` or `npk-api` in a sandboxed environment. Test extraction of a single NPK file (e.g., `sprite_character_slayer_effect.NPK`).
2. **Short-term**: Extract frame metadata for all 38 existing actions. Compare against current `actions/default.json` values.
3. **Short-term**: Set up `similing4/pvf` and attempt to read `equipment/equipment.lst` to verify toolchain works.
4. **Medium-term**: Map PVF-extracted skill parameters to our manifest schema fields.
5. **Defer**: Full ANI binary format reverse-engineering — allocate research budget for Chinese/Korean community forum monitoring, but proceed with video-based calibration in the interim.