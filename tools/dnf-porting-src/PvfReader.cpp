#include <algorithm>
#include <cstring>
#include "PvfReader.h"
#include "iconv.h"
#include <iostream>
#include <filesystem>
#include <cassert>
#include <tellenc.h>
#include <set>

#include "PvfString.h"

inline static auto rotateRight4(uint32_t x, uint32_t y) -> uint32_t {
	return x >> y | x << 32 - y;
}

// trim from start (in place)
static inline auto ltrim(std::string& s) {
	s.erase(s.begin(), std::find_if(s.begin(), s.end(), [](unsigned char ch) {
		return !std::isspace(ch);
		}));
}

// trim from end (in place)
static inline auto rtrim(std::string& s) {
	s.erase(std::find_if(s.rbegin(), s.rend(), [](unsigned char ch) {
		return !std::isspace(ch);
		}).base(), s.end());
}

// trim from both ends (in place)
static inline auto trim(std::string& s) {
	ltrim(s);
	rtrim(s);
}


static inline auto split(std::string_view line, std::string_view a, std::string_view b) -> std::string
{
	size_t index = 0;
	if (!a.empty())
		index = line.find_first_of(a);
	if (index == std::string_view::npos)
		return "";
	index = index + a.length();
	auto str = line.substr(index, line.length() - index);
	if (b.empty())
		return std::string(str);
	auto num = str.find_first_of(b);
	if (num == std::string_view::npos)
	{
		return "";
	}
	return std::string(str.substr(0, num));
}

static inline auto toLower(std::string& data) {
	std::transform(data.begin(), data.end(), data.begin(),
		[](unsigned char c) { return std::tolower(c); });
}

PvfReader::PvfReader(const std::string& path)
{
	file = fopen(path.c_str(), "rb");
	if (file == nullptr) {
		fprintf(stderr, "[ERROR] fail to open this file : %s\n", path.c_str());
		exit(1);
	}
	fseek(file, 0, SEEK_END);
	length = ftell(file);
	fseek(file, 0, SEEK_SET);

	// Pre-open the CP949→UTF-8 iconv descriptor once. Both dirtree parse
	// (370K files) and stringtable decode (230K entries) hit this exclusively;
	// the previous per-call open/close was the dominant load-time cost.
	iconvCdCp949ToUtf8 = iconv_open("UTF-8", PvfReader::ENCODING);
	if (iconvCdCp949ToUtf8 == (iconv_t)-1) {
		fprintf(stderr, "[ERROR] iconv_open CP949→UTF-8 failed\n");
		// Fall through; codeConvert() will fall back to per-call open/close.
	}
}

PvfReader::~PvfReader()
{
	if (file != nullptr)
		fclose(file);
	if (iconvCdCp949ToUtf8 != (iconv_t)-1) {
		iconv_close(iconvCdCp949ToUtf8);
		iconvCdCp949ToUtf8 = (iconv_t)-1;
	}
}

auto PvfReader::codeConvert(const char* fromCharset, const char* toCharset, const char* inbuf, size_t inlen,
	char* outbuf, size_t outlen) -> int32_t
{
	char** pout = &outbuf;
	memset(outbuf, 0, outlen);

	// Hot path: CP949 → UTF-8 reuses the cached descriptor. Reset its shift
	// state before each conversion (stateless-as-if behavior). Any other
	// direction falls back to per-call open/close.
	const bool hotPath = (iconvCdCp949ToUtf8 != (iconv_t)-1)
		&& fromCharset && toCharset
		&& strcmp(fromCharset, PvfReader::ENCODING) == 0
		&& strcmp(toCharset, "UTF-8") == 0;
	if (hotPath) {
		iconv(iconvCdCp949ToUtf8, nullptr, nullptr, nullptr, nullptr);
		iconv(iconvCdCp949ToUtf8, const_cast<char**>(&inbuf), &inlen, pout, &outlen);
		return outlen;
	}

	iconv_t cd = iconv_open(toCharset, fromCharset);
	// POSIX returns (iconv_t)-1 on failure, not nullptr — comparing against
	// nullptr lets failures slip through to iconv() which is undefined behavior.
	if (cd == (iconv_t)-1)
		return -1;

	iconv(cd, const_cast<char**>(&inbuf), &inlen, pout, &outlen);
	iconv_close(cd);
	return outlen;
}


