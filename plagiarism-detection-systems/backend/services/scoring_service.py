"""Combines individual algorithm scores into a hybrid final score."""
from config import CLASSIFICATION_BANDS, WEIGHTS


def hybrid_score(algorithm_scores):
    """algorithm_scores: dict with keys rabin_karp, hashing, lcs,
    edit_distance, semantic -> each a 0-100 float."""
    total = 0.0
    for key, weight in WEIGHTS.items():
        total += weight * algorithm_scores.get(key, 0.0)
    return round(min(100.0, max(0.0, total)), 2)


def classify(score):
    for upper_bound, label in CLASSIFICATION_BANDS:
        if score <= upper_bound:
            return label
    return CLASSIFICATION_BANDS[-1][1]
