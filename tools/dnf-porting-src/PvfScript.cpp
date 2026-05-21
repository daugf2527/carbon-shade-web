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
	//libIconv ��(BIG5�ַ�����) ת��'��'��ʱ����ж�
	//ʹ��BIG5HKSCS��������ַ���
	char* outBuffer = new char[len * 2];
	memset(outBuffer, 0, len * 2);

	//auto charset = tellenc(buffer, len);
	/*if (/ *charset == std::string("big5") || * /charset == std::string("binary")) {
		charset = PvfReader::ENCODING;
	}
*/
	int32_t retLen = 0;
	if (buffer && len > 0)
	{
		retLen = reader->codeConvert(PvfReader::ENCODING, "UTF-8", (const char*)buffer, len, outBuffer, len * 2);
		str = {outBuffer};
	}
	delete[] outBuffer;
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