auto PvfReader::unpack() -> void
{
	fread(&header, sizeof(PvfHeader), 1, file);
	auto headLength = header.dirTreeLength;
	auto dirTreeData = std::make_unique<uint8_t[]>(header.dirTreeLength);
	fread(dirTreeData.get(), header.dirTreeLength, 1, file);
	decrypt(dirTreeData.get(), header.dirTreeLength, header.dirTreeChecksum);

	int32_t offset = 0;
	auto outChr = std::make_unique<char[]>(1024);

	for (int32_t i = 0; i < header.numFilesInDirTree; i++)
	{

		auto fileNumber		= read<uint32_t>(dirTreeData.get(), offset);
		auto filePathLength = read<int32_t>(dirTreeData.get(), offset + 4);
		auto filePath		= dirTreeData.get() + offset + 8;
		auto fileLength		= read<int32_t>(dirTreeData.get(), offset + 8 + filePathLength);
		auto fileCrc32		= read<uint32_t>(dirTreeData.get(), offset + 12 + filePathLength);
		auto relativeOffset = read<int32_t>(dirTreeData.get(), offset + 0x10 + filePathLength);

		//CP949
		codeConvert(PvfReader::ENCODING, "UTF-8", (char*)filePath, filePathLength, outChr.get(), filePathLength * 2);
		std::string filePathName(outChr.get());
		rtrim(filePathName);
		auto & node			= pvfNodes[filePathName];
		node.fileNumber		= fileNumber;
		node.filePathLength = filePathLength;
		// NOTE: node.offset intentionally left as nullptr. The previous
		// assignment `node.offset = filePath` stored a pointer into
		// dirTreeData, which is freed when unpack() returns — every PvfNode
		// would then hold a dangling pointer (use-after-free on dereference).
		// The field is never read currently; if a future use needs an
		// in-memory pointer, allocate ownership on PvfReader (e.g. keep
		// dirTreeData alive as a member) instead of restoring this line.
		node.fileLength		= fileLength;
		node.fileCrc32		= fileCrc32;
		node.relativeOffset = sizeof(PvfHeader) + header.dirTreeLength + relativeOffset;
		node.reader			= this;
		node.fileName		= filePathName;
		offset += filePathLength + 20;
	}
	unpackStringTable(nullptr,nullptr);
	mapping();
}

auto PvfReader::setPosition(uint64_t position) -> void
{
	if (position >= length)
	{
		fprintf(stderr, "[ERROR] PvfReader :: OutOfFileSizeException : %lld \n", position);
		return;
	}
	fseek(file, position, SEEK_SET);
	this->pos = position;
}


auto PvfReader::decrypt(uint8_t* ptr, uint32_t len, uint32_t crc32) -> void
{
	uint32_t* newPtr = reinterpret_cast<uint32_t*>(ptr);
	int32_t i = 0;
	while ( i < len / 4)
	{
		newPtr[i] = rotateRight4(newPtr[i] ^ PASSWORD_PVF ^ crc32, 6);
		i++;
	}

/*
	int32_t index = 0;
	while (index < len )
	{ 
		auto intv = read<uint32_t>(ptr, index);
		auto decryptWord = rotateRight4(intv ^ PASSWORD_PVF ^ crc32, 6);
		memcpy(ptr + index, decryptWord, 4);
		index += 4;
	}*/
}

