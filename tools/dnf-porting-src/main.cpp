// main.cpp — DNF Full Extractor CLI
// Exposes ALL capabilities: PVF, NPK, IMG, Animation, Document, Text
//
// PVF modes:  --pvf <path> [--file|--pipe|--batch|--workflow|--list]
// NPK modes:  --npk <path> [--list|--img <name>|--frame <idx>]
// Resolve:    --pvf <path> --npk-dir <dir> --resolve <sprite-path> --frame <idx>

#include <cstdio>
#include <cstring>
#include <string>
#include <vector>
#include <iostream>
#include <chrono>
#include <filesystem>
#include "PvfReader.h"
#include "PvfAnimation.h"
#include "PvfDocument.h"
#include "PvfString.h"
#include "NpkFile.h"
#include "ImgFile.h"

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

static void printDocumentJson(const std::string& path, PvfDocument& doc) {
    auto& root = doc.getRoot();
    printf("{\"path\":\"%s\",\"type\":\"document\",\"sections\":[", escapeJson(path).c_str());
    bool first = true;
    for (auto& [name, nodes] : root.children) {
        for (auto& node : nodes) {
            if (!first) printf(",");
            first = false;
            printf("{\"name\":\"%s\",\"attributes\":[", escapeJson(name).c_str());
            bool firstAttr = true;
            for (auto& attr : node.attribute) {
                if (!firstAttr) printf(",");
                firstAttr = false;
                if (attr) printf("\"%s\"", escapeJson(attr->toString()).c_str());
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
// PVF extraction core
// ══════════════════════════════════════════════════════════════

static void extractFile(PvfReader& reader, const std::string& rawPath) {
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
        printDocumentJson(rawPath, *static_cast<PvfDocument*>(script.get()));
    } else if (script->getType() == PvfScriptType::Text) {
        printTextJson(rawPath, *static_cast<PvfTextScript*>(script.get()));
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
  --with-data       Include base64 pixel data in frame output (default: metadata only)
  --help            Show this help

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

    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--pvf") == 0 && i + 1 < argc) pvfPath = argv[++i];
        else if (strcmp(argv[i], "--npk") == 0 && i + 1 < argc) npkPath = argv[++i];
        else if (strcmp(argv[i], "--file") == 0 && i + 1 < argc) filePath = argv[++i];
        else if (strcmp(argv[i], "--img") == 0 && i + 1 < argc) imgName = argv[++i];
        else if (strcmp(argv[i], "--frame") == 0 && i + 1 < argc) frameIdx = atoi(argv[++i]);
        else if (strcmp(argv[i], "--frames") == 0) framesMode = true;
        else if (strcmp(argv[i], "--filter") == 0 && i + 1 < argc) filter = argv[++i];
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

    // ══════════════════════════════════════════════════════════
    // NPK mode (no PVF needed)
    // ══════════════════════════════════════════════════════════
    if (!npkPath.empty() && pvfPath.empty()) {
        fprintf(stderr, "[LOG] Loading NPK: %s\n", npkPath.c_str());
        NpkFile npk(npkPath);
        npk.unpack();
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
                // Leaf file. Apply substring filter if set.
                if (filter.empty() || path.find(filter) != std::string::npos) {
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
        printf("}\n");
        fprintf(stderr, "[DONE] List: %d files. Memory released.\n", count);
        delete reader;
        return 0;
    }

    // ── Single file mode ──
    if (!filePath.empty()) {
        extractFile(*reader, filePath);
        delete reader;
        fprintf(stderr, "[DONE] Memory released.\n");
        return 0;
    }

    // ── Batch mode ──
    if (!batchFiles.empty()) {
        auto tb0 = std::chrono::steady_clock::now();
        int count = 0;
        for (auto& f : batchFiles) {
            extractFile(*reader, f);
            printf("---\n");
            count++;
        }
        fflush(stdout);
        auto tb1 = std::chrono::steady_clock::now();
        auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(tb1 - tb0).count();
        fprintf(stderr, "[DONE] Batch: %d files in %lldms. Memory released.\n", count, (long long)ms);
        delete reader;
        return 0;
    }

    // ── Pipe mode ──
    if (pipeMode) {
        std::string line;
        int count = 0;
        while (std::getline(std::cin, line)) {
            while (!line.empty() && (line.back() == '\r' || line.back() == '\n' || line.back() == ' '))
                line.pop_back();
            if (line.empty() || line == "quit" || line == "exit") break;
            extractFile(*reader, line);
            printf("---\n");
            fflush(stdout);
            count++;
        }
        fprintf(stderr, "[DONE] Pipe: %d files. Memory released.\n", count);
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
                extractFile(*reader, line.substr(vs, ve - vs));
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
