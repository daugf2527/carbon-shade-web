#include <algorithm>
#include <cerrno>
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
		// Audit A10 (memory-safety, 2026-05-24): check iconv() return.
		// (size_t)-1 signals EILSEQ / EINVAL / E2BIG. On failure the outbuf is
		// partial — flag the error via the return code so callers can detect
		// truncation. We still leave the partial UTF-8 in outbuf (it's
		// NUL-terminated by the memset above) so downstream code that reads
		// the buffer doesn't crash, but we surface a negative return.
		size_t rc = iconv(iconvCdCp949ToUtf8, const_cast<char**>(&inbuf), &inlen, pout, &outlen);
		if (rc == (size_t)-1) {
			fprintf(stderr, "[ERROR] PvfReader::codeConvert: iconv failed (errno=%d, inlen=%zu remaining)\n",
				errno, inlen);
			return -1;
		}
		return outlen;
	}

	iconv_t cd = iconv_open(toCharset, fromCharset);
	// POSIX returns (iconv_t)-1 on failure, not nullptr — comparing against
	// nullptr lets failures slip through to iconv() which is undefined behavior.
	if (cd == (iconv_t)-1)
		return -1;

	// Audit A10 (memory-safety, 2026-05-24): same return-check for the
	// fallback per-call path.
	size_t rc = iconv(cd, const_cast<char**>(&inbuf), &inlen, pout, &outlen);
	iconv_close(cd);
	if (rc == (size_t)-1) {
		fprintf(stderr, "[ERROR] PvfReader::codeConvert: iconv failed (errno=%d, inlen=%zu remaining)\n",
			errno, inlen);
		return -1;
	}
	return outlen;
}


