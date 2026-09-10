"""Flask application entry point: routes for upload, compare, jobs,
results, history, and PDF reports. Also serves the frontend."""
import json
import logging
import os
import sys
import threading
import uuid

from flask import Flask, jsonify, request, render_template, send_file, abort

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import config
import database.db as db
import services.comparison_service as comparison_service
import services.file_service as file_service
import services.report_service as report_service

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

FRONTEND_DIR = os.path.join(config.BASE_DIR, "frontend")

app = Flask(
    __name__,
    template_folder=os.path.join(FRONTEND_DIR, "templates"),
    static_folder=os.path.join(FRONTEND_DIR, "static"),
)
app.config["MAX_CONTENT_LENGTH"] = config.MAX_UPLOAD_BYTES

db.init_db()


# ---------------------------------------------------------------- helpers

def _json_error(message, status=400):
    return jsonify({"error": message}), status


def _comparison_public(comparison):
    if comparison is None:
        return None
    out = dict(comparison)
    if out.get("scores"):
        out["scores"] = json.loads(out["scores"])
    if out.get("matches"):
        out["matches"] = json.loads(out["matches"])
    return out


def _job_public(job):
    if job is None:
        return None
    out = dict(job)
    if out.get("result"):
        out["result"] = json.loads(out["result"])
    return out


# ------------------------------------------------------------------ pages

@app.route("/")
def index():
    return render_template("index.html")


# ------------------------------------------------------------------- API

@app.route("/api/upload", methods=["POST"])
def upload():
    if "file" not in request.files:
        return _json_error("No file part named 'file' in the request.")
    file_storage = request.files["file"]
    if not file_storage or file_storage.filename == "":
        return _json_error("No file selected.")

    try:
        meta = file_service.save_upload(file_storage)
    except file_service.FileValidationError as exc:
        return _json_error(str(exc), status=422)

    submission_id = db.insert_submission(
        meta["file_name"], meta["stored_path"], meta["file_type"], meta["sha256"]
    )
    return jsonify({
        "submission_id": submission_id,
        "file_name": meta["file_name"],
        "file_type": meta["file_type"],
        "sha256": meta["sha256"],
        "message": "File uploaded and validated successfully.",
    })


@app.route("/api/compare", methods=["POST"])
def compare():
    payload = request.get_json(silent=True) or {}
    id1, id2 = payload.get("submission_id_1"), payload.get("submission_id_2")
    if not id1 or not id2:
        return _json_error("submission_id_1 and submission_id_2 are required.")
    if id1 == id2:
        return _json_error("Choose two different submissions to compare.")

    sub1, sub2 = db.get_submission(id1), db.get_submission(id2)
    if not sub1 or not sub2:
        return _json_error("One or both submissions were not found.", status=404)

    comparison_id = db.create_comparison(id1, id2)
    job_id = uuid.uuid4().hex
    db.create_job(job_id, comparison_id=comparison_id)

    thread = threading.Thread(
        target=comparison_service.run_comparison,
        args=(job_id, comparison_id, sub1, sub2),
        daemon=True,
    )
    thread.start()

    return jsonify({"job_id": job_id, "comparison_id": comparison_id})


@app.route("/api/compare-against-all", methods=["POST"])
def compare_against_all():
    payload = request.get_json(silent=True) or {}
    submission_id = payload.get("submission_id")
    if not submission_id:
        return _json_error("submission_id is required.")
    if not db.get_submission(submission_id):
        return _json_error("Submission not found.", status=404)

    job_id = uuid.uuid4().hex
    db.create_job(job_id)

    thread = threading.Thread(
        target=comparison_service.run_compare_against_all,
        args=(job_id, submission_id),
        daemon=True,
    )
    thread.start()

    return jsonify({"job_id": job_id})


@app.route("/api/jobs/<job_id>", methods=["GET"])
def job_status(job_id):
    job = db.get_job(job_id)
    if job is None:
        return _json_error("Job not found.", status=404)
    return jsonify(_job_public(job))


@app.route("/api/results/<int:comparison_id>", methods=["GET"])
def results(comparison_id):
    comparison = db.get_comparison(comparison_id)
    if comparison is None:
        return _json_error("Comparison not found.", status=404)
    public = _comparison_public(comparison)
    sub1 = db.get_submission(comparison["submission_id_1"])
    sub2 = db.get_submission(comparison["submission_id_2"])
    public["submission_1"] = {"id": sub1["id"], "file_name": sub1["file_name"]} if sub1 else None
    public["submission_2"] = {"id": sub2["id"], "file_name": sub2["file_name"]} if sub2 else None

    if comparison["status"] == "completed" and sub1 and sub2:
        try:
            pre_a = file_service.preprocess(sub1["stored_path"], sub1["file_type"])
            pre_b = file_service.preprocess(sub2["stored_path"], sub2["file_type"])
            public["diff"] = {
                "tokens_a": pre_a["tokens"][:1500],
                "tokens_b": pre_b["tokens"][:1500],
            }
        except Exception as exc:  # noqa: BLE001
            log.warning("Could not rebuild diff view for %s: %s", comparison_id, exc)

    return jsonify(public)


@app.route("/api/history", methods=["GET"])
def history():
    rows = db.list_history()
    out = []
    for row in rows:
        public = _comparison_public(row)
        public["file_name_1"] = row["file_name_1"]
        public["file_name_2"] = row["file_name_2"]
        out.append(public)
    return jsonify(out)


@app.route("/api/history/<int:comparison_id>", methods=["DELETE"])
def delete_history(comparison_id):
    deleted = db.delete_history(comparison_id)
    if not deleted:
        return _json_error("Comparison not found.", status=404)
    return jsonify({"deleted": True})


@app.route("/api/report/<int:comparison_id>", methods=["GET"])
def report(comparison_id):
    comparison = db.get_comparison(comparison_id)
    if comparison is None or comparison["status"] != "completed":
        return _json_error("Comparison is not ready for a report yet.", status=404)

    sub1 = db.get_submission(comparison["submission_id_1"])
    sub2 = db.get_submission(comparison["submission_id_2"])
    path = report_service.build_report(comparison, sub1, sub2)
    return send_file(path, as_attachment=True,
                      download_name=f"similarity_report_{comparison_id}.pdf")


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


# ------------------------------------------------------------- error handling

@app.errorhandler(413)
def too_large(_exc):
    return _json_error("File exceeds the 10 MB upload limit.", status=413)


@app.errorhandler(404)
def not_found(_exc):
    if request.path.startswith("/api/"):
        return _json_error("Not found.", status=404)
    return abort(404)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
