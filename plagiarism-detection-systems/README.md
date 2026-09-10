# Similarity Bench — Plagiarism & Code-Similarity Detection

A hybrid text/source-code similarity detector: four C++ DSA algorithms
(Rabin–Karp, shingle hashing, LCS, edit distance) plus a semantic
similarity signal, combined into one weighted score, with a Flask API and
a small single-page UI.

> Reports automated similarity indicators only. It does not prove
> plagiarism and should not be the sole basis for disciplinary decisions.

## What changed from the original version

- **Rebuilt backend** — every service (`file_service`, `cpp_runner`,
  `scoring_service`, `semantic_service`, `comparison_service`,
  `report_service`) is implemented and wired together; comparisons run in
  a background thread with real stage-by-stage job progress, not a
  cosmetic timer.
- **Semantic similarity has a safe fallback.** It tries
  Sentence-Transformers (`all-MiniLM-L6-v2`) first; if that's not
  installed (see below) it automatically falls back to a dependency-free
  TF-IDF cosine similarity, so the app still works on small hosts.
- **Identifier-normalized LCS for code** actually runs now: renamed
  variables/functions are detected and reflected in the score, while the
  UI still highlights the real matched tokens from the original source.
- **New UI** — flat, hairline-bordered "lab bench" layout, drag-and-drop
  upload, a live progress bar, a score gauge, per-algorithm breakdown
  bars, and a side-by-side matched-token viewer.
- **Deploy-ready for Railway**: a `Dockerfile` that installs `g++`,
  compiles the algorithms, and runs `gunicorn`; `railway.toml` points at
  it directly.

## Local setup

```bash
python -m venv venv && source venv/bin/activate     # Windows: venv\Scripts\activate
pip install -r requirements.txt

mkdir -p algorithms/bin
g++ -std=c++17 -O2 algorithms/rabin_karp.cpp -o algorithms/bin/rabin_karp
g++ -std=c++17 -O2 algorithms/hashing.cpp -o algorithms/bin/hashing
g++ -std=c++17 -O2 algorithms/lcs.cpp -o algorithms/bin/lcs
g++ -std=c++17 -O2 algorithms/edit_distance.cpp -o algorithms/bin/edit_distance

python backend/app.py
```

Open `http://127.0.0.1:5000`.

Want real sentence-embedding semantic similarity instead of the TF-IDF
fallback? `pip install -r requirements-semantic.txt` (pulls in PyTorch,
~1-2 GB RAM, first-run model download). Everything else works the same
either way.

## Deploying to Railway

1. Push this repo to GitHub.
2. Railway → **New Project → Deploy from GitHub repo**.
3. Railway detects the `Dockerfile` and builds automatically — it
   installs `g++`, compiles the four algorithms, and installs Python deps.
4. Settings → Networking → **Generate Domain** once the deploy finishes.

Notes:
- `uploads/`, `reports/`, and `plagiarism.db` live on the container's
  ephemeral disk — fine for a demo, but wiped on redeploy. For real
  persistence, add a Railway volume or move to object storage + a hosted
  database.
- The default `requirements.txt` skips Sentence-Transformers so the build
  stays small and reliable on tight memory plans; swap in
  `requirements-semantic.txt` in the Dockerfile if your Railway plan has
  the RAM for it.

## Running tests

```bash
pytest -q
```

## API

See the original endpoint list below — all of these are implemented and
tested end-to-end:

- `POST /api/upload` — multipart `file` field
- `POST /api/compare` — `{submission_id_1, submission_id_2}` → `{job_id, comparison_id}`
- `POST /api/compare-against-all` — `{submission_id}` → `{job_id}`
- `GET /api/jobs/<job_id>` — poll for stage/progress/status
- `GET /api/results/<comparison_id>` — full breakdown + diff data
- `GET /api/history` / `DELETE /api/history/<comparison_id>`
- `GET /api/report/<comparison_id>` — PDF download
- `GET /api/health`
