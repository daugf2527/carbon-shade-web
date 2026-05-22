// main.cpp — DNF Full Extractor CLI
// Exposes ALL capabilities: PVF, NPK, IMG, Animation, Document, Text
//
// PVF modes:  --pvf <path> [--file|--pipe|--batch|--workflow|--list]
// NPK modes:  --npk <path> [--list|--img <name>|--frame <idx>]
// Resolve:    --pvf <path> --npk-dir <dir> --resolve <sprite-path> --frame <idx>

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <string>
#include <vector>
#include <unordered_map>
#include <iostream>
#include <chrono>
#include <filesystem>
#include "PvfReader.h"
#include "PvfAnimation.h"
#include "PvfDocument.h"
#include "PvfString.h"
#include "NpkFile.h"
#include "ImgFile.h"
#include "EnumTables.h"

// ── D3: Extractor identity ─────────────────────────────────────────────────
// Version string bumped to v2.0.0 to reflect the full Lite + Mid + Deep
// improvement set (Defect-1 typed JSON, L2 cancel, L3 CLI, M1 ref, M2 enum,
// D1 vec/mat, D3 provenance).
#define DNF_EXTRACT_VERSION "v2.0.0"

// D3: Source-PVF identity for provenance.
// We use CRC32 of the first 1 MB of the PVF file + file size (decimal), joined
// with a '|', prefixed with "crc32-head:". This avoids a 200 MB full SHA-256
// pass (which would add ~1s startup) while giving unique-enough provenance for
// pipeline audit: the PVF is an official release archive, so the 1 MB header
// is stable across identical distributions.  Full SHA-256 can be computed
// externally if needed; the hash value will simply differ from this field.
//
// Format: "crc32-head:<8hex>|size:<decimalBytes>"
// Example: "crc32-head:a1b2c3d4|size:205938672"
static uint32_t crc32_table[256];
static bool crc32_init_done = false;

static void crc32_init() {
    if (crc32_init_done) return;
    for (uint32_t i = 0; i < 256; i++) {
        uint32_t c = i;
        for (int j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320u ^ (c >> 1)) : (c >> 1);
        crc32_table[i] = c;
    }
    crc32_init_done = true;
}

static uint32_t crc32_bytes(const uint8_t* data, size_t len) {
    uint32_t crc = 0xFFFFFFFFu;
    for (size_t i = 0; i < len; i++) crc = crc32_table[(crc ^ data[i]) & 0xFF] ^ (crc >> 8);
    return crc ^ 0xFFFFFFFFu;
}

// Compute the provenance identity string for a PVF file at startup.
// Returns "" on I/O failure (the JSON field will be "null").
// Reads at most 1 MB from the start of the file; fast even for 200 MB archives.
static std::string computePvfProvenance(const std::string& pvfPath) {
    crc32_init();
    FILE* f = fopen(pvfPath.c_str(), "rb");
    if (!f) return "";
    // File size
    fseek(f, 0, SEEK_END);
    long fileSize = ftell(f);
    fseek(f, 0, SEEK_SET);
    // Read first 1 MB
    const size_t SAMPLE = 1024 * 1024;
    std::vector<uint8_t> buf(SAMPLE);
    size_t nread = fread(buf.data(), 1, SAMPLE, f);
    fclose(f);
    if (nread == 0) return "";
    uint32_t crc = crc32_bytes(buf.data(), nread);
    char result[64];
    snprintf(result, sizeof(result), "crc32-head:%08x|size:%ld", crc, fileSize);
    return std::string(result);
}

// ══════════════════════════════════════════════════════════════
// JSON helpers
// ══════════════════════════════════════════════════════════════

static std::string escapeJson(const std::string& s) {
    std::string out;
    out.reserve(s.size() + 10);
    for (char c : s) {
        switch (c) {
            case '"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if ((unsigned char)c < 0x20) {
                    char buf[8];
                    snprintf(buf, sizeof(buf), "\\u%04x", (unsigned char)c);
                    out += buf;
                } else {
                    out += c;
                }
        }
    }
    return out;
}

