#pragma once
#include <cstdint>
#include <string>

class PvfReader;

enum PvfScriptType
{
	Animation,
	Text,
	Document,
	Binary
};

class PvfScript
{
public:
	virtual auto unpack() -> void = 0;
    inline auto& getType() const { return type; }
protected:
	PvfScriptType type;

};


class PvfTextScript : public PvfScript
{
public:
	PvfTextScript(const uint8_t* buffer, int32_t len, PvfReader* reader);
	auto unpack() -> void override;
	inline auto& getContent() const { return str; }
private:
	const uint8_t* buffer = nullptr;
	PvfReader* reader = nullptr;
	int32_t len = 0;
	std::string str;
};

// Raw binary blob — used for .exe (MZ), .img (Neople Image File), .dat, .bin,
// and any other format that isn't a PvfDocument/Animation/Text. Caller can
// inspect detected magic + size, and optionally request base64-encoded bytes.
class PvfRawScript : public PvfScript
{
public:
	PvfRawScript(const uint8_t* buffer, int32_t len);
	auto unpack() -> void override;
	inline auto getBuffer() const { return buffer; }
	inline auto getLength() const { return len; }
	inline auto& getFormatHint() const { return formatHint; }
private:
	const uint8_t* buffer = nullptr;
	int32_t len = 0;
	std::string formatHint;
};
