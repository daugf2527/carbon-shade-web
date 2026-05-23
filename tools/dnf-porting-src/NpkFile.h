

#pragma once
#include "Npk.h"
#include <cstdio>
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


	template <typename T>
	inline auto read() -> T
	{
		T t;
		fread(&t, sizeof(T), 1, file);
		offset += sizeof(T);
		return t;
	}
	template <typename T>
	inline auto read(T& t) -> void
	{
		fread(&t, sizeof(T), 1, file);
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
};