auto PvfReader::dfsCreateNode(PvfNode& tag, PvfTreeNode * tree, const std::vector<std::string_view>& pathes, int32_t deep) -> void
{
	// One string allocation per level (for the map key); the rest is reused
	// across siblings via the hoisted std::string_view vector in mapping().
	std::string segment(pathes[deep]);

	if (pathes.size() - 1 == deep)
	{
		tree->children[segment] = std::make_unique<PvfTreeNode>(segment);
		tree->children[segment]->parent = tree;
		tree->children[segment]->node = &tag;
		return;
	}

	if (tree->children.find(segment) == tree->children.end())
	{
		tree->children[segment] = std::make_unique<PvfTreeNode>(segment);
		tree->children[segment]->parent = tree;
	}
	auto & item1 = tree->children[segment];
	dfsCreateNode(tag, item1.get(), pathes, deep + 1);
}

auto PvfReader::mapping() -> void
{
	// Hoist the segment vector out of the loop so its allocation amortizes
	// across ~370K paths instead of repeating per-iteration. PvfString::split
	// clears it but preserves capacity.
	std::vector<std::string_view> out;
	out.reserve(8);
	for (auto & kv : pvfNodes)
	{
		PvfString::split(kv.first, "/", out);
		dfsCreateNode(kv.second, &root, out, 0);
	}
	std::cerr << "mapping over"<<std::endl;
	loaded = true;
}

auto PvfReader::unpackStringTable(const std::function<void(std::function<void* ()>, std::function<void(void*)>,int32_t)>& addTask, const std::function<void()>& waitAll) -> void
{
	auto& strtable = pvfNodes["stringtable.bin"];

	auto ptr = strtable.expand();

	auto buffer = ptr.get();

	int32_t count = read<int32_t>(ptr.get(), 0);

	stringBinMap.resize(count);
	// CP949 → UTF-8 expansion is at most 3 bytes per source byte. The previous
	// fixed 32767-byte buffer overflows when a stringtable entry exceeds
	// 16383 bytes (PvfReader.cpp old line ~225). Grow on demand instead, and
	// hard-cap pathological lengths so a corrupted PVF can't request gigabytes.
	std::vector<char> outChars(32768, 0);
	const int32_t kMaxEntryLen = 1 << 20;  // 1 MB, far above legitimate strings.
	for (int32_t i = 0; i < count; i++)
	{
		auto startPos = read<int32_t>(buffer, i * 4 + 4);
		auto endPos = read<int32_t>	 (buffer, i * 4 + 8);
		auto len = endPos - startPos;
		int32_t index = i;

		if (len <= 0 || len > kMaxEntryLen) {
			stringBinMap[index].clear();
			continue;
		}
		size_t needed = static_cast<size_t>(len) * 3 + 1;
		if (outChars.size() < needed) outChars.resize(needed);
		std::fill_n(outChars.begin(), needed, 0);

		codeConvert(PvfReader::ENCODING, "UTF-8", (char*)buffer + startPos + 4, len, outChars.data(), needed);
		this->stringBinMap[index] = outChars.data();
		toLower(this->stringBinMap[index]);
		trim(this->stringBinMap[index]);

	}
	//##################################
	auto& nstrtable = pvfNodes["n_string.lst"];
	ptr = nstrtable.expand();
	auto len = nstrtable.getComputedFileLength();

	auto magicNumber = read<uint16_t>(ptr.get(), 0);
	assert(magicNumber == 53424);

	for (auto i = 2; i < len; i += 10)
	{
		if (len - i >= 10)//��������ʮ���ֽڻ��������ʮ���ֽھͲ�ִ��
		{
			//ǰ6λ����Ĳ�֪����6-10λ��intֵ��stringtable�ļ���ȡ����
			auto v = read<int32_t>(ptr.get(), i + 6);
			const auto & k = stringBinMap[v];
			//ȡ������stringtable��ֵ���ļ��б���һ���ļ����ļ���������ʹ�����շ�������Ҫ������ΪСд������ո�

			if (auto node = pvfNodes.find(k); node != pvfNodes.end())
			{
				auto full = std::static_pointer_cast<PvfTextScript>(node->second.unpack());
				// `full` keeps the underlying string alive for the duration of this
				// scope, so string_views over its content stay valid.
				std::vector<std::string_view> out;
				PvfString::split(full->getContent(), "\r\n", out);

				for (auto& line : out)
				{
					if (auto pos = line.find_first_of('>'); pos != std::string_view::npos)
					{
						auto key = split(line, "", ">");
						auto val = split(line, ">", "");
						stringStringMap[key] = val;
					}
				}
			}
		}
	}
}

