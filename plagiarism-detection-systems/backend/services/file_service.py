"""File validation, text/code extraction, and preprocessing."""
import hashlib
import re
import uuid

from werkzeug.utils import secure_filename

from config import ALLOWED_EXTENSIONS, CODE_EXTENSIONS, UPLOAD_DIR

import os

CODE_COMMENT_PATTERNS = [
    re.compile(r"//.*?$", re.MULTILINE),
    re.compile(r"/\*.*?\*/", re.DOTALL),
    re.compile(r"#.*?$", re.MULTILINE),  # python / shell style
    re.compile(r"<!--.*?-->", re.DOTALL),
]

IDENTIFIER_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
KEYWORDS = {
    "if", "else", "for", "while", "return", "def", "class", "import", "from",
    "int", "float", "double", "char", "void", "public", "private", "static",
    "function", "var", "let", "const", "new", "this", "self", "true", "false",
    "null", "None", "True", "False", "try", "except", "catch", "finally",
    "break", "continue", "switch", "case", "struct", "namespace", "include",
}


class FileValidationError(Exception):
    pass


def get_extension(filename):
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def is_allowed(filename):
    return get_extension(filename) in ALLOWED_EXTENSIONS


def is_code(file_type):
    return file_type in CODE_EXTENSIONS


def save_upload(file_storage):
    """Validate, save to disk with a UUID-prefixed name, return metadata."""
    filename = secure_filename(file_storage.filename or "")
    if not filename:
        raise FileValidationError("Missing file name.")

    ext = get_extension(filename)
    if ext not in ALLOWED_EXTENSIONS:
        raise FileValidationError(f"File type '.{ext}' is not supported.")

    data = file_storage.read()
    if not data:
        raise FileValidationError("Uploaded file is empty.")

    stored_name = f"{uuid.uuid4().hex}_{filename}"
    stored_path = os.path.join(UPLOAD_DIR, stored_name)
    with open(stored_path, "wb") as fh:
        fh.write(data)

    sha256 = hashlib.sha256(data).hexdigest()
    return {
        "file_name": filename,
        "stored_path": stored_path,
        "file_type": ext,
        "sha256": sha256,
    }


def extract_text(stored_path, file_type):
    """Return the raw extracted text for a stored submission."""
    if file_type == "pdf":
        return _extract_pdf(stored_path)
    if file_type == "docx":
        return _extract_docx(stored_path)
    with open(stored_path, "rb") as fh:
        raw = fh.read()
    return raw.decode("utf-8", errors="replace")


def _extract_pdf(path):
    try:
        from pypdf import PdfReader
    except ImportError:  # pragma: no cover
        from PyPDF2 import PdfReader
    try:
        reader = PdfReader(path)
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    except Exception as exc:
        raise FileValidationError(f"Could not extract text from PDF: {exc}")


def _extract_docx(path):
    try:
        import docx
    except ImportError as exc:  # pragma: no cover
        raise FileValidationError("python-docx is not installed.") from exc
    try:
        document = docx.Document(path)
        return "\n".join(p.text for p in document.paragraphs)
    except Exception as exc:
        raise FileValidationError(f"Could not extract text from DOCX: {exc}")


def preprocess_text(raw_text):
    """Lowercase, normalize whitespace, tokenize plain text."""
    normalized = re.sub(r"\s+", " ", raw_text.strip().lower())
    tokens = re.findall(r"[a-z0-9']+", normalized)
    return {"raw": raw_text, "normalized": normalized, "tokens": tokens}


def preprocess_code(raw_code, file_type):
    """Strip comments conservatively, normalize whitespace, tokenize,
    and build an identifier-normalized token stream for rename-tolerant LCS."""
    stripped = raw_code
    for pattern in CODE_COMMENT_PATTERNS:
        stripped = pattern.sub(" ", stripped)

    normalized = re.sub(r"\s+", " ", stripped.strip())
    tokens = re.findall(r"[A-Za-z_][A-Za-z0-9_]*|[0-9]+(?:\.[0-9]+)?|[^\sA-Za-z0-9_]", normalized)

    normalized_tokens = []
    for tok in tokens:
        if IDENTIFIER_RE.fullmatch(tok) and tok not in KEYWORDS:
            normalized_tokens.append("IDENT")
        else:
            normalized_tokens.append(tok)

    return {
        "raw": raw_code,
        "normalized": normalized,
        "tokens": tokens,
        "normalized_tokens": normalized_tokens,
    }


def preprocess(stored_path, file_type):
    raw = extract_text(stored_path, file_type)
    if is_code(file_type):
        return preprocess_code(raw, file_type)
    return preprocess_text(raw)