static std::string base64Encode(const uint8_t* data, size_t len) {
    static const char table[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::string out;
    out.reserve((len + 2) / 3 * 4);
    for (size_t i = 0; i < len; i += 3) {
        uint32_t n = ((uint32_t)data[i]) << 16;
        if (i + 1 < len) n |= ((uint32_t)data[i + 1]) << 8;
        if (i + 2 < len) n |= data[i + 2];
        out += table[(n >> 18) & 0x3F];
        out += table[(n >> 12) & 0x3F];
        out += (i + 1 < len) ? table[(n >> 6) & 0x3F] : '=';
        out += (i + 2 < len) ? table[n & 0x3F] : '=';
    }
    return out;
}

// ══════════════════════════════════════════════════════════════
// PVF output formatters
// ══════════════════════════════════════════════════════════════

static void printAnimationJson(const std::string& path, PvfAnimation& ani) {
    auto& frames = ani.getFrames();
    printf("{\"path\":\"%s\",\"type\":\"animation\",\"framesCount\":%d,\"loop\":%s,\"frames\":[",
        escapeJson(path).c_str(), (int)frames.size(), ani.isLoop() ? "true" : "false");
    for (size_t i = 0; i < frames.size(); i++) {
        auto& f = frames[i];
        if (i > 0) printf(",");
        printf("{\"i\":%zu,\"x\":%d,\"y\":%d,\"imgId\":%d,\"imgParam\":%d", i, f.x, f.y, f.imgId, f.imgParam);
        if (!f.path.empty()) printf(",\"sprite\":\"%s\"", escapeJson(f.path).c_str());
        if (f.delay != 0) printf(",\"delay\":%d", f.delay);
        if (!f.attackBox.empty()) {
            printf(",\"atk\":[");
            for (size_t j = 0; j < f.attackBox.size(); j++) {
                if (j > 0) printf(",");
                auto& b = f.attackBox[j];
                printf("[%d,%d,%d,%d,%d,%d]", b[0], b[1], b[2], b[3], b[4], b[5]);
            }
            printf("]");
        }
        if (!f.damageBox.empty()) {
            printf(",\"dmg\":[");
            for (size_t j = 0; j < f.damageBox.size(); j++) {
                if (j > 0) printf(",");
                auto& b = f.damageBox[j];
                printf("[%d,%d,%d,%d,%d,%d]", b[0], b[1], b[2], b[3], b[4], b[5]);
            }
            printf("]");
        }
        printf("}");
    }
    printf("]}\n");
}

// ── D1: helper to classify a single attribute's "simple type" string.
// Used by the vec/mat collapse emitter to determine item_type.
//
// Detection heuristic (Option A — data-driven, no hardcoded name lists):
//   Given a section name with N occurrences in `nodes`:
//   - If N >= 3 AND all nodes have the SAME non-zero attribute count M:
//       collapse into one section whose `attributes` array holds a single
//       vec (M=1) or mat (M>1) typed object.
//   - Otherwise: emit each node individually (existing behaviour).
//
// Threshold N >= 3 is chosen so isolated name collisions and pairs (which
// occur for 2-row config entries like `width` [1 section × 2 attrs] and
// `attack motion` [1 section × 3 attrs]) are never promoted.
//
// Edge cases preserved as individual sections:
//   - weapon wav: 6 rows but slot 4 has 0 attrs (heterogeneous) → no collapse
//   - skill: 6 rows with attr counts [16,16,12,10,14,20] → no collapse
//   - awakening skill: 10 rows with mixed 0/2 → no collapse
//
// vec output: {"name":"hp max","attributes":[{"t":"vec","length":17,"item_type":"float",
//              "items":[180.0,45.0,...]}]}
// mat output: {"name":"module damage rate","attributes":[{"t":"mat","rows":16,"cols":4,
//              "item_type":"float","items":[[0.95,1.0,1.0,0.95],...]}]}
//
// item_type is the most common primitive type across all leaf values ("float",
// "int", "str", or "mixed" when heterogeneous). For mixed types the leaf items
// keep their full {t,v} typed objects; for homogeneous types the items are
// unwrapped raw values.

// Helper: classify a single attribute's "simple type" string.
static const char* attrSimpleType(const PvfDocument::IAttribute* attr) {
    if (!attr) return "null";
    if (attr->type == PvfDocument::Number) {
        auto* na = static_cast<const PvfDocument::NumberAttribute*>(attr);
        return na->isFloat ? "float" : "int";
    } else {
        return "str";
    }
}

// Helper: print a single leaf value for vec/mat items (unwrapped if type is
// homogeneous, full {t,v} object if mixed). `homogeneous` is the shared type
// or "mixed".
static void printLeafValue(const PvfDocument::IAttribute* attr, const char* homogeneous) {
    if (!attr) { printf("null"); return; }
    bool useFull = (strcmp(homogeneous, "mixed") == 0);
    if (attr->type == PvfDocument::Number) {
        auto* na = static_cast<const PvfDocument::NumberAttribute*>(attr);
        if (na->isFloat) {
            char buf[64];
            snprintf(buf, sizeof(buf), "%g", na->value.floatValue);
            std::string s(buf);
            if (s.find('.') == std::string::npos &&
                s.find('e') == std::string::npos &&
                s.find('E') == std::string::npos &&
                s.find('n') == std::string::npos &&
                s.find('i') == std::string::npos) {
                s += ".0";
            }
            if (useFull) printf("{\"t\":\"float\",\"v\":%s}", s.c_str());
            else printf("%s", s.c_str());
        } else {
            if (useFull) printf("{\"t\":\"int\",\"v\":%d}", na->value.intValue);
            else printf("%d", na->value.intValue);
        }
    } else {
        auto* sa = static_cast<const PvfDocument::StringAttribute*>(attr);
        if (useFull) {
            const char* tag = sa->isLink ? "link" : "str";
            printf("{\"t\":\"%s\",\"v\":\"%s\"}", tag, escapeJson(sa->value).c_str());
        } else {
            printf("\"%s\"", escapeJson(sa->value).c_str());
        }
    }
}

// Emit a collapsed vec/mat section. `nodes` is the homogeneous run.
static void emitVecMatSection(const std::string& name,
                              const std::vector<PvfDocument::Node>& nodes) {
    size_t N = nodes.size();   // number of rows
    size_t M = nodes[0].attribute.size();  // columns per row (uniform, verified by caller)

    // Determine homogeneous item_type across all leaves.
    const char* itemType = nullptr;
    bool mixed = false;
    for (auto& nd : nodes) {
        for (auto& a : nd.attribute) {
            const char* t = attrSimpleType(a.get());
            if (!itemType) { itemType = t; }
            else if (strcmp(itemType, t) != 0) { mixed = true; break; }
        }
        if (mixed) break;
    }
    const char* typeStr = mixed ? "mixed" : (itemType ? itemType : "null");

    printf("{\"name\":\"%s\",\"attributes\":[", escapeJson(name).c_str());
    if (M == 1) {
        // Vector: {"t":"vec","length":N,"item_type":"float","items":[...]}
        printf("{\"t\":\"vec\",\"length\":%zu,\"item_type\":\"%s\",\"items\":[", N, typeStr);
        for (size_t i = 0; i < N; i++) {
            if (i > 0) printf(",");
            printLeafValue(nodes[i].attribute[0].get(), typeStr);
        }
        printf("]}");
    } else {
        // Matrix: {"t":"mat","rows":N,"cols":M,"item_type":"float","items":[[...],...]}
        printf("{\"t\":\"mat\",\"rows\":%zu,\"cols\":%zu,\"item_type\":\"%s\",\"items\":[",
               N, M, typeStr);
        for (size_t i = 0; i < N; i++) {
            if (i > 0) printf(",");
            printf("[");
            for (size_t j = 0; j < M; j++) {
                if (j > 0) printf(",");
                printLeafValue(nodes[i].attribute[j].get(), typeStr);
            }
            printf("]");
        }
        printf("]}");
    }
    printf("]}");
}

static void printDocumentJson(const std::string& path, PvfDocument& doc,
                              PvfReader* pvfReader = nullptr,
                              const std::string& extractorVersion = DNF_EXTRACT_VERSION,
                              const std::string& extractTimestamp = "",
                              const std::string& sourcePvfHash = "") {
    auto& root = doc.getRoot();
    // ── D3: provenance fields at top-level ───────────────────────────────────
    printf("{\"extractor_version\":\"%s\"", escapeJson(extractorVersion).c_str());
    if (!extractTimestamp.empty())
        printf(",\"extract_timestamp\":\"%s\"", escapeJson(extractTimestamp).c_str());
    if (!sourcePvfHash.empty())
        printf(",\"source_pvf_hash\":\"%s\"", escapeJson(sourcePvfHash).c_str());
    else
        printf(",\"source_pvf_hash\":null");
    printf(",\"path\":\"%s\",\"type\":\"document\",\"sections\":[", escapeJson(path).c_str());

    // ── M1: path resolution helpers ──────────────────────────────────────────
    // Derive parent directory of the source file (for relative ref resolution).
    // e.g. "monster/goblin/goblin.mob" → "monster/goblin/"
    std::string sourceDir;
    {
        auto slash = path.find_last_of('/');
        if (slash != std::string::npos)
            sourceDir = path.substr(0, slash + 1);   // includes trailing '/'
    }

    // Set of extensions that qualify a string as a potential PVF reference.
    // Case-insensitive matching is applied at detection time.
    static const char* kRefExts[] = {
        ".atk", ".ani", ".skl", ".img", ".mob", ".chr",
        ".dgn", ".map", ".etc", nullptr
    };

    // Derive target_kind from extension (without dot). Returns "" if not a ref ext.
    auto refKindFromPath = [&](const std::string& s) -> std::string {
        // Find last dot
        auto dot = s.find_last_of('.');
        if (dot == std::string::npos) return "";
        std::string ext = s.substr(dot);  // includes dot
        PvfString::toLower(ext);
        for (int i = 0; kRefExts[i]; i++) {
            if (ext == kRefExts[i]) {
                return ext.substr(1);  // strip leading dot
            }
        }
        return "";
    };

    // Attempt to resolve a ref path: try relative (sourceDir+val) then absolute.
    // Returns the resolved path if it exists in the PVF, else "".
    // If pvfReader is null, we cannot verify existence — return extension-only match.
    auto resolveRef = [&](const std::string& val, const std::string& kind) -> std::string {
        if (kind.empty()) return "";
        if (!pvfReader) {
            // Extension match only (no PVF lookup available); return val as-is.
            // Caller must treat this as "extension-only ref" (lower confidence).
            return val;
        }
        // Try relative: sourceDir + val
        if (!sourceDir.empty()) {
            std::string candidate = sourceDir + val;
            PvfString::toLower(candidate);
            auto& tn = pvfReader->getRoot().getByPath(candidate);
            if (tn.isValid()) return candidate;
        }
        // Try absolute: val as-is (lowercased)
        {
            std::string candidate = val;
            PvfString::toLower(candidate);
            auto& tn = pvfReader->getRoot().getByPath(candidate);
            if (tn.isValid()) return candidate;
        }
        // Extension matched but path not found in PVF → not a ref, emit str.
        return "";
    };

    bool first = true;
    for (auto& [name, nodes] : root.children) {
        // ── M2: look up enum family for this section name ────────────────────
        std::string enumFamily;
        {
            auto it = DnfEnums::FIELD_TO_ENUM.find(name);
            if (it != DnfEnums::FIELD_TO_ENUM.end())
                enumFamily = it->second;
        }

        // ── D1: vec/mat collapse detection ──────────────────────────────────
        // Check if this section name has N >= 3 occurrences all with the same
        // non-zero attribute count M.  If so, collapse into a single vec/mat.
        // Sections with heterogeneous attr counts (skill, awakening skill,
        // weapon wav slot-4 empty row) do NOT satisfy the uniform-count check
        // and fall through to the normal per-row emission below.
        bool doCollapse = false;
        if (nodes.size() >= 3) {
            size_t M0 = nodes[0].attribute.size();
            if (M0 > 0) {
                doCollapse = true;
                for (auto& nd : nodes) {
                    if (nd.attribute.size() != M0) { doCollapse = false; break; }
                }
            }
        }

        if (doCollapse) {
            if (!first) printf(",");
            first = false;
            emitVecMatSection(name, nodes);
            continue;
        }

        // ── Normal per-node emission (unchanged from pre-D1) ────────────────
        for (auto& node : nodes) {
            if (!first) printf(",");
            first = false;
            printf("{\"name\":\"%s\"", escapeJson(name).c_str());
            // L2: emit aliases array if dual-semantics applied (cancel*.skl).
            if (!node.aliases.empty()) {
                printf(",\"aliases\":[");
                for (size_t a = 0; a < node.aliases.size(); a++) {
                    if (a > 0) printf(",");
                    printf("\"%s\"", escapeJson(node.aliases[a]).c_str());
                }
                printf("]");
            }
            printf(",\"attributes\":[");
            bool firstAttr = true;
            for (auto& attr : node.attribute) {
                if (!firstAttr) printf(",");
                firstAttr = false;
                if (!attr) {
                    printf("{\"t\":\"null\"}");
                    continue;
                }
                if (attr->type == PvfDocument::Number) {
                    auto* na = static_cast<PvfDocument::NumberAttribute*>(attr.get());
                    if (na->isFloat) {
                        char buf[64];
                        snprintf(buf, sizeof(buf), "%g", na->value.floatValue);
                        std::string s(buf);
                        if (s.find('.') == std::string::npos &&
                            s.find('e') == std::string::npos &&
                            s.find('E') == std::string::npos &&
                            s.find('n') == std::string::npos &&
                            s.find('i') == std::string::npos) {
                            s += ".0";
                        }
                        printf("{\"t\":\"float\",\"v\":%s}", s.c_str());
                    } else {
                        // ── M2: emit as enum if section name maps to an enum family ──
                        if (!enumFamily.empty()) {
                            int ival = na->value.intValue;
                            const std::string* ename =
                                DnfEnums::lookupEnum(enumFamily, ival);
                            if (ename) {
                                printf("{\"t\":\"enum\",\"v\":%d,\"name\":\"%s\",\"enum\":\"%s\"}",
                                    ival, escapeJson(*ename).c_str(),
                                    escapeJson(enumFamily).c_str());
                                continue;
                            }
                        }
                        // Fallback: plain int (unknown enum value or not enum-mapped)
                        printf("{\"t\":\"int\",\"v\":%d}", na->value.intValue);
                    }
                } else {
                    auto* sa = static_cast<PvfDocument::StringAttribute*>(attr.get());
                    // ── M1: check if string is a PVF file reference ──────────
                    // Only non-link strings are candidates (link values are
                    // already symbolic string-table refs, not PVF path refs).
                    if (!sa->isLink) {
                        std::string kind = refKindFromPath(sa->value);
                        if (!kind.empty()) {
                            std::string resolved = resolveRef(sa->value, kind);
                            if (!resolved.empty()) {
                                // Confirmed or extension-match ref
                                printf("{\"t\":\"ref\",\"target_kind\":\"%s\","
                                       "\"target_path\":\"%s\","
                                       "\"raw\":\"%s\"}",
                                    escapeJson(kind).c_str(),
                                    escapeJson(resolved).c_str(),
                                    escapeJson(sa->value).c_str());
                                continue;
                            }
                            // Extension matched but path NOT in PVF — emit str
                            // with a comment field so consumers can see the near-miss.
                            printf("{\"t\":\"str\",\"v\":\"%s\","
                                   "\"_note\":\"ref_ext_but_path_not_found\"}",
                                escapeJson(sa->value).c_str());
                            continue;
                        }
                    }
                    // Normal string / link
                    const char* tag = sa->isLink ? "link" : "str";
                    printf("{\"t\":\"%s\",\"v\":\"%s\"}", tag, escapeJson(sa->value).c_str());
                }
            }
            printf("]}");
        }
    }
    printf("]}\n");
}

static void printTextJson(const std::string& path, PvfTextScript& text) {
    printf("{\"path\":\"%s\",\"type\":\"text\",\"content\":\"%s\"}\n",
        escapeJson(path).c_str(), escapeJson(text.getContent()).c_str());
}

static void printBinaryJson(const std::string& path, PvfRawScript& raw, bool withData) {
    const uint8_t* buf = raw.getBuffer();
    int32_t len = raw.getLength();
    // Always emit first 32 bytes as hex for quick inspection regardless of withData.
    std::string headHex;
    int headLen = len < 32 ? len : 32;
    static const char hexd[] = "0123456789abcdef";
    headHex.reserve(headLen * 2);
    for (int i = 0; i < headLen; ++i) {
        headHex.push_back(hexd[(buf[i] >> 4) & 0x0F]);
        headHex.push_back(hexd[buf[i] & 0x0F]);
    }
    printf("{\"path\":\"%s\",\"type\":\"binary\",\"format\":\"%s\",\"sizeBytes\":%d,\"headHex\":\"%s\"",
        escapeJson(path).c_str(),
        escapeJson(raw.getFormatHint()).c_str(),
        len,
        headHex.c_str());
    if (withData && buf && len > 0) {
        std::string b64 = base64Encode(buf, (size_t)len);
        printf(",\"contentBase64\":\"%s\"", b64.c_str());
    }
    printf("}\n");
}

static void printErrorJson(const std::string& path, const std::string& error) {
    printf("{\"path\":\"%s\",\"type\":\"error\",\"error\":\"%s\"}\n",
        escapeJson(path).c_str(), escapeJson(error).c_str());
}

// ══════════════════════════════════════════════════════════════
// NPK/IMG output formatters
// ══════════════════════════════════════════════════════════════

// Prints the fields of a single IMG frame as comma-separated JSON KV pairs,
// without an enclosing { } pair and without a leading comma. Callers either
// emit braces themselves (when treating it as a standalone object) or inline
// the fields into an outer object.
static void printImgFrameFields(ImgNode& node, int index, bool includeData) {
    printf("\"index\":%d", index);
    printf(",\"isLink\":%s", node.isLink ? "true" : "false");
    if (node.isLink) {
        printf(",\"linkId\":%d", node.linkId);
    } else {
        printf(",\"width\":%d,\"height\":%d", node.texture.width, node.texture.height);
        printf(",\"x\":%d,\"y\":%d", node.texture.x, node.texture.y);
        printf(",\"maxWidth\":%d,\"maxHeight\":%d", node.texture.maxWidth, node.texture.maxWeight);
        printf(",\"size\":%d", node.texture.size);
        printf(",\"format\":%d", node.format);
        const char* fmtName = "unknown";
        switch (node.format) {
            case 14: fmtName = "ARGB_1555"; break;
            case 15: fmtName = "ARGB_4444"; break;
            case 16: fmtName = "ARGB_8888"; break;
            case 18: fmtName = "DXT_1"; break;
            case 19: fmtName = "DXT_3"; break;
            case 20: fmtName = "DXT_5"; break;
        }
        printf(",\"formatName\":\"%s\"", fmtName);
        printf(",\"compress\":%d", node.texture.extra);

        if (includeData) {
            auto& data = node.getData();
            if (!data.empty()) {
                printf(",\"dataBase64\":\"%s\"", base64Encode(data.data(), data.size()).c_str());
            }
        }
    }
}

// ══════════════════════════════════════════════════════════════
// L3: manifest, filter-ext, progress (shared helpers)
// ══════════════════════════════════════════════════════════════

// One extracted-file record carried through extraction and dumped to the
// manifest JSON when --manifest <path> is set. crc32 comes from PvfNode
// (already decrypted at PVF tree load — zero re-read cost).
struct ManifestEntry {
    std::string pvfPath;
    uint32_t crc32 = 0;
    int32_t size = 0;
    std::string extension;
};

// Parse comma-separated list (e.g. "skl,mob,atk") into lowercase set.
// No spaces tolerated — matches the CLI spec exactly.
static std::vector<std::string> parseFilterExts(const std::string& raw) {
    std::vector<std::string> out;
    if (raw.empty()) return out;
    std::string cur;
    for (char c : raw) {
        if (c == ',') {
            if (!cur.empty()) {
                PvfString::toLower(cur);
                out.push_back(cur);
            }
            cur.clear();
        } else {
            cur += c;
        }
    }
    if (!cur.empty()) {
        PvfString::toLower(cur);
        out.push_back(cur);
    }
    return out;
}

// Extract trailing extension (no dot). Returns lowercase. Empty if none.
// Handles `.bak` composite suffix the same way PvfNode::unpack does, so
// `attack1.atk.bak` → `atk` (the effective format).
static std::string extensionOf(const std::string& path) {
    std::string p = path;
    if (PvfString::endWith(p, ".bak")) {
        p = p.substr(0, p.size() - 4);
    }
    auto dot = p.find_last_of('.');
    if (dot == std::string::npos) return "";
    std::string ext = p.substr(dot + 1);
    PvfString::toLower(ext);
    return ext;
}

static bool matchesFilterExt(const std::string& path,
                             const std::vector<std::string>& exts) {
    if (exts.empty()) return true;
    std::string ext = extensionOf(path);
    if (ext.empty()) return false;
    for (auto& e : exts) {
        if (ext == e) return true;
    }
    return false;
}

// Emit a [PROGRESS] line on stderr. `total < 0` → emit JSON null (stream mode).
// Coexists with the text [LOG]/[READY]/[DONE]/[ERROR] markers — consumers can
// either filter for the [PROGRESS] prefix or parse the JSON tail directly.
static void emitProgress(int current, int total, const std::string& file) {
    if (total < 0) {
        fprintf(stderr, "[PROGRESS] {\"current\":%d,\"total\":null,\"file\":\"%s\"}\n",
            current, escapeJson(file).c_str());
    } else {
        fprintf(stderr, "[PROGRESS] {\"current\":%d,\"total\":%d,\"file\":\"%s\"}\n",
            current, total, escapeJson(file).c_str());
    }
    fflush(stderr);
}

static std::string isoTimestampUtc() {
    auto now = std::chrono::system_clock::now();
    std::time_t t = std::chrono::system_clock::to_time_t(now);
    std::tm tm_utc{};
#if defined(_WIN32)
    gmtime_s(&tm_utc, &t);
#else
    gmtime_r(&t, &tm_utc);
#endif
    char buf[32];
    std::strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &tm_utc);
    return std::string(buf);
}

