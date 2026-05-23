
#include <ctime>
#include <stdio.h>
#include <string>
#include <memory.h>
#include <algorithm>
#include "PvfString.h"


auto PvfString::startWith(const std::string& str, const std::string& start) -> bool
{
	return str.compare(0, start.size(), start) == 0;
}

auto PvfString::contains(const std::string& str, const std::string& start) -> bool
{
	return str.find(start) != std::string::npos;
}

auto PvfString::endWith(const std::string& str, const std::string& start) -> bool
{
	return str.compare(str.length() - start.length(), start.size(), start) == 0;
}

auto PvfString::split(std::string_view input, std::string_view delimiter, std::vector<std::string_view>& outs) -> void
{
	outs.clear();
	if (delimiter.empty()) {
		outs.emplace_back(input);
		return;
	}
	// O(n) scan: walk find() forward and slice substrings as string_views.
	// The original implementation rebuilt `input` after every match via
	// `input.erase(0, pos + delimiter.length())`, giving O(n²) behavior and
	// a fresh allocation per token across the ~370K-iteration mapping loop.
	size_t pos = 0;
	while (pos <= input.size()) {
		size_t found = input.find(delimiter, pos);
		if (found == std::string_view::npos) {
			outs.emplace_back(input.substr(pos));
			return;
		}
		outs.emplace_back(input.substr(pos, found - pos));
		pos = found + delimiter.size();
	}
}

auto PvfString::split(std::string_view input, std::string_view delimiter, std::vector<std::string>& outs) -> void
{
	outs.clear();
	if (delimiter.empty()) {
		outs.emplace_back(input);
		return;
	}
	size_t pos = 0;
	while (pos <= input.size()) {
		size_t found = input.find(delimiter, pos);
		if (found == std::string_view::npos) {
			outs.emplace_back(input.substr(pos));
			return;
		}
		outs.emplace_back(input.substr(pos, found - pos));
		pos = found + delimiter.size();
	}
}


auto PvfString::trim(std::string& str, const std::string& trimStr) -> void
{
	if (!str.empty())
	{
		str.erase(0, str.find_first_not_of(trimStr));
		str.erase(str.find_last_not_of(trimStr) + 1);
	}
}

auto PvfString::toLower(std::string& data) -> void
{
	std::transform(data.begin(), data.end(), data.begin(),
		[](unsigned char c) { return std::tolower(c); });
}

