// EnumTables.h — Hardcoded DNF enum tables for M2 (Enum name resolution).
//
// Source: sqr/dnf_enum_header.nut (extracted from Script.pvf, 2018 CN client).
// All 6 enum families from Stage 1 Mid spec §1.2:
//   ATTACKTYPE, CUSTOM_ATTACKINFO, ELEMENT, DAMAGEACT, KNOCK_BACK_TYPE, DOWN_PARAM_TYPE
//
// Field→enum mapping (FIELD_TO_ENUM): maps PVF section names to enum family names.
// When a section has int attributes and its name is in FIELD_TO_ENUM, each int
// attribute is resolved against the corresponding enum table. Unknown values
// fall back to plain {t:"int"} — no crash, no fake name.
//
// Provenance: Tier-1 (dnf-extract / dnf_enum_header.nut extraction, 2026-05-22).

#pragma once
#include <string>
#include <unordered_map>

namespace DnfEnums {

// ── ATTACKTYPE ────────────────────────────────────────────────────────────────
// ATTACKTYPE_PHYSICAL=0, ATTACKTYPE_MAGICAL=1, ATTACKTYPE_ABSOLUTE=2,
// ATTACKTYPE_LIGHT=3, ATTACKTYPE_DARK=4, ATTACKTYPE_WATER=5, ATTACKTYPE_FIRE=6
// Note: the nut file has two blocks; the second (lines 1216-1223) is canonical
// (has LIGHT/DARK/WATER/FIRE variants), superseding the earlier 3-value block.
static const std::unordered_map<int, std::string> ATTACKTYPE = {
    {0, "physical"},
    {1, "magical"},
    {2, "absolute"},
    {3, "light"},
    {4, "dark"},
    {5, "water"},
    {6, "fire"},
};

// ── ELEMENT (ENUM_ELEMENT_*) ──────────────────────────────────────────────────
// ENUM_ELEMENT_FIRE=0, WATER=1, DARK=2, LIGHT=3, NONE=4
static const std::unordered_map<int, std::string> ELEMENT = {
    {0, "fire"},
    {1, "water"},
    {2, "dark"},
    {3, "light"},
    {4, "none"},
};

// ── DAMAGEACT ─────────────────────────────────────────────────────────────────
// DAMAGEACT_NONE=0, DAMAGEACT_DAMAGE=1, DAMAGEACT_DOWN=2,
// DAMAGEACT_DAMAGE_EXCEPT_HUMAN=3
static const std::unordered_map<int, std::string> DAMAGEACT = {
    {0, "none"},
    {1, "damage"},
    {2, "down"},
    {3, "damage_except_human"},
};

// ── KNOCK_BACK_TYPE ───────────────────────────────────────────────────────────
// KNOCK_BACK_TYPE_NORMAL=0, KNOCK_BACK=1, SHORT_KNOCK_BACK=2,
// PIXEL_WITHOUT_DAMAGE_TIME=3, NOT_BACK=-1
static const std::unordered_map<int, std::string> KNOCK_BACK_TYPE = {
    {-1, "not_back"},
    {0,  "normal"},
    {1,  "knock_back"},
    {2,  "short_knock_back"},
    {3,  "pixel_without_damage_time"},
};

// ── DOWN_PARAM_TYPE ───────────────────────────────────────────────────────────
// DOWN_PARAM_TYPE_VALUE=0, FORCE=1, BOUNCE_VALUE=2, BOUNCE_FORCE=3, BOUNCE=4
static const std::unordered_map<int, std::string> DOWN_PARAM_TYPE = {
    {0, "value"},
    {1, "force"},
    {2, "bounce_value"},
    {3, "bounce_force"},
    {4, "bounce"},
};

// ── CUSTOM_ATTACKINFO ─────────────────────────────────────────────────────────
// Values 0–83 from dnf_enum_header.nut (grappler fighter class, two blocks).
// Only a subset is listed here; unknown values fall back to int.
static const std::unordered_map<int, std::string> CUSTOM_ATTACKINFO = {
    {0,  "crash_low_kick"},
    {1,  "lift_upper"},
    {2,  "damage_low_kick"},
    {3,  "try_grab"},
    {4,  "suplex"},
    {5,  "mount"},
    {6,  "stomp"},
    {7,  "jump_suplex"},
    {8,  "jump_suplex_heading"},
    {9,  "jump_suplex_lariat"},
    {10, "close_punch"},
    {11, "shoulder_charge"},
    {12, "single_kick"},
    {13, "grab_explosion"},
    {14, "shoulder_tackle"},
    {15, "grab_cannon"},
    {16, "whirl_wind_kick"},
    {17, "junk_spin"},
    {18, "leg_suplex_kick"},
    {19, "lightning_dance"},
    {20, "strongest_low_kick"},
    {21, "crazy_mount"},
    {22, "throw_web"},
    {23, "hidden_sting"},
    {24, "dash_punch"},
    {25, "punch_after_return"},
    {26, "random_kick_1"},
    {27, "random_kick_2"},
    {28, "random_kick_3"},
    {29, "random_kick_finish"},
    {30, "dummy_4"},
    {31, "rising_upper"},
    {32, "dash_after_dash_combo1"},
    {33, "dash_after_dash_combo2"},
    {34, "venom_mine"},
    {35, "dummy_2"},
    {36, "hold_up_try"},
    {37, "hold_up_hit"},
    {38, "wild_cannon_spike_fall"},
    {39, "wild_cannon_spike_hit"},
    {40, "white_tiger_combo1"},
    {41, "white_tiger_combo2"},
    {42, "white_tiger_combo3"},
    {43, "white_tiger_combo4"},
    {44, "white_tiger_combo5"},
    {45, "white_tiger_dash_attack"},
    {46, "white_tiger_jump_attack"},
    {47, "suplex_cyclone_crash"},
    {48, "suplex_cyclone_finish"},
    {49, "leg_suplex_ex_spin"},
    {50, "dash_punch_ex"},
    {51, "block_buster_finish_ex"},
    {52, "rising_upper_start_ex"},
    {53, "rising_upper_ex"},
    {54, "rising_upper_finish_ex"},
    {55, "suplex_cyclone_ex"},
    {56, "suplex_cyclone_spin_ex"},
    {57, "stomp_finish"},
    {58, "ground_kick"},
    {59, "lightning_dragon"},
    {60, "crash_low_kick_second"},
    {61, "throw_enemy_upkick"},
    {62, "throw_enemy_sidekick"},
    {63, "throw_enemy_downkick"},
    {64, "try_grab_throw_enemy"},
    {65, "throw_web_double"},
    {66, "lightning_low_kick"},
    {67, "suplex_grabcannon"},
    {68, "nen_flower"},
    {69, "typhoon"},
    {70, "typhoon_last"},
    {71, "spiral_nen_shoot"},
    {72, "nen_spear"},
    {73, "charge_spear"},
    {74, "hurricane_spear"},
    {75, "crash_rope"},
    {76, "chain_kick1"},
    {77, "chain_kick2"},
    {78, "chain_kick3"},
    {79, "108_stairs_kick_ex"},
    {80, "108_stairs_punch_ex"},
    {81, "108_stairs_blow_1_ex"},
    {82, "108_stairs_blow_2_ex"},
    {83, "108_stairs_blow_3_ex"},
};

// ── Field → Enum family name mapping ─────────────────────────────────────────
// Maps PVF section names (lowercase) to an enum family name.
// Only sections where the int attribute value IS an enum value are listed here.
// The actual empty-flag sections (physic/magic/fire element etc.) are NOT mapped
// because they carry no int payload — they exist as presence-flags.
//
// Discovered from dnf_enum_header.nut and .atk/.mob/.chr inspection (2026-05-22).
// Additional mappings can be added as more files are inspected.
static const std::unordered_map<std::string, std::string> FIELD_TO_ENUM = {
    // .atk files — attack reaction / type fields
    {"attack type",        "ATTACKTYPE"},
    {"elemental property", "ELEMENT"},
    {"damage reaction",    "DAMAGEACT"},
    {"knock back type",    "KNOCK_BACK_TYPE"},
    {"down param type",    "DOWN_PARAM_TYPE"},
    // .chr / skill files — custom attackinfo index
    {"custom attack info", "CUSTOM_ATTACKINFO"},
};

// ── Lookup helper ─────────────────────────────────────────────────────────────
// Returns nullptr if `enumName` is not a known enum family or `value` has no entry.
// Caller emits plain {t:"int"} on nullptr (no crash, no fake name).
inline const std::string* lookupEnum(const std::string& enumName, int value) {
    if (enumName == "ATTACKTYPE") {
        auto it = ATTACKTYPE.find(value);
        return (it != ATTACKTYPE.end()) ? &it->second : nullptr;
    }
    if (enumName == "ELEMENT") {
        auto it = ELEMENT.find(value);
        return (it != ELEMENT.end()) ? &it->second : nullptr;
    }
    if (enumName == "DAMAGEACT") {
        auto it = DAMAGEACT.find(value);
        return (it != DAMAGEACT.end()) ? &it->second : nullptr;
    }
    if (enumName == "KNOCK_BACK_TYPE") {
        auto it = KNOCK_BACK_TYPE.find(value);
        return (it != KNOCK_BACK_TYPE.end()) ? &it->second : nullptr;
    }
    if (enumName == "DOWN_PARAM_TYPE") {
        auto it = DOWN_PARAM_TYPE.find(value);
        return (it != DOWN_PARAM_TYPE.end()) ? &it->second : nullptr;
    }
    if (enumName == "CUSTOM_ATTACKINFO") {
        auto it = CUSTOM_ATTACKINFO.find(value);
        return (it != CUSTOM_ATTACKINFO.end()) ? &it->second : nullptr;
    }
    return nullptr;
}

} // namespace DnfEnums
