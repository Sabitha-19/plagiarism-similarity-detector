#pragma once
#include <cstdint>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

// Tokens are stored one per line in the input files (produced by the
// Python preprocessing step), so newlines inside a token are not possible.
inline std::vector<std::string> readTokens(const std::string &path) {
    std::vector<std::string> tokens;
    std::ifstream in(path);
    std::string line;
    while (std::getline(in, line)) {
        if (!line.empty()) tokens.push_back(line);
    }
    return tokens;
}

inline std::string jsonEscape(const std::string &s) {
    std::string out;
    out.reserve(s.size());
    for (char c : s) {
        switch (c) {
            case '"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            default: out += c;
        }
    }
    return out;
}