// Write the L3 manifest JSON. crc32 is hex-encoded 8 chars (matches the
// per-file CRC stored in the PVF directory tree). pvf_hash is left as a
// best-effort marker — we surface the PVF's directory-tree checksum (already
// loaded; cheap) rather than a full sha256 of the multi-GB Script.pvf which
// would dwarf the extraction cost. If consumers need a true content hash,
// they can compute it externally and rewrite the field.
static void writeManifest(const std::string& outPath,
                          const std::string& pvfPath,
                          const std::string& pvfHash,
                          const std::vector<ManifestEntry>& entries) {
    FILE* f = fopen(outPath.c_str(), "wb");
    if (!f) {
        fprintf(stderr, "[ERROR] Failed to open manifest output: %s\n", outPath.c_str());
        return;
    }
    fprintf(f, "{\"version\":\"1\",\"pvf_path\":\"%s\",\"pvf_hash\":\"%s\",\"extracted_at\":\"%s\",\"files\":[",
        escapeJson(pvfPath).c_str(),
        escapeJson(pvfHash).c_str(),
        isoTimestampUtc().c_str());
    for (size_t i = 0; i < entries.size(); i++) {
        if (i > 0) fputc(',', f);
        fprintf(f,
            "{\"pvf_path\":\"%s\",\"crc32\":\"%08x\",\"size\":%d,\"extension\":\"%s\"}",
            escapeJson(entries[i].pvfPath).c_str(),
            entries[i].crc32,
            entries[i].size,
            escapeJson(entries[i].extension).c_str());
    }
    fprintf(f, "]}\n");
    fclose(f);
    fprintf(stderr, "[LOG] Wrote manifest: %s (%zu files)\n", outPath.c_str(), entries.size());
}

