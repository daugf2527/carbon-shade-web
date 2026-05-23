
#pragma once
#include <string>
#include <string_view>
#include <vector>
#include <stdarg.h>
#include <functional>
#include <memory>

namespace PvfString
{

	// O(n) zero-allocation split. The string_view results alias `input`, so
	// the caller MUST ensure `input` outlives `outs`. `outs` is cleared first
	// and may be reused across calls (preserves capacity) to avoid per-call
	// allocations in hot loops like PvfReader::mapping (~370K iterations).
	auto split(std::string_view input, std::string_view delimiter, std::vector<std::string_view>& outs) -> void;

	// Owning-string convenience overload; allocates one std::string per token.
	// Prefer the string_view variant in hot paths and convert only at use.
	auto split(std::string_view input, std::string_view delimiter, std::vector<std::string>& outs) -> void;

	auto startWith(const std::string& str, const std::string& start) -> bool;
	auto contains(const std::string& str, const std::string& start) -> bool;
	auto endWith(const std::string& str, const std::string& start) -> bool;
	auto trim(std::string& str,const std::string & trimStr = " ") -> void;
	auto toLower(std::string& data) -> void;
#ifdef _WIN32
	static const std::string delimiter = "\\";
#else
	static const std::string delimiter = "/";
#endif
};
