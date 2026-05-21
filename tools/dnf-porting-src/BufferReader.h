
#pragma once
#include <cstdint>
#include <cstring>
#include <string>

class BufferReader
{
public:
	BufferReader(const uint8_t* buffer, int32_t len) : buffer(buffer), len(len) {}
	template <typename T>
	inline T read()
	{
		T all{};
		if (offset + (int32_t)sizeof(T) > len) {
			eof = true;
			offset = len;
			return all;
		}
		std::memcpy(&all, buffer + offset, sizeof(T));
		offset += sizeof(T);
		return all;
	}

	inline auto readAsciiString(int32_t len_) -> std::string {
		if (offset + len_ > len) {
			eof = true;
			std::string str = { buffer + offset, buffer + this->len };
			offset = this->len;
			return str;
		}
		std::string str = { buffer + offset ,buffer + offset + len_ };
		offset += len_;
		return str;
	}

	inline auto getOffset() const { return offset; }
	inline auto setOffset(int32_t off) { offset = off; eof = (off >= len); }
	inline auto hasRemaining(int32_t n) const { return offset + n <= len; }
	inline auto isEof() const { return eof; }

private:
	const uint8_t* buffer;
	int32_t len;
	int32_t offset = 0;
	bool eof = false;
};
