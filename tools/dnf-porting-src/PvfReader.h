#pragma once
#include <cstdint>
#include <string>
#include <stdio.h>
#include <memory>
#include <iconv.h>

#include "PvfNode.h"
#include <functional>
#include <mutex>

enum EncodingType
{
	TW = 950,
	CN = 936,
	KR = 949,
	JP = 932,
	UTF8 = 65001,
	Unicode = 1200
};



class PvfReader 
{
	struct PvfHeader
	{
		int32_t sizeGUID; //Always 0x24
		uint8_t GUID[0x24];
		int32_t fileVersion;
		int32_t dirTreeLength;//ͷ�ļ�ռ���ֽڴ�С
		int32_t dirTreeChecksum;//CRC32��
		int32_t numFilesInDirTree;//PVF�ļ�����
	};


public:
	friend class PvfDocument;

	static constexpr uint32_t PASSWORD_PVF = 0x81A79011;
	//static constexpr const char* ENCODING = "CP949";
	static constexpr const char* ENCODING = "CP949";
	PvfReader(const std::string& path);
	~PvfReader();
	auto unpack() -> void;
	auto setPosition(uint64_t pos) -> void;
	auto decrypt(uint8_t* ptr, uint32_t len, uint32_t crc32) -> void;
	auto readBytes(uint32_t length)->std::unique_ptr<uint8_t[]>;
	auto decryptString(const std::unique_ptr<uint8_t[]>& buffer, int32_t len, std::string& out) -> void;
	auto codeConvert(const char* fromCharset, const char* toCharset, const char* inbuf, size_t inlen, char* outbuf, size_t outlen)->int32_t;
	auto write(const std::string& file, const std::string & str) -> void;

	auto operator[](const std::string & path) ->PvfTreeNode&;

	inline auto& getRoot()  { return root; }
	inline auto isLoaded() const { return loaded; }

	// Defense-in-depth bounds check for stringBinMap lookups. PvfReader is
	// already filtering in unpackStringTable (see PvfReader.cpp F3 guard),
	// but every other call site reads the index straight off a file byte
	// stream. Returns a stable empty-string reference on OOB so callers can
	// treat the value as "missing section / empty attribute" instead of UB.
	inline const std::string& lookupBin(int32_t index) const {
		static const std::string kEmpty{};
		if (index < 0 || static_cast<size_t>(index) >= stringBinMap.size()) {
			return kEmpty;
		}
		return stringBinMap[index];
	}

	template <typename T>
	// Read a number and advance the buffer position.
	inline T read(const uint8_t* buffer, int32_t offset)
	{
		size_t count = sizeof(T) / sizeof(int8_t);
		T all = 0;
		for (size_t i = 0; i < count; i++)
		{
			T val = static_cast<T>(buffer[offset]);
			all += val << (8 * i);
			offset++;
		}
		return static_cast<T>(all);
	}

	auto unpackStringTable(const std::function<void(
			std::function<void*()>, std::function<void(void*)>, int32_t
		)> & addTask, const std::function<void()> & waitAll
	) -> void;



private:
	auto dfsCreateNode(PvfNode& tag, PvfTreeNode* tree, const std::vector<std::string_view>& pathes, int32_t deep) -> void;
	auto mapping() -> void;



	int64_t length = 0;
	uint64_t pos = 0;
	FILE* file = nullptr;
	std::string path;
	PvfHeader header;

	std::unordered_map<std::string, PvfNode> pvfNodes;
	std::unordered_map<std::string, std::string> stringStringMap;
	std::vector<std::string> stringBinMap;

	// Hot-path iconv descriptor for CP949 → UTF-8. Held open for the lifetime
	// of PvfReader so we don't re-open it 600K+ times during dirtree parse +
	// stringtable decode (saves 30-50% of [READY] latency per Agent 5 baseline).
	// (iconv_t)-1 means "not opened" (POSIX failure sentinel).
	iconv_t iconvCdCp949ToUtf8 = (iconv_t)-1;

	PvfTreeNode root;
	bool loaded = false;
};
