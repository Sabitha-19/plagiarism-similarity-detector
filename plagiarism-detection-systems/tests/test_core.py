"""Unit tests covering preprocessing, hybrid scoring, and classification.
Run with: pytest -q  (compile the C++ binaries first, see README)
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import services.file_service as file_service  # noqa: E402
import services.scoring_service as scoring_service  # noqa: E402


def test_preprocess_text_lowercases_and_tokenizes():
    result = file_service.preprocess_text("Hello   WORLD, it's Fine.")
    assert result["tokens"] == ["hello", "world", "it's", "fine"]


def test_preprocess_code_strips_comments():
    code = "int x = 1; // comment\nint y = 2;"
    result = file_service.preprocess_code(code, "cpp")
    assert "comment" not in result["normalized"]


def test_preprocess_code_normalizes_identifiers():
    code_a = "int total = a + b;"
    code_b = "int sum = x + y;"
    norm_a = file_service.preprocess_code(code_a, "cpp")["normalized_tokens"]
    norm_b = file_service.preprocess_code(code_b, "cpp")["normalized_tokens"]
    assert norm_a == norm_b  # same shape once identifiers are normalized


def test_hybrid_score_is_weighted_average():
    scores = {
        "rabin_karp": 100, "hashing": 100, "lcs": 100,
        "edit_distance": 100, "semantic": 100,
    }
    assert scoring_service.hybrid_score(scores) == 100.0

    scores_zero = {k: 0 for k in scores}
    assert scoring_service.hybrid_score(scores_zero) == 0.0


def test_classification_bands():
    assert scoring_service.classify(10) == "Very Low Similarity"
    assert scoring_service.classify(35) == "Low Similarity"
    assert scoring_service.classify(55) == "Moderate Similarity"
    assert scoring_service.classify(75) == "High Similarity"
    assert scoring_service.classify(95) == "Very High Similarity"
    assert scoring_service.classify(80) == "High Similarity"
