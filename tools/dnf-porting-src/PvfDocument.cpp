#include "PvfDocument.h"
#include "PvfNode.h"
#include <iostream>
#include <cstring>
#include "PvfReader.h"
#include "ValueType.h"
#include <stack>
#include <unordered_set>
#include "PvfString.h"
#include "BufferReader.h"



PvfDocument::PvfDocument(const uint8_t* buffer, int32_t len, PvfReader* reader,
                         const std::string& filename)
	:buffer(buffer),len(len),pvfReader(reader),filename(filename)
{
	type = PvfScriptType::Document;
}


auto PvfDocument::unpack() -> void
{
	if (len > 7) {
		BufferReader reader(buffer, len);
		auto header = reader.read<int16_t>();

		std::unordered_set<std::string> tags;

		while (reader.hasRemaining(5))
		{
			auto type = reader.read<int8_t>();
			if (type >= 2 && type <= 10) {
				auto index = reader.read<int32_t>();
				if (type == ValueType::Section)
				{
					tags.emplace(pvfReader->lookupBin(index));
				}
			}
		}

		reader.setOffset(2);
		node = &root;
		std::stack<Node*> stack;
		stack.push(node);


		while (reader.hasRemaining(5))
		{
			auto type = reader.read<int8_t>(); //bounds-guarded: hasRemaining(5) ensures type + int32 index fit

			if (type >= 2 && type <= 10)
			{
				auto index = reader.read<int32_t>();

				switch (type) {
				case ValueType::IntEx:
				case ValueType::Int://2
				{
					node->addAttribute(index);
				}
				break;
				case ValueType::Float://4
				{
					float f = *reinterpret_cast<float*>(&index);
					node->addAttribute(f);
				}
				break;

				case ValueType::Section:
				{
					auto name = pvfReader->lookupBin(index);
					auto endTagName = name;
					endTagName.insert(endTagName.begin() + 1, '/');

					if(!PvfString::startWith(name,"[/")){//Start Node
						
						PvfString::trim(name, "[");
						PvfString::trim(name, "]");
						if (node != nullptr && !node->hasEndTag && node != &root) 
						{
							pop(stack, name);
						}
						if (node != nullptr) // && node->hasEndTag
						{//new node is a child in pre-node
							auto& newNode = node->children[name].emplace_back();
							newNode.name = name;
							newNode.hasEndTag = tags.count(endTagName);
							stack.push(&newNode);
							node = &newNode;
						}
					}
					else //end Node
					{
						PvfString::trim(name, "[/");
						PvfString::trim(name, "]");
						pop(stack, name);
					}
					
				}
				break;

				case ValueType::String://Child
				{
					node->addAttribute(pvfReader->lookupBin(index));
				}
				break;
				case ValueType::Command:
				case ValueType::CommandSeparator:
				{
					node->addAttribute(pvfReader->lookupBin(index));
				}
				break;

				case ValueType::StringLink:
					if (auto str = pvfReader->lookupBin(index); str != "") {
						node->addLinkAttribute(pvfReader->stringStringMap[str]);
						//std::cout<<str<<"  "<<pvfReader->stringStringMap[str]<<std::endl;
					}
					break;
				}
			}
			else
			{
				// Unknown type byte: log once-per-file would be ideal but for now
				// just skip the next 4 bytes (index) to keep stream synchronized.
				std::cerr << "Unknown type in pvf node " << (int32_t)type << std::endl;
				reader.read<int32_t>();
			}
		}
	}

	// L2: cancel*.skl filename-driven dual-semantics. Runs after the byte
	// stream is fully parsed so we operate on the populated section tree
	// rather than racing the parser state. Cheap (string compare + at most
	// 5 hash lookups), safe to call unconditionally.
	applyCancelDualSemantics();
}

auto PvfDocument::applyCancelDualSemantics() -> void
{
	if (filename.empty()) return;

	// Match `**/cancel*.skl`. We slice the basename off the last `/` and check
	// `cancel` prefix + `.skl` suffix. Case-insensitive to be defensive,
	// although the PVF tree stores lowercased paths.
	auto slashPos = filename.find_last_of('/');
	std::string base = (slashPos == std::string::npos) ? filename : filename.substr(slashPos + 1);
	std::string baseLower = base;
	PvfString::toLower(baseLower);
	if (baseLower.size() < std::strlen("cancel") + std::strlen(".skl")) return;
	if (baseLower.compare(0, 6, "cancel") != 0) return;
	if (baseLower.compare(baseLower.size() - 4, 4, ".skl") != 0) return;
	// Exclude the literal "cancel.skl" (no dual-semantics; pattern is
	// `cancel<source>.skl` per swordman-data-model §6.2).
	if (baseLower.size() == std::strlen("cancel.skl")) return;

	// Dual-semantics map (Tier-1 verified, swordman-data-model.md §6.2).
	// Section names use the same lowercase / trimmed form that the PVF parse
	// stage applies (see PvfDocument::unpack PvfString::trim calls).
	static const std::pair<const char*, const char*> kCancelAliases[] = {
		{"purchase cost",            "cancelWindowStart"},
		{"required level",           "cancelWindowDuration"},
		{"skill class",              "cancelGroup"},
		{"growtype maximum level",   "cancelWeaponMask"},
		{"skill fitness growtype",   "cancelTargetSlots"},
	};

	for (auto& [standard, alias] : kCancelAliases) {
		auto it = root.children.find(standard);
		if (it == root.children.end()) continue;
		for (auto& sectionNode : it->second) {
			sectionNode.aliases.emplace_back(alias);
		}
	}
}

auto PvfDocument::splitNode(const std::string& name) ->std::shared_ptr<IAttribute>
{
	std::vector<std::string> outs;
	PvfString::split(name, "/", outs);
	auto& pvfNode = root[outs[0]];
	Node * node = nullptr;
	int32_t i = 1;
	while (i < outs.size() - 1)//last 
	{
		node = &pvfNode[std::stoi(outs[i++])];
	}
	return node != nullptr ? node->attribute[std::stoi(outs[i])] : nullptr;
}

auto PvfDocument::pop(std::stack<Node*>& stack, const std::string& name) -> void
{
	// Audit F14: convert tail recursion to iteration to avoid C stack overflow
	// on deeply nested or pathologically-named PVF documents. Bounded by stack
	// size (the explicit std::stack) instead of native call frames.
	int32_t safetyDepth = 0;
	const int32_t kMaxDepth = 100000;
	while (node != nullptr && node != &root)
	{
		if (!stack.empty()) {
			stack.pop();
		}

		if (!stack.empty()) {
			node = stack.top();
		}
		else
		{
			node = nullptr;
		}

		if (node != nullptr && node->name == name) {
			// Would have recursed; continue the loop instead.
			if (++safetyDepth > kMaxDepth) {
				fprintf(stderr, "[ERROR] PvfDocument::pop: aborting at depth %d in %s\n",
					safetyDepth, filename.c_str());
				return;
			}
			continue;
		}
		break;
	}
}

PvfDocument::Node PvfDocument::nullNode;
