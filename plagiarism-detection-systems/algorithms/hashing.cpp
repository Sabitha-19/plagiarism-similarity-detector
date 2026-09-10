// Shingle hashing: builds a set of hashed n-grams per document and
// compares them with a Jaccard index. Complements Rabin-Karp's
// multiset/positional matching with a pure set-overlap signal.
// Usage: hashing <tokens_file_1> <tokens_file_2> [n]
#include <iostream>
#include <unordered_set>
#include "common.hpp"

static std::unordered_set<uint64_t> shingleSet(const std::vector<std::string> &tokens, int n) {
    std::unordered_set<uint64_t> set;
    if ((int)tokens.size() < n) return set;
    std::hash<std::string> strHash;
    for (size_t i = 0; i + n <= tokens.size(); ++i) {
        uint64_t h = 1469598103934665603ULL; // FNV offset basis
        for (int j = 0; j < n; ++j) {
            h ^= strHash(tokens[i + j]);
            h *= 1099511628211ULL; // FNV prime
        }
        set.insert(h);
    }
    return set;
}

int main(int argc, char **argv) {
    if (argc < 3) {
        std::cerr << "usage: hashing <file1> <file2> [n]" << std::endl;
        return 1;
    }
    int n = argc >= 4 ? std::stoi(argv[3]) : 3;

    auto s1 = shingleSet(readTokens(argv[1]), n);
    auto s2 = shingleSet(readTokens(argv[2]), n);

    int intersection = 0;
    const auto &smaller = s1.size() < s2.size() ? s1 : s2;
    const auto &larger = s1.size() < s2.size() ? s2 : s1;
    for (auto h : smaller) {
        if (larger.count(h)) intersection++;
    }

    size_t unionSize = s1.size() + s2.size() - intersection;
    double score = unionSize == 0 ? 0.0 : (100.0 * intersection) / (double)unionSize;

    std::cout << "{\"score\": " << score
               << ", \"shared_shingles\": " << intersection
               << ", \"union_shingles\": " << unionSize << "}" << std::endl;
    return 0;
}