// Read a manifest written by writeManifest() into a path → crc32 lookup.
// Parses only the fields we need (crc32 by pvf_path) using minimal hand-rolled
// JSON scanning — keeps the tool zero-dep. Returns empty on parse error.
//
// Important: the manifest header itself has a top-level "pvf_path" pointing
// at Script.pvf — that's NOT a file record. We seek past `"files":[` before
// scanning so the header is ignored.
static std::unordered_map<std::string, uint32_t>
loadManifestCrcMap(const std::string& path) {
    std::unordered_map<std::string, uint32_t> out;
    FILE* f = fopen(path.c_str(), "rb");
    if (!f) return out;
    fseek(f, 0, SEEK_END);
    long sz = ftell(f);
    fseek(f, 0, SEEK_SET);
    std::string buf(sz, '\0');
    fread(buf.data(), 1, sz, f);
    fclose(f);

    // Skip past the header — anchor on the start of the files array.
    auto filesAnchor = buf.find("\"files\"");
    if (filesAnchor == std::string::npos) return out;
    auto arrStart = buf.find('[', filesAnchor);
    if (arrStart == std::string::npos) return out;

    // Scan for {"pvf_path":"...","crc32":"...". File order is stable; we don't
    // bother with full JSON parsing.
    size_t pos = arrStart;
    while (true) {
        auto p = buf.find("\"pvf_path\"", pos);
        if (p == std::string::npos) break;
        auto colon = buf.find(':', p);
        if (colon == std::string::npos) break;
        auto vq1 = buf.find('"', colon);
        if (vq1 == std::string::npos) break;
        auto vq2 = buf.find('"', vq1 + 1);
        if (vq2 == std::string::npos) break;
        std::string pvfPath = buf.substr(vq1 + 1, vq2 - vq1 - 1);

        // Find crc32 in the same record.
        auto crcKey = buf.find("\"crc32\"", vq2);
        if (crcKey == std::string::npos) break;
        auto crcColon = buf.find(':', crcKey);
        auto crcQ1 = buf.find('"', crcColon);
        auto crcQ2 = buf.find('"', crcQ1 + 1);
        if (crcQ1 == std::string::npos || crcQ2 == std::string::npos) break;
        std::string crcStr = buf.substr(crcQ1 + 1, crcQ2 - crcQ1 - 1);
        uint32_t crc = (uint32_t)std::strtoul(crcStr.c_str(), nullptr, 16);
        out[pvfPath] = crc;
        pos = crcQ2 + 1;
    }
    return out;
}

