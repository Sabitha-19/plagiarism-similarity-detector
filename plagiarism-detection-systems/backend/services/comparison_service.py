"""Orchestrates a single comparison: preprocessing, the four C++ DSA
algorithms, semantic similarity, and hybrid scoring — with job-stage
updates so the frontend can poll real progress."""
import logging

import database.db as db
import services.cpp_runner as cpp_runner
import services.file_service as file_service
import services.scoring_service as scoring_service
import services.semantic_service as semantic_service

log = logging.getLogger(__name__)

STAGES = [
    ("extracting", 10),
    ("running_dsa_algorithms", 45),
    ("computing_semantic_similarity", 75),
    ("scoring", 90),
    ("done", 100),
]


def _set_stage(job_id, stage_name):
    progress = dict(STAGES)[stage_name]
    db.update_job(job_id, stage=stage_name, progress=progress)


def run_comparison(job_id, comparison_id, submission_1, submission_2):
    try:
        _set_stage(job_id, "extracting")
        pre_a = file_service.preprocess(submission_1["stored_path"], submission_1["file_type"])
        pre_b = file_service.preprocess(submission_2["stored_path"], submission_2["file_type"])

        is_code = file_service.is_code(submission_1["file_type"])

        _set_stage(job_id, "running_dsa_algorithms")
        raw_results = cpp_runner.run_all(pre_a["tokens"], pre_b["tokens"])

        # For code, also run LCS on the identifier-normalized stream so
        # simple variable/function renaming doesn't hide a match. The raw
        # run's matched_runs (token positions into the *actual* source
        # tokens) is always kept for UI highlighting; only the score can
        # come from the normalized run if it's higher.
        lcs_score = raw_results["lcs"]["score"]
        lcs_meta = dict(raw_results["lcs"])
        lcs_meta["identifier_normalized"] = False
        if is_code and "normalized_tokens" in pre_a and "normalized_tokens" in pre_b:
            normalized_results = cpp_runner.run_all(
                pre_a["normalized_tokens"], pre_b["normalized_tokens"]
            )
            if normalized_results["lcs"]["score"] > lcs_score:
                lcs_score = normalized_results["lcs"]["score"]
                lcs_meta["score"] = lcs_score
                lcs_meta["identifier_normalized"] = True
                lcs_meta["renamed_symbol_matches"] = normalized_results["lcs"]["lcs_length"]

        _set_stage(job_id, "computing_semantic_similarity")
        semantic_score, semantic_method = semantic_service.similarity(
            pre_a["normalized"], pre_b["normalized"]
        )

        _set_stage(job_id, "scoring")
        algorithm_scores = {
            "rabin_karp": raw_results["rabin_karp"]["score"],
            "hashing": raw_results["hashing"]["score"],
            "lcs": lcs_score,
            "edit_distance": raw_results["edit_distance"]["score"],
            "semantic": semantic_score,
        }
        final_score = scoring_service.hybrid_score(algorithm_scores)
        label = scoring_service.classify(final_score)

        scores_payload = {
            "final_score": final_score,
            "breakdown": {k: round(v, 2) for k, v in algorithm_scores.items()},
            "semantic_method": semantic_method,
        }
        matches_payload = {
            "rabin_karp": raw_results["rabin_karp"],
            "hashing": raw_results["hashing"],
            "lcs": lcs_meta,
            "edit_distance": raw_results["edit_distance"],
        }

        db.complete_comparison(comparison_id, scores_payload, label, matches_payload)
        db.update_job(job_id, status="completed", comparison_id=comparison_id,
                       result={"comparison_id": comparison_id})
        _set_stage(job_id, "done")
    except Exception as exc:  # noqa: BLE001
        log.exception("Comparison %s failed", comparison_id)
        db.fail_comparison(comparison_id, str(exc))
        db.update_job(job_id, status="failed", error=str(exc))


def run_compare_against_all(job_id, submission_id):
    try:
        target = db.get_submission(submission_id)
        if target is None:
            raise ValueError("Submission not found")

        others = db.list_submissions(exclude_id=submission_id)
        results = []
        total = max(len(others), 1)

        for i, other in enumerate(others):
            comparison_id = db.create_comparison(submission_id, other["id"])
            run_comparison(_child_job_id(job_id, i), comparison_id, target, other)
            comparison = db.get_comparison(comparison_id)
            results.append({
                "comparison_id": comparison_id,
                "submission_id": other["id"],
                "file_name": other["file_name"],
                "status": comparison["status"],
                "scores": comparison["scores"],
                "classification": comparison["classification"],
            })
            progress = int(((i + 1) / total) * 95)
            db.update_job(job_id, stage="comparing", progress=max(10, progress))

        results.sort(
            key=lambda r: (r["scores"] is not None,
                            _extract_final_score(r["scores"])),
            reverse=True,
        )
        db.update_job(job_id, stage="done", progress=100, status="completed",
                       result={"target_submission_id": submission_id, "results": results})
    except Exception as exc:  # noqa: BLE001
        log.exception("Compare-against-all job %s failed", job_id)
        db.update_job(job_id, status="failed", error=str(exc))


def _child_job_id(job_id, index):
    return f"{job_id}::{index}"


def _extract_final_score(scores_json):
    if not scores_json:
        return 0.0
    import json
    try:
        return json.loads(scores_json).get("final_score", 0.0)
    except (ValueError, TypeError):
        return 0.0
