
#include "PvfNode.h"
#include "PvfReader.h"
#include "PvfAnimation.h"
#include "PvfDocument.h"
#include "PvfString.h"
#include <assert.h>

auto PvfNode::unpack() -> std::shared_ptr<PvfScript>
{
	if (pvfScript != nullptr)
	{
		return pvfScript;
	}
	auto buffer = expand();

	// Strip ".bak" composite suffix: a .mob.bak / .atk.bak / .obj.bak is a
	// backup of the inner format. Dispatch on the inner extension.
	std::string effectiveName = fileName;
	if (PvfString::endWith(effectiveName, ".bak")) {
		effectiveName = effectiveName.substr(0, effectiveName.length() - 4);
	}

	if (PvfString::endWith(effectiveName, ".ani"))
	{
		pvfScript = std::make_shared<PvfAnimation>(buffer.get(), getComputedFileLength(),reader);
	}
	else if (PvfString::endWith(effectiveName, ".str")
		|| PvfString::endWith(effectiveName, ".nut")
		|| PvfString::endWith(effectiveName, ".lst")
		|| PvfString::endWith(effectiveName, ".txt")
		|| PvfString::endWith(effectiveName, ".rtf")
		|| PvfString::endWith(effectiveName, ".info")
		|| PvfString::endWith(effectiveName, ".glist")
		|| PvfString::endWith(effectiveName, ".kor")
		|| PvfString::endWith(effectiveName, ".jap")
		|| PvfString::endWith(effectiveName, ".xml"))
	{
		pvfScript = std::make_shared<PvfTextScript>(buffer.get(), getComputedFileLength(), reader);
	}
	else if (PvfString::endWith(effectiveName, ".exe")
		|| PvfString::endWith(effectiveName, ".dat")
		|| PvfString::endWith(effectiveName, ".img")
		|| PvfString::endWith(effectiveName, ".bin")
		|| PvfString::endWith(effectiveName, ".ogg")
		|| PvfString::endWith(effectiveName, ".wav")
		|| PvfString::endWith(effectiveName, ".png")
		|| PvfString::endWith(effectiveName, ".jpg"))
	{
		// Raw binary: caller inspects magic + size, opt-in base64 via --with-data.
		pvfScript = std::make_shared<PvfRawScript>(buffer.get(), getComputedFileLength());
		// expand() returned a unique_ptr that goes out of scope after this
		// function — PvfRawScript references it, so we must keep the bytes
		// alive. The simplest fix: cache buffer ownership on the node.
		ownedBuffer = std::move(buffer);
	}
	else
	{
		pvfScript = std::make_shared<PvfDocument>(buffer.get(), getComputedFileLength(), reader);
	}
	pvfScript->unpack();
	return pvfScript;
}

auto PvfNode::expand() -> std::unique_ptr<uint8_t[]>
{
	if (fileLength > 0) {
		auto computedFileLength = (int32_t)((fileLength + 3L) & 4294967292L);
		reader->setPosition(relativeOffset);
		auto bytes = reader->readBytes(computedFileLength);
		reader->decrypt(bytes.get(), computedFileLength, fileCrc32);
	
		for (int32_t i = 0; i < (computedFileLength - fileLength); i++)
		{
			bytes.get()[fileLength + i] = 0;
		}
		return bytes;
	} 
	return nullptr;
}


auto PvfNode::getComputedFileLength() const -> int32_t
{
	return (int32_t)((fileLength + 3L) & 4294967292L);
}


PvfTreeNode PvfTreeNode::nullNode = {};

auto PvfTreeNode::operator[](const std::string& path) ->  PvfTreeNode&
{
	if (auto iter = children.find(path); iter != children.end()) {
		return *iter->second;
	}
	return PvfTreeNode::nullNode;
}

auto PvfTreeNode::getByPath(const std::string& path) ->  PvfTreeNode&
{
	std::vector<std::string> outs;
	PvfString::split(path, "/", outs);
	PvfTreeNode * node = this;
	for (auto & path : outs)
	{
		node = &(*node)[path];
	}
	return *node;
}

auto PvfTreeNode::unpack() ->std::shared_ptr< PvfScript>
{
	assert(node != nullptr); return node->unpack();
}