// Resolve a PVF path → PvfNode so we can read its CRC for the manifest. The
// reader stores tree-shaped lookups, so we walk the segments manually.
static PvfNode* findNode(PvfReader& reader, const std::string& rawPath) {
    std::string path = rawPath;
    PvfString::toLower(path);
    while (!path.empty() && (path.back() == '\r' || path.back() == '\n' || path.back() == ' '))
        path.pop_back();
    while (!path.empty() && path.front() == ' ')
        path.erase(path.begin());
    if (path.empty()) return nullptr;
    auto& tnode = reader.getRoot().getByPath(path);
    if (!tnode.isValid()) return nullptr;
    return tnode.node;
}

// --only-changed predicate. Returns true if rawPath's current CRC matches
// what's recorded in prevCrcMap (= unchanged, can skip). The path is
// normalised the same way extractFile() / findNode() do so the lookup is
// case-insensitive.
static bool shouldSkipUnchanged(PvfReader& reader,
                                const std::string& rawPath,
                                const std::unordered_map<std::string, uint32_t>& prevCrcMap) {
    if (prevCrcMap.empty()) return false;
    std::string key = rawPath;
    PvfString::toLower(key);
    while (!key.empty() && (key.back() == '\r' || key.back() == '\n' || key.back() == ' '))
        key.pop_back();
    while (!key.empty() && key.front() == ' ')
        key.erase(key.begin());
    auto it = prevCrcMap.find(key);
    if (it == prevCrcMap.end()) return false;  // new file → extract
    PvfNode* n = findNode(reader, key);
    if (!n) return false;                       // can't compare → extract
    return n->getCrc32() == it->second;
}

// ══════════════════════════════════════════════════════════════
// PVF extraction core
// ══════════════════════════════════════════════════════════════

static void extractFile(PvfReader& reader, const std::string& rawPath,
                        bool withData = false,
                        std::vector<ManifestEntry>* manifest = nullptr,
                        const std::string& sourcePvfHash = "") {
    std::string path = rawPath;
    PvfString::toLower(path);
    while (!path.empty() && (path.back() == '\r' || path.back() == '\n' || path.back() == ' '))
        path.pop_back();
    while (!path.empty() && path.front() == ' ')
        path.erase(path.begin());
    if (path.empty()) return;

    auto& node = reader.getRoot().getByPath(path);
    if (!node.isValid()) {
        printErrorJson(rawPath, "not_found");
        return;
    }

    auto script = node.unpack();
    if (!script) {
        printErrorJson(rawPath, "unpack_failed");
        return;
    }

    if (script->getType() == PvfScriptType::Animation) {
        printAnimationJson(rawPath, *static_cast<PvfAnimation*>(script.get()));
    } else if (script->getType() == PvfScriptType::Document) {
        // ── D3: emit timestamp at extraction time (per-file, so concurrent
        // extractions have accurate timestamps even in batch/pipe mode).
        std::string ts = isoTimestampUtc();
        printDocumentJson(rawPath, *static_cast<PvfDocument*>(script.get()), &reader,
                          DNF_EXTRACT_VERSION, ts, sourcePvfHash);
    } else if (script->getType() == PvfScriptType::Text) {
        printTextJson(rawPath, *static_cast<PvfTextScript*>(script.get()));
    } else if (script->getType() == PvfScriptType::Binary) {
        printBinaryJson(rawPath, *static_cast<PvfRawScript*>(script.get()), withData);
    }

    // L3 manifest record. We use the PvfNode that the tree resolved to; its
    // CRC32 / fileLength were decrypted during PvfReader::unpack so there's
    // no extra I/O here.
    if (manifest && node.node) {
        ManifestEntry e;
        e.pvfPath = path;
        e.crc32 = node.node->getCrc32();
        e.size = node.node->getFileLength();
        e.extension = extensionOf(path);
        manifest->push_back(std::move(e));
    }
}

// ══════════════════════════════════════════════════════════════
// Usage
// ══════════════════════════════════════════════════════════════

static void printUsage() {
    fprintf(stderr, R"(dnf-extract — DNF Full Extractor (PVF + NPK + IMG)

PVF MODES:
  --pvf <path> --file <internal-path>       Single file extraction
  --pvf <path> --pipe                       Fast mode (stdin paths → stdout JSON)
  --pvf <path> --batch <p1> [p2] ...        Batch extraction
  --pvf <path> --workflow                   Workflow node (stdin JSON commands)
  --pvf <path> --list [--filter <pattern>]  List PVF contents

NPK MODES:
  --npk <path> --list                       List IMG files in NPK
  --npk <path> --img <name> --list          List frames in an IMG
  --npk <path> --img <name> --frame <idx>   Extract single frame (metadata + data)
  --npk <path> --img <name> --frames        All frames metadata (no pixel data)

SPRITE RESOLVE:
  --pvf <path> --npk-dir <dir> --resolve <sprite-path> --frame <idx>
    Resolve PVF sprite reference to NPK frame, extract pixel data.

OPTIONS:
  --with-data            Include base64 pixel data in frame output (default: metadata only)
  --filter <pattern>     Substring match for --list / --pipe (composes with --filter-ext)
  --filter-ext <e1,e2,…> Comma-separated extension whitelist for --list / --pipe
                         (case-insensitive, no spaces, e.g. skl,mob,atk)
  --manifest <path>      Write a JSON manifest of extracted files to <path>
                         (schema: version / pvf_path / pvf_hash / extracted_at / files[])
  --only-changed         Read --manifest as INPUT; extract only files whose CRC32
                         differs or are new. Pair with --manifest-out <path> to
                         also write a refreshed manifest.
  --manifest-out <path>  Output manifest path (only meaningful with --only-changed)
  --help                 Show this help

STRUCTURED PROGRESS:
  All file-iterating modes (--pipe / --batch / --file) emit per-file
  [PROGRESS] {"current":N,"total":M,"file":"…"} JSON lines on stderr.
  --pipe mode emits "total":null (count unknown until stdin EOF).

PIPE MODE PROTOCOL:
  After PVF loads (~4s), read file paths from stdin (one per line).
  Output: one JSON line + "---" separator per file.
  Send "quit" to exit. Memory freed on exit.

WORKFLOW MODE PROTOCOL:
  {"cmd":"extract","path":"skill/swordman/hardattack.skl"}
  {"cmd":"npk-list","npk":"path/to/file.NPK"}
  {"cmd":"npk-frame","npk":"path/to/file.NPK","img":"name","frame":0}
  {"cmd":"resolve","sprite":"character/swordman/...img","frame":0,"npkDir":"ImagePacks2"}
  {"cmd":"status"}
  {"cmd":"quit"}

OUTPUT TYPES:
  .ani  → {"type":"animation","framesCount":N,"frames":[{i,x,y,delay,atk,dmg,sprite}]}
  .skl  → {"type":"document","sections":[{"name":"...","attributes":[...]}]}
  .str  → {"type":"text","content":"..."}
  .mob  → {"type":"document",...}  (same as .skl)
  .atk  → {"type":"document",...}
  .act  → {"type":"document",...}
  npk   → {"type":"npk","imgCount":N,"images":[{"name":"...","offset":N,"size":N}]}
  frame → {"type":"frame","index":N,"width":W,"height":H,"format":F,"dataBase64":"..."}
  error → {"type":"error","error":"..."}
)");
}

