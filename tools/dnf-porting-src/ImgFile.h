#pragma once
#include "Npk.h"
#include <assert.h>

class NpkFile;

struct ImgNode
{
	NpkTexture texture;

	uint32_t format;	//Ŀǰ��֪�������� 0x0E(1555��ʽ) 0x0F(4444��ʽ) 0x10(8888��ʽ) 0x11(�������κ����ݣ�������ָ����ͬ��һ֡)
	int32_t linkId;

	struct {
		int32_t keep;
		int32_t mapIndex;
		int32_t left;
		int32_t top;
		int32_t right;
		int32_t bottom;
		int32_t rotate;
	}zlibInfo;

	uint32_t offset;

	bool isLink;
	//
	std::string uniqueName;
	NpkFile* reader = nullptr;
	auto getData()->const std::vector<uint8_t>&;
	std::vector<uint8_t> input;
};

class ImgFile
{
public:

	static ImgFile nullNode;
	ImgFile(NpkFile* file);

	inline auto isValid() const { return this != &nullNode; }
	inline operator bool() const { return isValid(); }
	auto unpack() -> std::string;
	auto openColorBoard(std::vector<uint32_t>& color) -> void;
	auto openMapImages(int32_t size) -> void;
	inline auto getFileName() const -> std::string { return metaInfo.fileName; }
	inline auto getNodeCount() const { return nodes.size(); }
	auto expand() -> void;
	inline auto isValidIndex(int32_t index) const { return index >= 0 && static_cast<size_t>(index) < nodes.size(); }
	// Release builds turn assert() into a no-op, so out-of-range accesses
	// silently dereference invalid memory (uninitialized values for in-vector
	// out-of-bounds, segfault past capacity). The caller is responsible for
	// checking isValidIndex() first; pass it through if you can't.
	inline auto& operator[](int32_t index) { assert(isValidIndex(index)); return nodes[index]; }
private:
	NpkIndex metaInfo;
	ImgHeader header;
	NpkFile* file = nullptr;
	bool oldVersion = false;

	std::vector<ImgNode> nodes;
	std::vector<uint32_t> colorBoard;
	std::vector<std::vector<uint32_t>> colorBoards;
	std::vector<MapImage> mapImages;
	std::vector<int32_t> mapImagesOffset;
	
};