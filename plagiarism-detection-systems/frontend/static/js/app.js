(() => {
  "use strict";

  const state = {
    submissionA: null,
    submissionB: null,
    pollTimer: null,
  };

  const el = (id) => document.getElementById(id);

  const dropzoneA = el("dropzoneA");
  const dropzoneB = el("dropzoneB");
  const fileA = el("fileA");
  const fileB = el("fileB");
  const statusA = el("statusA");
  const statusB = el("statusB");
  const compareBtn = el("compareBtn");
  const compareAllBtn = el("compareAllBtn");
  const progressPanel = el("progressPanel");
  const progressFill = el("progressFill");
  const progressStage = el("progressStage");
  const historyList = el("historyList");
  const emptyState = el("emptyState");
  const resultContent = el("resultContent");
  const gaugeArc = el("gaugeArc");
  const finalScoreEl = el("finalScore");
  const classificationEl = el("classification");
  const fileNamesEl = el("fileNames");
  const downloadReport = el("downloadReport");
  const breakdownEl = el("breakdown");
  const matchNoteEl = el("matchNote");
  const diffViewEl = el("diffView");

  const ALGO_LABELS = {
    rabin_karp: "Rabin\u2013Karp (n-gram overlap)",
    hashing: "Shingle hashing (Jaccard)",
    lcs: "Longest common subsequence",
    edit_distance: "Edit distance",
    semantic: "Semantic similarity",
  };

  const GAUGE_CIRCUMFERENCE = 251; // matches the SVG arc path length

  function scoreColor(score) {
    if (score <= 40) return "var(--risk-low)";
    if (score <= 60) return "var(--signal)";
    return "var(--risk-high)";
  }

  // ---------------------------------------------------------- uploads

  function wireDropzone(zoneEl, inputEl, slot) {
    inputEl.addEventListener("change", () => {
      if (inputEl.files[0]) handleUpload(inputEl.files[0], slot, zoneEl);
    });
    ["dragenter", "dragover"].forEach((evt) =>
      zoneEl.addEventListener(evt, (e) => {
        e.preventDefault();
        zoneEl.classList.add("is-dragover");
      })
    );
    ["dragleave", "drop"].forEach((evt) =>
      zoneEl.addEventListener(evt, (e) => {
        e.preventDefault();
        zoneEl.classList.remove("is-dragover");
      })
    );
    zoneEl.addEventListener("drop", (e) => {
      const file = e.dataTransfer.files[0];
      if (file) handleUpload(file, slot, zoneEl);
    });
  }

  async function handleUpload(file, slot, zoneEl) {
    const statusEl = slot === "A" ? statusA : statusB;
    const labelEl = el(slot === "A" ? "labelA" : "labelB");
    statusEl.textContent = "Uploading\u2026";
    statusEl.className = "field-status";

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed.");

      if (slot === "A") state.submissionA = data;
      else state.submissionB = data;

      zoneEl.classList.add("has-file");
      labelEl.textContent = data.file_name;
      statusEl.textContent = `Uploaded \u2022 ${data.file_type} \u2022 ready`;
      statusEl.className = "field-status is-ok";
    } catch (err) {
      statusEl.textContent = err.message;
      statusEl.className = "field-status is-error";
    }
    updateActionState();
  }

  function updateActionState() {
    compareBtn.disabled = !(state.submissionA && state.submissionB);
    compareAllBtn.disabled = !state.submissionA;
  }

  wireDropzone(dropzoneA, fileA, "A");
  wireDropzone(dropzoneB, fileB, "B");

  // ---------------------------------------------------------- compare

  compareBtn.addEventListener("click", async () => {
    if (!state.submissionA || !state.submissionB) return;
    setBusy(true);
    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submission_id_1: state.submissionA.submission_id,
          submission_id_2: state.submissionB.submission_id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start comparison.");
      pollJob(data.job_id, () => loadResults(data.comparison_id));
    } catch (err) {
      setBusy(false);
      alert(err.message);
    }
  });

  compareAllBtn.addEventListener("click", async () => {
    if (!state.submissionA) return;
    setBusy(true);
    try {
      const res = await fetch("/api/compare-against-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submission_id: state.submissionA.submission_id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start comparison.");
      pollJob(data.job_id, (job) => {
        const top = job.result && job.result.results && job.result.results[0];
        if (top) loadResults(top.comparison_id);
        else setBusy(false);
        loadHistory();
      });
    } catch (err) {
      setBusy(false);
      alert(err.message);
    }
  });

  function setBusy(isBusy) {
    compareBtn.disabled = isBusy || !(state.submissionA && state.submissionB);
    compareAllBtn.disabled = isBusy || !state.submissionA;
    progressPanel.hidden = !isBusy;
    if (!isBusy) {
      progressFill.style.width = "0%";
    }
  }

  function pollJob(jobId, onDone) {
    clearInterval(state.pollTimer);
    state.pollTimer = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        const job = await res.json();
        if (!res.ok) throw new Error(job.error || "Job lookup failed.");

        progressFill.style.width = `${job.progress || 0}%`;
        progressStage.textContent = humanizeStage(job.stage, job.progress);

        if (job.status === "completed") {
          clearInterval(state.pollTimer);
          setBusy(false);
          onDone(job);
        } else if (job.status === "failed") {
          clearInterval(state.pollTimer);
          setBusy(false);
          alert(`Comparison failed: ${job.error || "unknown error"}`);
        }
      } catch (err) {
        clearInterval(state.pollTimer);
        setBusy(false);
        alert(err.message);
      }
    }, 700);
  }

  function humanizeStage(stage, progress) {
    const labels = {
      queued: "Queued",
      extracting: "Extracting and preprocessing files",
      running_dsa_algorithms: "Running Rabin\u2013Karp, hashing, LCS, edit distance",
      computing_semantic_similarity: "Computing semantic similarity",
      scoring: "Combining hybrid score",
      comparing: "Comparing against stored submissions",
      done: "Done",
    };
    const label = labels[stage] || stage || "Working";
    return `${label} (${progress || 0}%)`;
  }

  // ---------------------------------------------------------- results

  async function loadResults(comparisonId) {
    const res = await fetch(`/api/results/${comparisonId}`);
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Could not load results.");
      return;
    }
    renderResults(data);
    loadHistory();
  }

  function renderResults(data) {
    emptyState.hidden = true;
    resultContent.hidden = false;

    const score = (data.scores && data.scores.final_score) || 0;
    const color = scoreColor(score);
    const offset = GAUGE_CIRCUMFERENCE * (1 - score / 100);

    gaugeArc.style.stroke = color;
    gaugeArc.style.strokeDashoffset = String(offset);
    finalScoreEl.textContent = score.toFixed(1);
    finalScoreEl.style.color = color;
    classificationEl.textContent = data.classification || "Unclassified";
    classificationEl.style.color = color;

    const n1 = data.submission_1 ? data.submission_1.file_name : "Submission A";
    const n2 = data.submission_2 ? data.submission_2.file_name : "Submission B";
    fileNamesEl.textContent = `${n1}  \u2194  ${n2}`;

    downloadReport.hidden = false;
    downloadReport.href = `/api/report/${data.id}`;

    renderBreakdown((data.scores && data.scores.breakdown) || {});
    renderDiff(data);
  }

  function renderBreakdown(breakdown) {
    breakdownEl.innerHTML = "";
    Object.entries(breakdown).forEach(([key, value]) => {
      const row = document.createElement("div");
      row.className = "breakdown-row";
      row.innerHTML = `
        <span class="breakdown-label">${ALGO_LABELS[key] || key}</span>
        <span class="breakdown-track">
          <span class="breakdown-fill" style="width:${Math.min(100, value)}%; background:${scoreColor(value)}"></span>
        </span>
        <span class="breakdown-value">${value.toFixed(1)}%</span>
      `;
      breakdownEl.appendChild(row);
    });
  }

  function renderDiff(data) {
    const lcs = data.matches && data.matches.lcs;
    const diff = data.diff;
    if (!diff) {
      matchNoteEl.textContent = "Matched-section highlighting is not available for this comparison.";
      diffViewEl.innerHTML = "";
      return;
    }

    const runsA = (lcs && lcs.matched_runs) || [];
    matchNoteEl.textContent = lcs && lcs.identifier_normalized
      ? "Highlighted spans show exact overlap; the score above also accounts for simple variable/function renaming."
      : "Highlighted spans show tokens that both submissions share, in order.";

    diffViewEl.innerHTML = `
      <div class="diff-col"><h3>Submission A</h3>${renderTokens(diff.tokens_a, runsA, 0)}</div>
      <div class="diff-col"><h3>Submission B</h3>${renderTokens(diff.tokens_b, runsA, 2)}</div>
    `;
  }

  function renderTokens(tokens, runs, sideOffset) {
    // runs: array of [startA, endA, startB, endB]; sideOffset picks the
    // pair of indices (0,1 for side A, 2,3 for side B).
    const covered = new Set();
    runs.forEach((run) => {
      for (let i = run[sideOffset]; i <= run[sideOffset + 1]; i++) covered.add(i);
    });

    return tokens
      .map((tok, i) => {
        const safe = escapeHtml(tok);
        return covered.has(i) ? `<mark class="match">${safe}</mark>` : safe;
      })
      .join(" ");
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // ---------------------------------------------------------- history

  async function loadHistory() {
    const res = await fetch("/api/history");
    const rows = await res.json();
    if (!res.ok) return;

    if (!rows.length) {
      historyList.innerHTML = '<li class="history-empty">No comparisons yet.</li>';
      return;
    }

    historyList.innerHTML = "";
    rows.forEach((row) => {
      const li = document.createElement("li");
      const score = row.scores ? row.scores.final_score : null;
      li.innerHTML = `
        <div class="history-row">
          <span class="history-files">${escapeHtml(row.file_name_1)} \u2194 ${escapeHtml(row.file_name_2)}</span>
          <span class="history-score" style="color:${score !== null ? scoreColor(score) : "var(--ink-soft)"}">
            ${score !== null ? score.toFixed(1) + "%" : row.status}
          </span>
          <button class="history-delete" title="Delete" data-id="${row.id}">\u2715</button>
        </div>
      `;
      li.querySelector(".history-row").addEventListener("click", (e) => {
        if (e.target.closest(".history-delete")) return;
        if (row.status === "completed") loadResults(row.id);
      });
      li.querySelector(".history-delete").addEventListener("click", async (e) => {
        e.stopPropagation();
        await fetch(`/api/history/${row.id}`, { method: "DELETE" });
        loadHistory();
      });
      historyList.appendChild(li);
    });
  }

  el("refreshHistoryBtn").addEventListener("click", loadHistory);

  // ---------------------------------------------------------- boot

  loadHistory();
})();