// ══════════════════════════════════════════════════════════════
// Main
// ══════════════════════════════════════════════════════════════

int main(int argc, char* argv[]) {
    std::string pvfPath, npkPath, filePath, imgName, filter, npkDir, spritePath;
    std::vector<std::string> batchFiles;
    bool pipeMode = false, workflowMode = false, listMode = false, withData = false;
    int frameIdx = -1;
    bool framesMode = false;

    // L3 flags (parsed here; effects wired into mode handlers below).
    std::string filterExtRaw;      // raw arg, e.g. "skl,mob,atk"
    std::string manifestPath;      // --manifest <path> (input when --only-changed; output otherwise)
    std::string manifestOutPath;   // --manifest-out <path> (refreshed manifest when --only-changed)
    bool onlyChanged = false;

    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--pvf") == 0 && i + 1 < argc) pvfPath = argv[++i];
        else if (strcmp(argv[i], "--npk") == 0 && i + 1 < argc) npkPath = argv[++i];
        else if (strcmp(argv[i], "--file") == 0 && i + 1 < argc) filePath = argv[++i];
        else if (strcmp(argv[i], "--img") == 0 && i + 1 < argc) imgName = argv[++i];
        else if (strcmp(argv[i], "--frame") == 0 && i + 1 < argc) frameIdx = atoi(argv[++i]);
        else if (strcmp(argv[i], "--frames") == 0) framesMode = true;
        else if (strcmp(argv[i], "--filter") == 0 && i + 1 < argc) filter = argv[++i];
        else if (strcmp(argv[i], "--filter-ext") == 0 && i + 1 < argc) filterExtRaw = argv[++i];
        else if (strcmp(argv[i], "--manifest") == 0 && i + 1 < argc) manifestPath = argv[++i];
        else if (strcmp(argv[i], "--manifest-out") == 0 && i + 1 < argc) manifestOutPath = argv[++i];
        else if (strcmp(argv[i], "--only-changed") == 0) onlyChanged = true;
        else if (strcmp(argv[i], "--npk-dir") == 0 && i + 1 < argc) npkDir = argv[++i];
        else if (strcmp(argv[i], "--resolve") == 0 && i + 1 < argc) spritePath = argv[++i];
        else if (strcmp(argv[i], "--pipe") == 0) pipeMode = true;
        else if (strcmp(argv[i], "--workflow") == 0) workflowMode = true;
        else if (strcmp(argv[i], "--list") == 0) listMode = true;
        else if (strcmp(argv[i], "--with-data") == 0) withData = true;
        else if (strcmp(argv[i], "--batch") == 0) {
            for (int j = i + 1; j < argc; j++) {
                if (argv[j][0] == '-') break;
                batchFiles.push_back(argv[j]);
                i = j;
            }
        }
        else if (strcmp(argv[i], "--help") == 0 || strcmp(argv[i], "-h") == 0) {
            printUsage(); return 0;
        }
    }

    // Pre-parse filter-ext into a lowercase whitelist (empty = no filtering).
    std::vector<std::string> filterExts = parseFilterExts(filterExtRaw);

    // If --only-changed is set, the manifest path is INPUT. Load it now (we
    // can do this before PVF load — failure is non-fatal, we just treat all
    // files as new). Otherwise --manifest is the OUTPUT path.
    std::unordered_map<std::string, uint32_t> prevCrcMap;
    if (onlyChanged && !manifestPath.empty()) {
        prevCrcMap = loadManifestCrcMap(manifestPath);
        fprintf(stderr, "[LOG] --only-changed: loaded %zu entries from %s\n",
            prevCrcMap.size(), manifestPath.c_str());
    }

    // ══════════════════════════════════════════════════════════
    // NPK mode (no PVF needed)
    // ══════════════════════════════════════════════════════════
    if (!npkPath.empty() && pvfPath.empty()) {
        fprintf(stderr, "[LOG] Loading NPK: %s\n", npkPath.c_str());
        NpkFile npk(npkPath);
        npk.unpack();
        if (!npk.isUnpacked()) {
            printErrorJson(npkPath, "failed to open or empty NPK");
            return 1;
        }
        fprintf(stderr, "[READY] NPK loaded.\n");

        if (listMode && imgName.empty()) {
            // List all IMG files in NPK
            printf("{\"type\":\"npk\",\"path\":\"%s\",\"images\":[", escapeJson(npkPath).c_str());
            // NPK stores ImgFile nodes internally - iterate them
            // Note: NpkFile doesn't expose imgNodes directly, use GlobalTable
            bool first = true;
            for (auto& [name, img] : NpkFile::GlobalTable) {
                if (!first) printf(",");
                first = false;
                printf("{\"name\":\"%s\"}", escapeJson(name).c_str());
            }
            printf("]}\n");
            return 0;
        }

        if (!imgName.empty()) {
            auto it = NpkFile::GlobalTable.find(imgName);
            if (it == NpkFile::GlobalTable.end()) {
                // Try lowercase
                std::string lower = imgName;
                PvfString::toLower(lower);
                it = NpkFile::GlobalTable.find(lower);
            }
            if (it == NpkFile::GlobalTable.end()) {
                printErrorJson(imgName, "img_not_found");
                return 1;
            }
            auto* img = it->second;

            if (listMode || framesMode) {
                int n = (int)img->getNodeCount();
                printf("{\"type\":\"img\",\"name\":\"%s\",\"frameCount\":%d,\"frames\":[",
                    escapeJson(imgName).c_str(), n);
                for (int i = 0; i < n; i++) {
                    if (i > 0) printf(",");
                    printf("{");
                    // Always emit metadata only here; --frame <idx> --with-data is the
                    // path for pixel buffers, since each base64 payload can be tens of KB.
                    printImgFrameFields((*img)[i], i, false);
                    printf("}");
                }
                printf("]}\n");
                fprintf(stderr, "[DONE] Listed %d frame(s) in %s.\n", n, imgName.c_str());
                return 0;
            }

            if (frameIdx >= 0) {
                auto& node = (*img)[frameIdx];
                printf("{\"type\":\"frame\",\"img\":\"%s\",", escapeJson(imgName).c_str());
                printImgFrameFields(node, frameIdx, withData);
                printf("}\n");
                return 0;
            }
        }

        printUsage();
        return 1;
    }

    // ══════════════════════════════════════════════════════════
    // PVF mode
    // ══════════════════════════════════════════════════════════
    if (pvfPath.empty()) {
        printUsage();
        return 1;
    }

    auto t0 = std::chrono::steady_clock::now();
    fprintf(stderr, "[LOG] Loading PVF: %s\n", pvfPath.c_str());
    PvfReader* reader = new PvfReader(pvfPath);
    reader->unpack();

    if (!reader->isLoaded()) {
        fprintf(stderr, "[ERROR] Failed to load PVF\n");
        delete reader;
        return 1;
    }

    auto t1 = std::chrono::steady_clock::now();
    auto loadMs = std::chrono::duration_cast<std::chrono::milliseconds>(t1 - t0).count();
    fprintf(stderr, "[READY] PVF loaded in %lldms.\n", (long long)loadMs);

    // ── D3: compute PVF provenance hash once after load ──────────────────────
    // Uses CRC32 of first 1 MB + file size (see computePvfProvenance docs).
    // Logged on stderr so pipeline consumers can verify without parsing JSON.
    std::string sourcePvfHash = computePvfProvenance(pvfPath);
    if (!sourcePvfHash.empty())
        fprintf(stderr, "[LOG] PVF provenance: %s\n", sourcePvfHash.c_str());
    else
        fprintf(stderr, "[LOG] PVF provenance: unavailable (I/O error)\n");

    // ── Sprite resolve mode ──
    if (!spritePath.empty() && !npkDir.empty()) {
        fprintf(stderr, "[LOG] Resolving sprite: %s frame=%d\n", spritePath.c_str(), frameIdx);
        NpkFile::loadAll(npkDir);
        int useFrame = frameIdx >= 0 ? frameIdx : 0;
        try {
            auto& node = NpkFile::getNpkImgNode(spritePath, useFrame);
            printf("{\"type\":\"resolved_frame\",\"sprite\":\"%s\",\"frame\":%d,",
                escapeJson(spritePath).c_str(), useFrame);
            printImgFrameFields(node, useFrame, withData);
            printf("}\n");
            delete reader;
            return 0;
        } catch (const std::exception& e) {
            printf("{\"type\":\"error\",\"sprite\":\"%s\",\"frame\":%d,\"error\":\"%s\"}\n",
                escapeJson(spritePath).c_str(), useFrame, escapeJson(e.what()).c_str());
            fprintf(stderr, "[ERROR] %s\n", e.what());
            delete reader;
            return 1;
        }
    }

    // ── List mode ──
    if (listMode) {
        fprintf(stderr, "[LOG] List mode: traversing file tree...\n");
        printf("{\"type\":\"pvf_list\",\"files\":[");
        int count = 0;
        auto& root = reader->getRoot();

        // DFS the tree. Path is built from segment names joined with '/'.
        // Leaf = node with non-null PvfNode pointer.
        // We use an iterative stack with (treeNode*, accumulatedPath).
        std::vector<std::pair<PvfTreeNode*, std::string>> stack;
        for (auto& kv : root.children) {
            stack.emplace_back(kv.second.get(), kv.first);
        }
        while (!stack.empty()) {
            auto [node, path] = stack.back();
            stack.pop_back();
            if (node->node != nullptr) {
                // Leaf file. Apply substring filter + extension whitelist.
                // Both filters compose (AND) when set; either alone works.
                bool subOk = filter.empty() || path.find(filter) != std::string::npos;
                bool extOk = matchesFilterExt(path, filterExts);
                if (subOk && extOk) {
                    if (count > 0) printf(",");
                    printf("\"%s\"", escapeJson(path).c_str());
                    count++;
                }
            }
            for (auto& kv : node->children) {
                stack.emplace_back(kv.second.get(), path + "/" + kv.first);
            }
        }
        printf("],\"count\":%d", count);
        if (!filter.empty()) {
            printf(",\"filter\":\"%s\"", escapeJson(filter).c_str());
        }
        if (!filterExts.empty()) {
            printf(",\"filterExt\":\"%s\"", escapeJson(filterExtRaw).c_str());
        }
        printf("}\n");
        fprintf(stderr, "[DONE] List: %d files. Memory released.\n", count);
        delete reader;
        return 0;
    }

    // Manifest collector: populated by extractFile() when manifest output is
    // requested. effectiveManifestOut = where to write at the end (either
    // --manifest-out when --only-changed is set, or --manifest otherwise).
    std::vector<ManifestEntry> manifestEntries;
    std::string effectiveManifestOut;
    if (onlyChanged) {
        // --only-changed treats --manifest as INPUT. Only write a refreshed
        // manifest if --manifest-out is also set.
        effectiveManifestOut = manifestOutPath;
    } else {
        // Plain --manifest <path> = write manifest of this run's extractions.
        effectiveManifestOut = manifestPath;
    }
    std::vector<ManifestEntry>* manifestSink =
        effectiveManifestOut.empty() ? nullptr : &manifestEntries;

    // ── Single file mode ──
    if (!filePath.empty()) {
        // Apply --only-changed skip (single-file mode still respects it for
        // pipeline correctness).
        if (onlyChanged && shouldSkipUnchanged(*reader, filePath, prevCrcMap)) {
            fprintf(stderr, "[LOG] Skipped (unchanged): %s\n", filePath.c_str());
        } else {
            emitProgress(1, 1, filePath);
            extractFile(*reader, filePath, withData, manifestSink, sourcePvfHash);
        }
        if (!effectiveManifestOut.empty()) {
            writeManifest(effectiveManifestOut, pvfPath, "", manifestEntries);
        }
        delete reader;
        fprintf(stderr, "[DONE] Memory released.\n");
        return 0;
    }

    // ── Batch mode ──
    if (!batchFiles.empty()) {
        auto tb0 = std::chrono::steady_clock::now();
        int count = 0;
        int skipped = 0;
        int total = (int)batchFiles.size();
        int idx = 0;
        for (auto& f : batchFiles) {
            idx++;
            if (onlyChanged && shouldSkipUnchanged(*reader, f, prevCrcMap)) {
                skipped++;
                fprintf(stderr, "[LOG] Skipped (unchanged): %s\n", f.c_str());
                // Still emit the separator so consumers can count batch slots,
                // but no progress line for skipped files (they didn't extract).
                printf("---\n");
                continue;
            }
            emitProgress(idx, total, f);
            extractFile(*reader, f, withData, manifestSink, sourcePvfHash);
            printf("---\n");
            count++;
        }
        fflush(stdout);
        if (!effectiveManifestOut.empty()) {
            writeManifest(effectiveManifestOut, pvfPath, "", manifestEntries);
        }
        auto tb1 = std::chrono::steady_clock::now();
        auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(tb1 - tb0).count();
        if (onlyChanged) {
            fprintf(stderr, "[DONE] Batch: %d extracted, %d skipped (unchanged) in %lldms. Memory released.\n",
                count, skipped, (long long)ms);
        } else {
            fprintf(stderr, "[DONE] Batch: %d files in %lldms. Memory released.\n", count, (long long)ms);
        }
        delete reader;
        return 0;
    }

    // ── Pipe mode ──
    if (pipeMode) {
        std::string line;
        int count = 0;
        int skipped = 0;
        int idx = 0;
        while (std::getline(std::cin, line)) {
            while (!line.empty() && (line.back() == '\r' || line.back() == '\n' || line.back() == ' '))
                line.pop_back();
            if (line.empty() || line == "quit" || line == "exit") break;

            // --filter-ext applies to pipe input too (cheap pre-filter to
            // avoid round-tripping non-target paths).
            if (!filterExts.empty() && !matchesFilterExt(line, filterExts)) {
                // Still emit separator + skip log so the stream stays aligned.
                printf("---\n");
                fflush(stdout);
                continue;
            }
            idx++;
            if (onlyChanged && shouldSkipUnchanged(*reader, line, prevCrcMap)) {
                skipped++;
                fprintf(stderr, "[LOG] Skipped (unchanged): %s\n", line.c_str());
                printf("---\n");
                fflush(stdout);
                continue;
            }
            // Pipe mode has no a-priori total → emit null.
            emitProgress(idx, -1, line);
            extractFile(*reader, line, withData, manifestSink, sourcePvfHash);
            printf("---\n");
            fflush(stdout);
            count++;
        }
        if (!effectiveManifestOut.empty()) {
            writeManifest(effectiveManifestOut, pvfPath, "", manifestEntries);
        }
        if (onlyChanged) {
            fprintf(stderr, "[DONE] Pipe: %d extracted, %d skipped (unchanged). Memory released.\n",
                count, skipped);
        } else {
            fprintf(stderr, "[DONE] Pipe: %d files. Memory released.\n", count);
        }
        delete reader;
        return 0;
    }

    // ── Workflow mode ──
    if (workflowMode) {
        std::string line;
        int count = 0;
        NpkFile* activeNpk = nullptr;

        while (std::getline(std::cin, line)) {
            while (!line.empty() && (line.back() == '\r' || line.back() == '\n'))
                line.pop_back();
            if (line.empty()) continue;

            if (line.find("\"quit\"") != std::string::npos) {
                printf("{\"type\":\"bye\",\"extracted\":%d}\n---\n", count);
                fflush(stdout);
                break;
            }
            if (line.find("\"status\"") != std::string::npos) {
                printf("{\"type\":\"status\",\"ready\":true,\"extracted\":%d,\"loadTimeMs\":%lld}\n---\n",
                    count, (long long)loadMs);
                fflush(stdout);
                continue;
            }
            if (line.find("\"extract\"") != std::string::npos) {
                auto ps = line.find("\"path\"");
                if (ps == std::string::npos) { printErrorJson("","missing path"); printf("---\n"); fflush(stdout); continue; }
                auto vs = line.find('"', ps + 6); if (vs == std::string::npos) { printErrorJson("","bad json"); printf("---\n"); fflush(stdout); continue; }
                vs++;
                auto ve = line.find('"', vs); if (ve == std::string::npos) { printErrorJson("","bad json"); printf("---\n"); fflush(stdout); continue; }
                extractFile(*reader, line.substr(vs, ve - vs), false, nullptr, sourcePvfHash);
                printf("---\n");
                fflush(stdout);
                count++;
                continue;
            }
            if (line.find("\"npk-load\"") != std::string::npos) {
                auto ps = line.find("\"path\"");
                if (ps == std::string::npos) { printErrorJson("","missing path"); printf("---\n"); fflush(stdout); continue; }
                auto vs = line.find('"', ps + 6); vs++;
                auto ve = line.find('"', vs);
                std::string npk = line.substr(vs, ve - vs);
                fprintf(stderr, "[LOG] Loading NPK: %s\n", npk.c_str());
                NpkFile::GlobalFileTable.emplace(npk, npk).first->second.unpack();
                printf("{\"type\":\"npk-loaded\",\"path\":\"%s\"}\n---\n", escapeJson(npk).c_str());
                fflush(stdout);
                continue;
            }
            if (line.find("\"npk-frame\"") != std::string::npos) {
                // Parse: {"cmd":"npk-frame","sprite":"...","frame":0}
                auto ps = line.find("\"sprite\"");
                if (ps == std::string::npos) { printErrorJson("","missing sprite"); printf("---\n"); fflush(stdout); continue; }
                auto vs = line.find('"', ps + 8); vs++;
                auto ve = line.find('"', vs);
                std::string sprite = line.substr(vs, ve - vs);

                int fi = 0;
                auto fp = line.find("\"frame\"");
                if (fp != std::string::npos) {
                    auto fv = line.find(':', fp + 7);
                    if (fv != std::string::npos) fi = atoi(line.c_str() + fv + 1);
                }

                try {
                    auto& node = NpkFile::getNpkImgNode(sprite, fi);
                    printf("{\"type\":\"frame\",\"sprite\":\"%s\",\"frame\":%d,",
                        escapeJson(sprite).c_str(), fi);
                    printImgFrameFields(node, fi, line.find("\"withData\"") != std::string::npos);
                    printf("}\n---\n");
                } catch (...) {
                    printErrorJson(sprite, "frame_not_found");
                    printf("---\n");
                }
                fflush(stdout);
                continue;
            }

            if (line.find("\"resolve\"") != std::string::npos) {
                // {"cmd":"resolve","sprite":"...","frame":N,"npkDir":"..."[,"withData":true]}
                auto extractStr = [&](const char* key, size_t keyLen) -> std::string {
                    auto kp = line.find(key);
                    if (kp == std::string::npos) return {};
                    auto qs = line.find('"', kp + keyLen);
                    if (qs == std::string::npos) return {};
                    qs++;
                    auto qe = line.find('"', qs);
                    if (qe == std::string::npos) return {};
                    return line.substr(qs, qe - qs);
                };
                std::string sprite = extractStr("\"sprite\"", 8);
                std::string dir    = extractStr("\"npkDir\"", 8);
                if (sprite.empty()) { printErrorJson("","missing sprite"); printf("---\n"); fflush(stdout); continue; }
                int fi = 0;
                auto fp = line.find("\"frame\"");
                if (fp != std::string::npos) {
                    auto fv = line.find(':', fp + 7);
                    if (fv != std::string::npos) fi = atoi(line.c_str() + fv + 1);
                }
                if (!dir.empty()) NpkFile::loadAll(dir);
                try {
                    auto& node = NpkFile::getNpkImgNode(sprite, fi);
                    printf("{\"type\":\"resolved_frame\",\"sprite\":\"%s\",\"frame\":%d,",
                        escapeJson(sprite).c_str(), fi);
                    printImgFrameFields(node, fi, line.find("\"withData\"") != std::string::npos);
                    printf("}\n---\n");
                } catch (const std::exception& e) {
                    printf("{\"type\":\"error\",\"sprite\":\"%s\",\"frame\":%d,\"error\":\"%s\"}\n---\n",
                        escapeJson(sprite).c_str(), fi, escapeJson(e.what()).c_str());
                }
                fflush(stdout);
                continue;
            }

            if (line.find("\"npk-list\"") != std::string::npos) {
                // {"cmd":"npk-list","npk":"..."}
                auto kp = line.find("\"npk\"");
                if (kp == std::string::npos) { printErrorJson("","missing npk"); printf("---\n"); fflush(stdout); continue; }
                auto qs = line.find('"', kp + 5); if (qs == std::string::npos) { printErrorJson("","bad json"); printf("---\n"); fflush(stdout); continue; }
                qs++;
                auto qe = line.find('"', qs); if (qe == std::string::npos) { printErrorJson("","bad json"); printf("---\n"); fflush(stdout); continue; }
                std::string npkPath = line.substr(qs, qe - qs);
                // Idempotent unpack: don't re-read if already loaded.
                auto& slot = NpkFile::GlobalFileTable.emplace(npkPath, npkPath).first->second;
                size_t beforeCount = NpkFile::GlobalTable.size();
                if (!slot.isUnpacked()) slot.unpack();
                size_t afterCount = NpkFile::GlobalTable.size();
                printf("{\"type\":\"npk\",\"path\":\"%s\",\"newImgCount\":%zu,\"images\":[",
                    escapeJson(npkPath).c_str(), afterCount - beforeCount);
                bool firstImg = true;
                for (auto& [name, imgPtr] : NpkFile::GlobalTable) {
                    if (!firstImg) printf(",");
                    firstImg = false;
                    printf("{\"name\":\"%s\"}", escapeJson(name).c_str());
                }
                printf("]}\n---\n");
                fflush(stdout);
                continue;
            }

            printf("{\"type\":\"error\",\"error\":\"unknown_command\"}\n---\n");
            fflush(stdout);
        }
        fprintf(stderr, "[DONE] Workflow: %d extracted. Memory released.\n", count);
        delete reader;
        return 0;
    }

    delete reader;
    printUsage();
    return 1;
}
