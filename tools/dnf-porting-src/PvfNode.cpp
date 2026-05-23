
#include "PvfNode.h"
#include "PvfReader.h"
#include "PvfAnimation.h"
#include "PvfDocument.h"
#include "PvfString.h"
#include <assert.h>
#include <stdexcept>

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
		pvfScript = std::make_shared<PvfDocument>(buffer.get(), getComputedFileLength(), reader, fileName);
	}
	pvfScript->unpack();
	return pvfScript;
}

auto PvfNode::expand() -> std::unique_ptr<uint8_t[]>
{
	if (fileLength > 0) {
		// Audit F11: (fileLength + 3L) & 4294967292L can wrap to INT32_MIN
		// when fileLength is near INT32_MAX, causing make_unique<uint8_t[]>
		// to receive a huge size_t. Cap defensively before bitmask.
		if (fileLength > (1 << 28)) {  // 256 MB per file is far beyond real PVF entries
			fprintf(stderr, "[ERROR] PvfNode::expand: implausible fileLength=%d for %s\n",
				fileLength, fileName.c_str());
			return nullptr;
		}
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
	// Audit F20: assert() is no-op in Release. Resolved nullNode (returned
	// when path lookup misses) has node=nullptr → null deref. Surface the
	// failure explicitly so the caller can decide.
	if (node == nullptr) {
		throw std::runtime_error("PvfTreeNode::unpack: tree node has no underlying PvfNode (path not resolved)");
	}
	return node->unpack();
}
