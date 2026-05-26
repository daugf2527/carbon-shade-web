

#pragma once
#include "Npk.h"
#include <cstdio>
#include <cstring>
#include <string>
#include <memory>
#include <vector>
#include <unordered_map>

#include "ImgFile.h"

class NpkFile
{
public:
	NpkFile(const std::string& file);
	NpkFile() = default;
	~NpkFile();
	NpkFile(const NpkFile&) = delete;
	NpkFile& operator=(const NpkFile&) = delete;
	NpkFile(NpkFile&& other) noexcept;
	NpkFile& operator=(NpkFile&& other) noexcept;
	static auto loadAll(const std::string& path) -> void;
	static std::unordered_map<std::string, ImgFile*> GlobalTable;
	// unique_ptr value stabilizes NpkFile addresses across rehash. Without it,
	// GlobalFileTable.emplace() in getNpkImgNode() could move-construct the
	// NpkFile to a new bucket, leaving every ImgFile.file back-pointer (stored
	// in imgNodes elements) pointing at the destroyed NpkFile — a UAF that
	// becomes likely when scanning 4000+ NPKs.
	static std::unordered_map<std::string, std::unique_ptr<NpkFile>> GlobalFileTable;

	static auto getNpkImgNode(const std::string& path, int32_t index) ->ImgNode&;

	auto unpack() -> void;
	inline auto isUnpacked() const { return !imgNodes.empty(); }

	// Audit P0-4 (2026-05-26): callers (main.cpp NPK modes) check this after
	// unpack() / I/O batches to surface short-read / corruption to exit code.
	// Set by read<T>() / readBytes() / readString() when fread returns < 1.
	inline auto hasError() const -> bool { return m_error; }


	template <typename T>
	inline auto read() -> T
	{
		T t;
		if (fread(&t, sizeof(T), 1, file) != 1) {
			// Audit P0-4 (2026-05-26): previously fread return was discarded;
			// short reads leaked uninitialized memory into downstream parsers
			// AND the exit code stayed 0 so CI/harness couldn't distinguish
			// "intact NPK" from "truncated NPK". Zero T to keep callers in a
			// defined state, flag the error, log to stderr.
			fprintf(stderr, "[ERROR] NpkFile::read<T>: short read (expected %zu bytes from %s)\n",
				sizeof(T), fileName.c_str());
			std::memset(&t, 0, sizeof(T));
			m_error = true;
		}
		offset += sizeof(T);
		return t;
	}
	template <typename T>
	inline auto read(T& t) -> void
	{
		if (fread(&t, sizeof(T), 1, file) != 1) {
			// See Audit P0-4 note on the value-returning overload above.
			fprintf(stderr, "[ERROR] NpkFile::read<T>(T&): short read (expected %zu bytes from %s)\n",
				sizeof(T), fileName.c_str());
			std::memset(&t, 0, sizeof(T));
			m_error = true;
		}
		offset += sizeof(T);
	}

	auto setPosition(uint32_t offset) -> void;
	auto readBytes(uint32_t length)->std::unique_ptr<uint8_t[]>;
	auto readBytes(uint8_t* data, int32_t len)->void;
	auto readString(int32_t len) ->std::string;
	inline auto getOffset() const { return offset; }


private:
	auto openFile() -> bool;
	auto expand(const std::string & name) -> void;
	std::string fileName;
	FILE* file = nullptr;
	uint32_t offset = 0;
	uint32_t length = 0;
	std::vector<ImgFile> imgNodes;
	// Audit P0-4 (2026-05-26): sticky error flag. read<T>(), readBytes(),
	// readString() set this to true on any short read; main.cpp inspects it
	// via hasError() before returning, mapping corruption → exit code 1.
	bool m_error = false;
};
