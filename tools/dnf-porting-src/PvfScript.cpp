#include <cstring>
#include "PvfScript.h"
#include "PvfReader.h"
#include "tellenc.h"

PvfTextScript::PvfTextScript(const uint8_t* buffer, int32_t len, PvfReader* reader)
	:buffer(buffer),len(len),reader(reader)
{
	type = PvfScriptType::Text;
}

auto PvfTextScript::unpack() -> void
{
	if (!buffer || len <= 0) return;

	// CP949 → UTF-8 expansion is at most 3x. Use RAII so an exception (e.g.
	// codeConvert throws, str = {…} bad_alloc) doesn't leak the heap buffer.
	const size_t outSize = static_cast<size_t>(len) * 3 + 1;
	auto outBuffer = std::make_unique<char[]>(outSize);

	int32_t retLen = 0;
	retLen = reader->codeConvert(PvfReader::ENCODING, "UTF-8", (const char*)buffer, len, outBuffer.get(), outSize);
	str = { outBuffer.get() };
}

PvfRawScript::PvfRawScript(const uint8_t* buffer, int32_t len)
	: buffer(buffer), len(len)
{
	type = PvfScriptType::Binary;
}

auto PvfRawScript::unpack() -> void
{
	// Sniff the magic header so callers can route to the right downstream
	// parser (Squirrel decompiler, PE inspector, NPK image decoder, ...).
	if (!buffer || len < 4) { formatHint = "empty"; return; }
	if (buffer[0] == 'M' && buffer[1] == 'Z') {
		formatHint = "pe-executable";
	} else if (len >= 17 && std::memcmp(buffer, "Neople Image File", 17) == 0) {
		formatHint = "neople-image";
	} else if (buffer[0] == 0x1F && buffer[1] == 0x8B) {
		formatHint = "gzip";
	} else if (buffer[0] == 'P' && buffer[1] == 'K' && buffer[2] == 0x03 && buffer[3] == 0x04) {
		formatHint = "zip";
	} else {
		formatHint = "unknown";
	}
}
