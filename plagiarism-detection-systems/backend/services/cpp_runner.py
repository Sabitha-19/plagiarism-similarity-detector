"""Runs the compiled C++ DSA binaries and parses their JSON stdout."""
import json
import os
import subprocess
import tempfile

from config import BIN_DIR


class AlgorithmError(Exception):
    pass


def _write_token_file(tokens):
    fd, path = tempfile.mkstemp(suffix=".tokens", prefix="pds_")
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        for tok in tokens:
            fh.write(tok.replace("\n", " ") + "\n")
    return path


def _run_binary(name, *args, timeout=20):
    binary_path = os.path.join(BIN_DIR, name)
    if not os.path.exists(binary_path):
        raise AlgorithmError(
            f"Compiled binary '{name}' not found. Build it with g++ into "
            f"algorithms/bin (see README)."
        )
    try:
        result = subprocess.run(
            [binary_path, *args],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise AlgorithmError(f"{name} timed out") from exc

    if result.returncode != 0:
        raise AlgorithmError(f"{name} failed: {result.stderr.strip()}")
    try:
        return json.loads(result.stdout.strip())
    except json.JSONDecodeError as exc:
        raise AlgorithmError(f"{name} returned invalid JSON: {result.stdout}") from exc


def run_all(tokens_a, tokens_b):
    """Run every DSA algorithm on two token streams and return their raw
    JSON outputs, keyed by algorithm name."""
    path_a = _write_token_file(tokens_a)
    path_b = _write_token_file(tokens_b)
    try:
        return {
            "rabin_karp": _run_binary("rabin_karp", path_a, path_b),
            "hashing": _run_binary("hashing", path_a, path_b),
            "lcs": _run_binary("lcs", path_a, path_b),
            "edit_distance": _run_binary("edit_distance", path_a, path_b),
        }
    finally:
        for p in (path_a, path_b):
            try:
                os.remove(p)
            except OSError:
                pass
