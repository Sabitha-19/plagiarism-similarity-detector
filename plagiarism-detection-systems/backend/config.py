"""Central configuration for the plagiarism detection system."""
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
REPORT_DIR = os.path.join(BASE_DIR, "reports")
BIN_DIR = os.path.join(BASE_DIR, "algorithms", "bin")
DB_PATH = os.path.join(BASE_DIR, "plagiarism.db")

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB

TEXT_EXTENSIONS = {"txt", "pdf", "docx"}
CODE_EXTENSIONS = {"c", "cpp", "py", "java", "js", "html", "css"}
ALLOWED_EXTENSIONS = TEXT_EXTENSIONS | CODE_EXTENSIONS

# Hybrid scoring weights (must sum to 1.0)
WEIGHTS = {
    "rabin_karp": 0.25,
    "hashing": 0.20,
    "lcs": 0.20,
    "edit_distance": 0.10,
    "semantic": 0.25,
}

# Upper bound (inclusive) -> label. Checked in ascending order.
CLASSIFICATION_BANDS = [
    (20.0, "Very Low Similarity"),
    (40.0, "Low Similarity"),
    (60.0, "Moderate Similarity"),
    (80.0, "High Similarity"),
    (100.01, "Very High Similarity"),
]

SEMANTIC_MODEL_NAME = "all-MiniLM-L6-v2"

for _d in (UPLOAD_DIR, REPORT_DIR, BIN_DIR):
    os.makedirs(_d, exist_ok=True)
