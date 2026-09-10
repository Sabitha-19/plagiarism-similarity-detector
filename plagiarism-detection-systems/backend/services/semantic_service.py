"""Semantic similarity scoring.

Tries to use Sentence Transformers (all-MiniLM-L6-v2) for real embedding
similarity, matching the project's original design. Sentence Transformers
pulls in PyTorch, which is a large, memory-hungry dependency that is not
guaranteed to be available on every deployment target (e.g. small Railway
instances). To keep the app usable everywhere, this module falls back to a
pure-Python TF-IDF cosine similarity if the model can't be loaded, and is
explicit in the response about which method actually ran.
"""
import math
import re
from collections import Counter

from config import SEMANTIC_MODEL_NAME

_model = None
_model_load_attempted = False
_model_load_error = None

WORD_RE = re.compile(r"[a-zA-Z0-9']+")


def _get_model():
    global _model, _model_load_attempted, _model_load_error
    if _model_load_attempted:
        return _model
    _model_load_attempted = True
    try:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer(SEMANTIC_MODEL_NAME)
    except Exception as exc:  # noqa: BLE001 - any load failure -> fallback
        _model_load_error = str(exc)
        _model = None
    return _model


def _embedding_similarity(text_a, text_b):
    model = _get_model()
    if model is None:
        return None
    try:
        import numpy as np
        vectors = model.encode([text_a, text_b])
        a, b = np.asarray(vectors[0]), np.asarray(vectors[1])
        denom = (np.linalg.norm(a) * np.linalg.norm(b))
        if denom == 0:
            return 0.0
        cosine = float(np.dot(a, b) / denom)
        return max(0.0, min(1.0, cosine)) * 100.0
    except Exception:
        return None


def _tfidf_cosine_similarity(text_a, text_b):
    """Dependency-free TF-IDF cosine similarity fallback."""
    tokens_a = WORD_RE.findall(text_a.lower())
    tokens_b = WORD_RE.findall(text_b.lower())
    if not tokens_a or not tokens_b:
        return 0.0

    tf_a, tf_b = Counter(tokens_a), Counter(tokens_b)
    vocab = set(tf_a) | set(tf_b)

    docs_with_term = {
        term: (term in tf_a) + (term in tf_b) for term in vocab
    }
    idf = {
        term: math.log((2 + 1) / (docs_with_term[term] + 1)) + 1
        for term in vocab
    }

    def vector(tf, length):
        return {t: (count / length) * idf[t] for t, count in tf.items()}

    vec_a = vector(tf_a, len(tokens_a))
    vec_b = vector(tf_b, len(tokens_b))

    dot = sum(vec_a[t] * vec_b.get(t, 0.0) for t in vec_a)
    norm_a = math.sqrt(sum(v * v for v in vec_a.values()))
    norm_b = math.sqrt(sum(v * v for v in vec_b.values()))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    cosine = dot / (norm_a * norm_b)
    return max(0.0, min(1.0, cosine)) * 100.0


def similarity(text_a, text_b):
    """Returns (score_0_to_100, method_used)."""
    score = _embedding_similarity(text_a, text_b)
    if score is not None:
        return score, f"sentence-transformers ({SEMANTIC_MODEL_NAME})"
    return _tfidf_cosine_similarity(text_a, text_b), "tfidf-cosine-fallback"
