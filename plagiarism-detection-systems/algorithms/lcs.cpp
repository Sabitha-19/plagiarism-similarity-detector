// Longest Common Subsequence over tokens, with contiguous matched-run
// extraction for UI highlighting. Large inputs are capped to keep the
// O(n*m) DP table bounded for a web request.
// Usage: lcs <tokens_file_1> <tokens_file_2>
#include <iostream>
#include <vector>
#include <array>
#include <algorithm>
#include "common.hpp"

static const size_t MAX_TOKENS = 1500;

int main(int argc, char **argv) {
    if (argc < 3) {
        std::cerr << "usage: lcs <file1> <file2>" << std::endl;
        return 1;
    }
    auto a = readTokens(argv[1]);
    auto b = readTokens(argv[2]);

    bool truncated = a.size() > MAX_TOKENS || b.size() > MAX_TOKENS;
    if (a.size() > MAX_TOKENS) a.resize(MAX_TOKENS);
    if (b.size() > MAX_TOKENS) b.resize(MAX_TOKENS);

    size_t n = a.size(), m = b.size();
    std::vector<std::vector<int>> dp(n + 1, std::vector<int>(m + 1, 0));

    for (size_t i = 1; i <= n; ++i) {
        for (size_t j = 1; j <= m; ++j) {
            if (a[i - 1] == b[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = std::max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    int lcsLen = dp[n][m];
    double denom = std::max(n, m);
    double score = denom == 0 ? 0.0 : (100.0 * lcsLen) / denom;

    // Backtrack to find matched (i, j) pairs, then collapse into
    // contiguous runs on the `a` side for highlighting.
    std::vector<std::pair<int, int>> matchedPairs;
    {
        size_t i = n, j = m;
        while (i > 0 && j > 0) {
            if (a[i - 1] == b[j - 1]) {
                matchedPairs.emplace_back((int)i - 1, (int)j - 1);
                i--; j--;
            } else if (dp[i - 1][j] >= dp[i][j - 1]) {
                i--;
            } else {
                j--;
            }
        }
    }
    std::reverse(matchedPairs.begin(), matchedPairs.end());

    std::vector<std::array<int, 4>> runs; // start_a, end_a, start_b, end_b
    for (size_t k = 0; k < matchedPairs.size(); ) {
        size_t start = k;
        while (k + 1 < matchedPairs.size() &&
               matchedPairs[k + 1].first == matchedPairs[k].first + 1 &&
               matchedPairs[k + 1].second == matchedPairs[k].second + 1) {
            k++;
        }
        runs.push_back({matchedPairs[start].first, matchedPairs[k].first,
                         matchedPairs[start].second, matchedPairs[k].second});
        k++;
    }

    std::cout << "{\"score\": " << score
               << ", \"lcs_length\": " << lcsLen
               << ", \"truncated\": " << (truncated ? "true" : "false")
               << ", \"matched_runs\": [";
    for (size_t r = 0; r < runs.size(); ++r) {
        if (r) std::cout << ", ";
        std::cout << "[" << runs[r][0] << ", " << runs[r][1] << ", "
                   << runs[r][2] << ", " << runs[r][3] << "]";
    }
    std::cout << "]}" << std::endl;
    return 0;
}
