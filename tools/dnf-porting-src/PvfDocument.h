
#pragma once
#include <cstdint>
#include <vector>
#include <memory>
#include <string>
#include <unordered_map>
#include <stack>
#include "PvfScript.h"

class PvfReader;

class PvfDocument : public PvfScript
{
public:

	enum AttributeType
	{
		Number,
		String,
	};

	union DNumber
	{
		int32_t intValue;
		float floatValue;
	};

	struct IAttribute {
		AttributeType type;
		virtual ~IAttribute() = default;
		virtual std::string toString() const { return ""; }
	};

	struct NumberAttribute final : public IAttribute {
		NumberAttribute() { type = Number; }
		DNumber value{};
		// Distinguishes ValueType::Float (raw 32-bit float bits) from
		// ValueType::Int/IntEx. The PVF wire format does not bake this into the
		// payload byte; we record it at parse time so JSON output can emit
		// {"t":"float","v":...} versus {"t":"int","v":...}.
		bool isFloat = false;
		std::string toString() const override {
			return isFloat ? std::to_string(value.floatValue)
			               : std::to_string(value.intValue);
		}
	};

	struct StringAttribute final : public IAttribute {
		StringAttribute() { type = String; }
		std::string value;
		// True when this value originated from ValueType::StringLink (resolved
		// via stringStringMap). Lets JSON output tag it as {"t":"link",...} so
		// the importer can keep the symbolic indirection distinct from inline
		// {"t":"str",...} literals.
		bool isLink = false;
		std::string toString() const override { return value; }
	};

	struct Node
	{
		std::string name;
		std::vector<std::shared_ptr<IAttribute>> attribute;
		std::unordered_map<std::string, std::vector<Node>> children;
		// Alternative names for this section. Populated by post-unpack hooks
		// such as cancel*.skl dual-semantics remapping (L2). Empty otherwise.
		// See PvfDocument::applyCancelDualSemantics.
		std::vector<std::string> aliases;

		inline auto size() const { return attribute.size(); };
		inline auto& operator[](const std::string& n) { return children[n]; };

		auto addAttribute(float t) -> void {
			auto att = std::make_shared<NumberAttribute>();
			att->value.floatValue = t;
			att->isFloat = true;
			attribute.emplace_back(att);
		}
		auto addAttribute(int32_t t) -> void {
			auto att = std::make_shared<NumberAttribute>();
			att->value.intValue = t;
			attribute.emplace_back(att);
		}
		auto addAttribute(const std::string& t) -> void {
			auto att = std::make_shared<StringAttribute>();
			att->value = t;
			attribute.emplace_back(att);
		}
		// Variant for ValueType::StringLink so the resolved value is tagged
		// as a link in the JSON output rather than an inline string literal.
		auto addLinkAttribute(const std::string& t) -> void {
			auto att = std::make_shared<StringAttribute>();
			att->value = t;
			att->isLink = true;
			attribute.emplace_back(att);
		}

		bool hasEndTag = false;
	};

	// `filename` is the PVF-internal path of the source file (e.g.
	// "skill/swordman/cancelhardattack.skl"). Used by post-parse hooks for
	// filename-pattern-driven semantics, currently L2 cancel*.skl dual
	// semantics. Empty when constructed without filename context.
	PvfDocument(const uint8_t* buffer, int32_t len, PvfReader* reader,
	            const std::string& filename = "");
	auto unpack() -> void override;

	inline auto& getRoot() { return root; }
	inline auto& getFilename() const { return filename; }
	inline auto& operator[](const std::string& name) { return root[name]; }

private:
	auto splitNode(const std::string& name)->std::shared_ptr<IAttribute>;
	auto pop(std::stack<Node*>& stack, const std::string& name) -> void;
	// L2: when filename matches `**/cancel*.skl`, walk root.children and
	// attach cancel-context aliases to the 5 sections listed in
	// docs/research/2026-05-21-swordman-data-model.md §6.2.
	auto applyCancelDualSemantics() -> void;

	const uint8_t* buffer;
	int32_t len;
	PvfReader* pvfReader = nullptr;
	std::string filename;
	Node root;
	Node* node = nullptr;
	static Node nullNode;
};