auto PvfReader::write(const std::string& file, const std::string& str) -> void
{
	std::string delimiter = "/";
	std::vector<std::string_view> outs;
	// Pre-existing bug: the original call was split("/", file, outs), which
	// splits the literal "/" by whatever the `file` path contains — clearly
	// the arguments were reversed. Intent is "split `file` by '/'".
	PvfString::split(file, "/", outs);

	if (outs.size() > 1) {
		auto pos = file.find_last_of(delimiter);
		if (pos != std::string::npos) {
			auto name = file.substr(0, pos);
			std::filesystem::create_directories(name);
		}
	}

	FILE* f = fopen(file.c_str(), "wb");
	if (!f) {
		fprintf(stderr, "[ERROR] fail to write file : %s\n", file.c_str());
		return;
	}
	fwrite(str.c_str(), str.length(), 1, f);
	fclose(f);
}

auto PvfReader::operator[](const std::string& path) ->PvfTreeNode&
{
	return root[path];
}

auto PvfReader::readBytes(uint32_t length) ->std::unique_ptr<uint8_t[]>
{
	auto bytes = std::make_unique<uint8_t[]>(length);
	fread(bytes.get(), length, 1, file);
	return bytes;
}


auto PvfReader::decryptString(const std::unique_ptr<uint8_t[]>& buffer, int32_t len, std::string& out) -> void
{
	/*if (len > 7) {
		for (int32_t i = 2; i < len; i += 5)//��5Ϊ�����ӵڶ�λ��ʼ�����ֽ�
		{
			if (len - i >= 5)//������˾Ͳ������˷�ֹ�ڴ�Խ��
			{
				auto type = buffer.get()[i];//�²�Ӧ��������ָʾλ
				if (type>=1 && type <= 10)
				{
					auto index = read<int32_t>(buffer.get(), i + 1);

					switch (type) {
					case ValueType::Value1:
					case ValueType::Value3:
					case ValueType::Value9:
					case ValueType::Int://2
					{
						auto value = std::to_string(index) +'\t';
						out.append(value);
					}
					break;
					case ValueType::Float://4
					{
						float f = *reinterpret_cast<float*>(&index);
						auto value = std::to_string(f) + '\t';
						out.append(value);
					}
					break;
			
					case ValueType::IntString5:
					{
						out.append("\r\n");
						out.append(stringBinMap[index]);
						out.append("\r\n");
					}
						break;
					case ValueType::IntString7:
					{
						out.append("`");
						out.append(stringBinMap[index]);
						out.append("`\r\n");
					}
						break;
					case ValueType::IntString6:
					case ValueType::IntString8: 
					{
						out.append("{");
						out.append(std::to_string(type));
						out.append("=`");
						out.append(stringBinMap[index]);
						out.append("`}\r\n");
					}
						break;
				
					case ValueType::StringTable:
					{
						auto before = read<int32_t>(buffer.get(), i  - 4);

						if (auto str = stringBinMap[index];str != "") {
							out.append("<");
							out.append(std::to_string(before));
							out.append("::");
							out.append(str);
							out.append("`");
							out.append(stringStringMap[str]);
							out.append("`>");
						}
						out.append("\r\n");
					}
						break;
					}
				}
				else 
				{
					std::cerr << "Unknown type in pvf node ��"<< type << std::endl;
				}
			}
		}
	}*/
}