auto PvfReader::unpack() -> void
{
	// Audit A7 (memory-safety, 2026-05-24): check fread returns. If the file is
	// truncated before the header is read, `header` is left in indeterminate
	// state and every subsequent field read is UB. Same for the dirtree body.
	if (fread(&header, sizeof(PvfHeader), 1, file) != 1) {
		fprintf(stderr, "[ERROR] PvfReader::unpack: short read on PVF header (file truncated?)\n");
		return;
	}
	auto headLength = header.dirTreeLength;

	// Bounds-check file-derived size before allocation (Audit F7: a malicious
	// or truncated PVF could declare dirTreeLength = -1 or 2GB, causing
	// make_unique to receive SIZE_MAX or a multi-GB request).
	if (header.dirTreeLength <= 0 || header.dirTreeLength > 256 * 1024 * 1024) {
		fprintf(stderr, "[ERROR] PvfReader::unpack: implausible dirTreeLength=%d\n", header.dirTreeLength);
		return;
	}
	auto dirTreeData = std::make_unique<uint8_t[]>(header.dirTreeLength);
	// Audit A7 (memory-safety, 2026-05-24): same — refuse to proceed on short
	// read of the dirtree body. decrypt() and the per-entry walk both assume
	// the buffer is fully populated.
	if (fread(dirTreeData.get(), header.dirTreeLength, 1, file) != 1) {
		fprintf(stderr, "[ERROR] PvfReader::unpack: short read on dirTree (file truncated, expected %d bytes)\n",
			header.dirTreeLength);
		return;
	}
	decrypt(dirTreeData.get(), header.dirTreeLength, header.dirTreeChecksum);

	int32_t offset = 0;
	// Audit F1: outChr was a fixed 1024 bytes but codeConvert was called with
	// outlen = filePathLength * 2. A PVF declaring filePathLength > 512 →
	// codeConvert writes past outChr → heap overflow. With filePathLength
	// capped at 4096 below, max UTF-8 expansion is 4096*3 = 12288 bytes;
	// a 16384-byte stack buffer is sufficient.
	char outChr[16384];

	for (int32_t i = 0; i < header.numFilesInDirTree; i++)
	{
		// Audit A1 (memory-safety, 2026-05-24): bounds-check field reads
		// against the actual dirTreeData buffer (header.dirTreeLength).
		// A truncated or hostile tree could declare numFilesInDirTree larger
		// than the bytes actually present, walking us past the buffer end.
		// Need 8 bytes here (fileNumber + filePathLength) before reading.
		if (offset < 0 || offset + 8 > header.dirTreeLength) {
			fprintf(stderr, "[ERROR] PvfReader::unpack: dirTreeData truncated at offset %d (entry %d, dirTreeLength=%d)\n",
				offset, i, header.dirTreeLength);
			return;
		}

		auto fileNumber		= read<uint32_t>(dirTreeData.get(), offset);
		auto filePathLength = read<int32_t>(dirTreeData.get(), offset + 4);

		// Audit F1: bounds-check file-controlled filePathLength.
		// Real PVF paths are < 256 chars; cap at 4096 to allow generous margin
		// while preventing pathological allocations or arithmetic overflow on
		// `filePathLength * 3` below.
		if (filePathLength <= 0 || filePathLength > 4096) {
			fprintf(stderr, "[ERROR] PvfReader::unpack: implausible filePathLength=%d at entry %d\n", filePathLength, i);
			return;
		}
		// Audit A1 (memory-safety, 2026-05-24): the entry's tail spans
		// [offset+8, offset+0x10+filePathLength+4) — filePath bytes plus three
		// trailing int32_t fields (fileLength, fileCrc32, relativeOffset).
		// Reject any entry whose tail would step past the dirTree buffer.
		if (offset + 0x14 + filePathLength > header.dirTreeLength) {
			fprintf(stderr, "[ERROR] PvfReader::unpack: entry %d tail exceeds dirTree (offset=%d, len=%d, dirTreeLength=%d)\n",
				i, offset, filePathLength, header.dirTreeLength);
			return;
		}
		auto filePath		= dirTreeData.get() + offset + 8;
		auto fileLength		= read<int32_t>(dirTreeData.get(), offset + 8 + filePathLength);
		auto fileCrc32		= read<uint32_t>(dirTreeData.get(), offset + 12 + filePathLength);
		auto relativeOffset = read<int32_t>(dirTreeData.get(), offset + 0x10 + filePathLength);

		// codeConvert handles its own memset of the output buffer (PvfReader.cpp:97),
		// so we don't pre-zero here. Pass the actual needed length (UTF-8 expansion
		// up to 3× CP949 source). The internal memset bounds the work to `needed`.
		const size_t needed = static_cast<size_t>(filePathLength) * 3 + 1;

		codeConvert(PvfReader::ENCODING, "UTF-8", (char*)filePath, filePathLength, outChr, needed);
		std::string filePathName(outChr);
		rtrim(filePathName);
		auto & node			= pvfNodes[filePathName];
		node.fileNumber		= fileNumber;
		node.filePathLength = filePathLength;
		// NOTE: node.offset intentionally left as nullptr. The previous
		// assignment `node.offset = filePath` stored a pointer into
		// dirTreeData, which is freed when unpack() returns — every PvfNode
		// would then hold a dangling pointer (use-after-free on dereference).
		node.fileLength		= fileLength;
		node.fileCrc32		= fileCrc32;
		// Audit F19: cast through int64_t to detect overflow before truncation.
		{
			int64_t computed = static_cast<int64_t>(sizeof(PvfHeader))
				+ static_cast<int64_t>(header.dirTreeLength)
				+ static_cast<int64_t>(relativeOffset);
			if (computed < 0 || computed > INT32_MAX) {
				fprintf(stderr, "[ERROR] PvfReader::unpack: relativeOffset overflow %lld at entry %d\n", (long long)computed, i);
				return;
			}
			node.relativeOffset = static_cast<int32_t>(computed);
		}
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
	// Audit A6 (memory-safety, 2026-05-24): guard recursion depth. One frame
	// per path segment; with filePathLength capped at 4096 a hostile PVF could
	// in principle present 4096 single-char segments, blowing the 1 MB Windows
	// stack. Real PVF paths are <16 segments; 64 is generous and catches
	// pathological inputs before stack overflow.
	if (deep > 64) {
		fprintf(stderr, "[ERROR] PvfReader::dfsCreateNode: path depth %d exceeds limit (segments=%zu)\n",
			deep, pathes.size());
		return;
	}

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

	// Audit F6: if stringtable.bin is missing from the PVF (or has fileLength=0),
	// pvfNodes["stringtable.bin"] inserts a default PvfNode whose expand() returns
	// nullptr. Reading from a nullptr buffer below segfaults the entire extractor.
	if (!ptr) {
		fprintf(stderr, "[ERROR] PvfReader::unpackStringTable: stringtable.bin missing or empty in PVF\n");
		return;
	}

	auto buffer = ptr.get();

	int32_t count = read<int32_t>(ptr.get(), 0);

	// Audit F8: stringtable count is file-controlled int32_t. Negative values
	// become huge size_t via implicit conversion in resize(). Cap at 1M entries
	// (real PVF has ~230K, generous headroom).
	if (count < 0 || count > 1000000) {
		fprintf(stderr, "[ERROR] PvfReader::unpackStringTable: implausible count=%d\n", count);
		return;
	}

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

	// Audit F6: same nullptr guard for n_string.lst.
	if (!ptr) {
		fprintf(stderr, "[ERROR] PvfReader::unpackStringTable: n_string.lst missing or empty in PVF\n");
		return;
	}

	auto len = nstrtable.getComputedFileLength();

	auto magicNumber = read<uint16_t>(ptr.get(), 0);
	// Audit F17: assert() is a no-op in Release builds, letting garbage magic
	// continue into the loop below where stringBinMap[v] becomes OOB. Replace
	// with a real check that survives optimization.
	if (magicNumber != 53424) {
		fprintf(stderr, "[ERROR] PvfReader::unpackStringTable: bad n_string.lst magic 0x%04x (expected 0xD0B0)\n", magicNumber);
		return;
	}

	for (auto i = 2; i < len; i += 10)
	{
		if (len - i >= 10)
		{
			auto v = read<int32_t>(ptr.get(), i + 6);
			// Audit F3: v is unchecked int32_t from file. vector::operator[]
			// is UB on OOB; negative or >= stringBinMap.size() must be filtered.
			if (v < 0 || static_cast<size_t>(v) >= stringBinMap.size()) {
				continue;  // skip malformed entry, don't crash extraction
			}
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
						out.append(lookupBin(index));
						out.append("\r\n");
					}
						break;
					case ValueType::IntString7:
					{
						out.append("`");
						out.append(lookupBin(index));
						out.append("`\r\n");
					}
						break;
					case ValueType::IntString6:
					case ValueType::IntString8:
					{
						out.append("{");
						out.append(std::to_string(type));
						out.append("=`");
						out.append(lookupBin(index));
						out.append("`}\r\n");
					}
						break;

					case ValueType::StringTable:
					{
						auto before = read<int32_t>(buffer.get(), i  - 4);

						if (auto str = lookupBin(index);str != "") {
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


