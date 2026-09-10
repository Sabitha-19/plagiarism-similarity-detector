// Token-level Levenshtein edit distance, normalized to a 0-100 similarity.
// Usage: edit_distance <tokens_file_1> <tokens_file_2>
#include <iostream>
#include <vector>
#include <algorithm>
#include "common.hpp"

static const size_t MAX_TOKENS = 1500;

int main(int argc, char **argv) {
    if (argc < 3) {
        std::cerr << "usage: edit_distance <file1> <file2>" << std::endl;
        return 1;
    }
    auto a = readTokens(argv[1]);
    auto b = readTokens(argv[2]);

    bool truncated = a.size() > MAX_TOKENS || b.size() > MAX_TOKENS;
    if (a.size() > MAX_TOKENS) a.resize(MAX_TOKENS);
    if (b.size() > MAX_TOKENS) b.resize(MAX_TOKENS);

    size_t n = a.size(), m = b.size();
    std::vector<int> prev(m + 1), curr(m + 1);
    for (size_t j = 0; j <= m; ++j) prev[j] = (int)j;

    for (size_t i = 1; i <= n; ++i) {
        curr[0] = (int)i;
        for (size_t j = 1; j <= m; ++j) {
            if (a[i - 1] == b[j - 1]) {
                curr[j] = prev[j - 1];
            } else {
                curr[j] = 1 + std::min({prev[j], curr[j - 1], prev[j - 1]});
            }
        }
        std::swap(prev, curr);
    }

    int distance = prev[m];
    double denom = std::max(n, m);
    double score = denom == 0 ? 100.0 : (100.0 * (1.0 - (double)distance / denom));
    if (score < 0.0) score = 0.0;

    std::cout << "{\"score\": " << score
               << ", \"edit_distance\": " << distance
               << ", \"truncated\": " << (truncated ? "true" : "false") << "}" << std::endl;
    return 0;
}
