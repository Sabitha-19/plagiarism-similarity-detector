// Rabin-Karp rolling-hash n-gram overlap.
// Usage: rabin_karp <tokens_file_1> <tokens_file_2> [n]
// Prints: {"score": <0-100>, "matched_ngrams": <int>, "total_ngrams": <int>}
#include <iostream>
#include <unordered_map>
#include "common.hpp"

static const uint64_t BASE = 257;
static const uint64_t MOD = 1000000007ULL;

std::vector<uint64_t> ngramHashes(const std::vector<std::string> &tokens, int n) {
    std::vector<uint64_t> hashes;
    if ((int)tokens.size() < n) return hashes;
    std::hash<std::string> strHash;
    for (size_t i = 0; i + n <= tokens.size(); ++i) {
        uint64_t h = 0;
        for (int j = 0; j < n; ++j) {
            h = (h * BASE + (uint64_t)(strHash(tokens[i + j]) % MOD)) % MOD;
        }
        hashes.push_back(h);
    }
    return hashes;
}

int main(int argc, char **argv) {
    if (argc < 3) {
        std::cerr << "usage: rabin_karp <file1> <file2> [n]" << std::endl;
        return 1;
    }
    int n = argc >= 4 ? std::stoi(argv[3]) : 5;

    auto tokens1 = readTokens(argv[1]);
    auto tokens2 = readTokens(argv[2]);

    auto h1 = ngramHashes(tokens1, n);
    auto h2 = ngramHashes(tokens2, n);

    std::unordered_map<uint64_t, int> counts1;
    for (auto h : h1) counts1[h]++;

    int matched = 0;
    std::unordered_map<uint64_t, int> used;
    for (auto h : h2) {
        auto it = counts1.find(h);
        if (it != counts1.end() && used[h] < it->second) {
            matched++;
            used[h]++;
        }
    }

    int total = std::max((int)h1.size(), (int)h2.size());
    double score = total == 0 ? 0.0 : (100.0 * matched) / total;
    if (score > 100.0) score = 100.0;

    std::cout << "{\"score\": " << score
               << ", \"matched_ngrams\": " << matched
               << ", \"total_ngrams\": " << total << "}" << std::endl;
    return 0;
}
