#include <cstring>
#include <stdexcept>

#include "NpkFile.h"
#include <cstdio>
#include <filesystem>
#include "PvfString.h"


const char* HeaderFlag = "NeoplePack_Bill";

// NPK basename (e.g. "sprite_character_swordman_atequipment_avatar_skin") → full
// filesystem path. Populated by loadAll(); consulted by getNpkImgNode() to look
// up the actual NPK file regardless of where the user pointed --npk-dir.
static std::unordered_map<std::string, std::string> g_npkBasenameToPath;


NpkFile::NpkFile(const std::string& initFile)
	:fileName(initFile)
{

}

NpkFile::~NpkFile()
{
	if (file != nullptr) {
		fclose(file);
		file = nullptr;
	}
}

NpkFile::NpkFile(NpkFile&& other) noexcept
	: fileName(std::move(other.fileName)),
	  file(other.file),
	  offset(other.offset),
	  length(other.length),
	  imgNodes(std::move(other.imgNodes))
{
	other.file = nullptr;
}

NpkFile& NpkFile::operator=(NpkFile&& other) noexcept
{
	if (this != &other) {
		if (file != nullptr) fclose(file);
		fileName = std::move(other.fileName);
		file = other.file;
		offset = other.offset;
		length = other.length;
		imgNodes = std::move(other.imgNodes);
		other.file = nullptr;
	}
	return *this;
}
auto NpkFile::openFile() -> bool
{
	file = fopen(fileName.c_str(), "rb");
	if (file == nullptr) {
		fprintf(stderr, "[ERROR] fail to open this file : %s\n", fileName.c_str());
		return false;
	}
	fseek(file, 0, SEEK_END);
	length = ftell(file);
	fseek(file, 0, SEEK_SET);
	return true;
}

auto NpkFile::loadAll(const std::string& path) -> void
{
	for (const auto& entry : std::filesystem::directory_iterator(path))
	{
		bool isDir = std::filesystem::is_directory(entry);

		if (
			PvfString::endWith(entry.path().string(), ".npk") ||
			PvfString::endWith(entry.path().string(), ".NPK")
			&& !isDir)
		{
			std::string fullPath = entry.path().string();
			std::string basename = entry.path().stem().string();
			PvfString::toLower(basename);
			g_npkBasenameToPath[basename] = fullPath;
			GlobalFileTable.emplace(fullPath, std::make_unique<NpkFile>(fullPath));
		}
	}
}

auto NpkFile::unpack() -> void
{
	if (!openFile()) return;
	NpkHeader header;
	readBytes(reinterpret_cast<uint8_t*>(&header), sizeof(NpkHeader));

	if (strcmp(header.flag, HeaderFlag) != 0) {
		fprintf(stderr, "[ERROR] is not a valid npk file\n");
		return;
	}

	// Audit F16: header.count is file-controlled int32_t. Real NPK has hundreds
	// to thousands of IMGs; cap at 100K to catch corruption / hostile values.
	if (header.count < 0 || header.count > 100000) {
		fprintf(stderr, "[ERROR] NpkFile::unpack: implausible header.count=%d in %s\n",
			header.count, fileName.c_str());
		return;
	}

	for (int32_t i = 0; i < header.count; ++i)
	{
		auto & node = imgNodes.emplace_back(this);
		node.unpack();
	}

	for (auto & node : imgNodes)
	{
		GlobalTable[node.getFileName()] = &node;
		node.expand();
	}
}

auto NpkFile::setPosition(uint32_t position) -> void
{
	if (position > length)
	{
		fprintf(stderr, "[ERROR] NpkFile :: OutOfFileSizeException : %d \n", position);
		return;
	}
	fseek(file, position, SEEK_SET);
	this->offset = position;
}

auto NpkFile::readBytes(uint32_t length) ->std::unique_ptr<uint8_t[]>
{
	auto bytes = std::make_unique<uint8_t[]>(length);
	fread(bytes.get(), length, 1, file);
	offset += length;
	return bytes;
}

auto NpkFile::readBytes(uint8_t* data, int32_t len) ->void
{
	// Audit F10: negative int32_t len passed to fread becomes huge size_t.
	// Guard against negative AND clamp absurd positive values (real NPK reads
	// are < 100MB; anything beyond suggests corruption or hostile input).
	if (len < 0 || static_cast<int64_t>(len) > (1LL << 30)) {
		fprintf(stderr, "[ERROR] NpkFile::readBytes: implausible len=%d\n", len);
		return;
	}
	fread(data, len, 1, file);
	offset += len;
}

auto NpkFile::readString(int32_t len) -> std::string
{
	std::string str;
	str.resize(len);
	fread(str.data(), len, 1, file);
	offset += len;
	return str;
}


auto NpkFile::expand(const std::string& name) -> void
{
	
}

#ifdef _WIN32
static const std::string delimiter = "\\";
#else
static const std::string delimiter = "/";
#endif

std::unordered_map<std::string, ImgFile*> NpkFile::GlobalTable;

std::unordered_map<std::string, std::unique_ptr<NpkFile>> NpkFile::GlobalFileTable;

auto NpkFile::getNpkImgNode(const std::string& path, int32_t index) -> ImgNode&
{
	std::vector<std::string> outs;
	PvfString::split(path, "/", outs);
	if (outs.size() < 2) {
		throw std::runtime_error("sprite path too short: " + path);
	}

	// PVF .ani files reference sprites like
	//   character/swordman/equipment/avatar/skin/sm_body%04d.img
	// but the NPK packaging uses different segment names on character/equipment
	// directories. Apply a small list of known PVF→NPK directory renames before
	// looking up the NPK file.
	auto applyRenames = [](std::vector<std::string> segs) {
		for (auto& seg : segs) {
			if (seg == "equipment") seg = "atequipment";
		}
		return segs;
	};

	std::vector<std::vector<std::string>> candidates;
	auto renamed = applyRenames(outs);
	candidates.push_back(renamed);
	if (renamed != outs) candidates.push_back(outs);

	for (auto& segs : candidates) {
		// NPK file basename: "sprite_" + segments[0..N-1] joined by "_"
		// (the last segment is the .img filename and stays out of the NPK name)
		std::string npkBasename = "sprite";
		for (size_t i = 0; i + 1 < segs.size(); i++) {
			npkBasename += "_" + segs[i];
		}
		PvfString::toLower(npkBasename);

		auto itPath = g_npkBasenameToPath.find(npkBasename);
		if (itPath == g_npkBasenameToPath.end()) continue;

		// Ensure the NPK is unpacked. unpack() populates GlobalTable with
		// every IMG it contains, keyed by the full "sprite/.../<name>.img" path.
		auto [it, inserted] = GlobalFileTable.emplace(itPath->second, nullptr);
		if (inserted) {
			it->second = std::make_unique<NpkFile>(itPath->second);
		}
		auto& slot = *it->second;
		if (slot.imgNodes.empty()) {
			slot.unpack();
		}

		// IMG key inside GlobalTable: "sprite/" + segs joined by "/"
		std::string imgKey = "sprite";
		for (auto& seg : segs) imgKey += "/" + seg;

		auto itImg = GlobalTable.find(imgKey);
		if (itImg != GlobalTable.end() && itImg->second != nullptr) {
			if (!itImg->second->isValidIndex(index)) {
				throw std::runtime_error("frame index out of range: " + std::to_string(index)
					+ " (img " + imgKey + " has " + std::to_string(itImg->second->getNodeCount()) + " frame(s))");
			}
			return (*itImg->second)[index];
		}
	}

	throw std::runtime_error("sprite not found in any NPK: " + path);
}
