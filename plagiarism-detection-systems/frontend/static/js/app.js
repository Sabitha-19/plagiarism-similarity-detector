(() => {
  "use strict";

  /* =========================================================
     PLAGISCOPE - FRONTEND UI / UX JAVASCRIPT
     Backend APIs and endpoints remain unchanged.
     ========================================================= */

  const state = {
    submissionA: null,
    submissionB: null,
    pollTimer: null,
    toastTimer: null
  };

  const el = (id) => document.getElementById(id);

  /* =========================================================
     DOM ELEMENTS
     ========================================================= */

  const dropzoneA = el("dropzoneA");
  const dropzoneB = el("dropzoneB");

  const fileA = el("fileA");
  const fileB = el("fileB");

  const compareBtn = el("compareBtn");
  const compareAllBtn = el("compareAllBtn");

  const progressPanel = el("progressPanel");
  const progressFill = el("progressFill");
  const progressStage = el("progressStage");
  const progressPercent = el("progressPercent");

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

  const collectionPanel = el("collectionPanel");
  const collectionList = el("collectionList");

  /* =========================================================
     EXISTING HYBRID SCORING WEIGHTS
     ========================================================= */

  const WEIGHTS = {
    rabin_karp: 0.25,
    hashing: 0.20,
    lcs: 0.20,
    edit_distance: 0.10,
    semantic: 0.25
  };

  const ALGO = {
    rabin_karp: [
      "Rabin–Karp",
      "Exact n-gram overlap",
      "Detects repeated token sequences."
    ],

    hashing: [
      "Hashing",
      "Shingle Jaccard",
      "Measures overlap between token shingles."
    ],

    lcs: [
      "LCS",
      "Structural sequence match",
      "Finds common ordered token sequences."
    ],

    edit_distance: [
      "Edit Distance",
      "Transformation similarity",
      "Measures how much content must change."
    ],

    semantic: [
      "Semantic Similarity",
      "Meaning-level match",
      "Captures similarity beyond exact wording."
    ]
  };

  const CIRC = 2 * Math.PI * 76;

  /* =========================================================
     UTILITY FUNCTIONS
     ========================================================= */

  function showToast(message, type = "ok") {
    const toast = el("toast");

    if (!toast) return;

    const toastText = el("toastText");
    const icon = toast.querySelector(".toast-icon");

    if (toastText) {
      toastText.textContent = message;
    }

    if (icon) {
      icon.textContent = type === "error" ? "!" : "✓";
    }

    toast.classList.add("show");

    clearTimeout(state.toastTimer);

    state.toastTimer = setTimeout(() => {
      toast.classList.remove("show");
    }, 3200);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function scoreColor(score) {
    if (score <= 40) return "#28A77A";
    if (score <= 60) return "#E7A33E";
    return "#E25D58";
  }

  function classification(score) {
    if (score <= 20) return "Very Low Similarity";
    if (score <= 40) return "Low Similarity";
    if (score <= 60) return "Moderate Similarity";
    if (score <= 80) return "High Similarity";

    return "Very High Similarity";
  }

  function shortClass(score) {
    if (score <= 20) return "Very Low";
    if (score <= 40) return "Low";
    if (score <= 60) return "Moderate";
    if (score <= 80) return "High";

    return "Very High";
  }

  /* =========================================================
     UPLOAD / DRAG & DROP
     ========================================================= */

  function setupDropzone(zone, input, slot) {
    if (!zone || !input) return;

    input.addEventListener("change", () => {
      if (input.files && input.files[0]) {
        handleUpload(input.files[0], slot, zone);
      }
    });

    ["dragenter", "dragover"].forEach((eventName) => {
      zone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();

        zone.classList.add("is-dragover");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      zone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();

        zone.classList.remove("is-dragover");
      });
    });

    zone.addEventListener("drop", (event) => {
      const files = event.dataTransfer.files;

      if (files && files[0]) {
        handleUpload(files[0], slot, zone);
      }
    });
  }

  async function handleUpload(file, slot, zone) {
    const status = el(slot === "A" ? "statusA" : "statusB");
    const card = el(slot === "A" ? "cardA" : "cardB");
    const check = el(slot === "A" ? "checkA" : "checkB");

    if (!file) return;

    if (status) {
      status.textContent = "Uploading…";
      status.className = "field-status";
    }

    zone.classList.remove("has-file");

    const form = new FormData();
    form.append("file", file);

    try {
      /* Existing backend API */
      const response = await fetch("/api/upload", {
        method: "POST",
        body: form
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Upload failed.");
      }

      if (slot === "A") {
        state.submissionA = data;
      } else {
        state.submissionB = data;
      }

      zone.classList.add("has-file");

      if (card) {
        card.classList.add("has-file");
      }

      if (check) {
        check.textContent = "✓";
      }

      const label = el("label" + slot);

      if (label) {
        label.textContent = data.file_name;
      }

      if (status) {
        status.textContent =
          `Uploaded • ${data.file_type} • ready`;

        status.className = "field-status is-ok";
      }

      const meta = el("meta" + slot);

      if (meta) {
        meta.hidden = false;

        meta.innerHTML = `
          <span class="meta-name">
            ${escapeHtml(data.file_name)}
          </span>

          <span class="meta-type">
            ${escapeHtml(data.file_type)}
          </span>

          <button
            class="file-remove"
            type="button"
            aria-label="Replace file">
            ×
          </button>
        `;

        const removeButton =
          meta.querySelector(".file-remove");

        if (removeButton) {
          removeButton.addEventListener("click", (event) => {
            event.stopPropagation();
            resetUpload(slot);
          });
        }
      }

      showToast(
        `${data.file_name} is ready for analysis.`
      );

    } catch (error) {

      if (status) {
        status.textContent =
          error.message || "Upload failed.";

        status.className = "field-status is-error";
      }

      showToast(
        error.message || "Upload failed.",
        "error"
      );
    }

    updateActionState();
  }

  function resetUpload(slot) {
    const input = el("file" + slot);
    const zone = el("dropzone" + slot);
    const card = el("card" + slot);
    const meta = el("meta" + slot);

    if (slot === "A") {
      state.submissionA = null;
    } else {
      state.submissionB = null;
    }

    if (input) {
      input.value = "";
    }

    if (zone) {
      zone.classList.remove("has-file");
      zone.classList.remove("is-dragover");
    }

    if (card) {
      card.classList.remove("has-file");
    }

    const check = el("check" + slot);

    if (check) {
      check.textContent = "○";
    }

    const label = el("label" + slot);

    if (label) {
      label.textContent =
        "Drag & drop your file here";
    }

    const status = el("status" + slot);

    if (status) {
      status.textContent = "";
      status.className = "field-status";
    }

    if (meta) {
      meta.hidden = true;
    }

    updateActionState();

    showToast(
      `Submission ${slot} removed. You can choose another file.`
    );
  }

  function updateActionState() {
    if (compareBtn) {
      compareBtn.disabled =
        !(state.submissionA && state.submissionB);
    }

    if (compareAllBtn) {
      compareAllBtn.disabled =
        !state.submissionA;
    }
  }

  setupDropzone(
    dropzoneA,
    fileA,
    "A"
  );

  setupDropzone(
    dropzoneB,
    fileB,
    "B"
  );

  const browseA = el("browseA");
  const browseB = el("browseB");

  if (browseA && fileA) {
    browseA.addEventListener("click", () => {
      fileA.click();
    });
  }

  if (browseB && fileB) {
    browseB.addEventListener("click", () => {
      fileB.click();
    });
  }

  /* =========================================================
     NORMAL COMPARISON
     ========================================================= */

  if (compareBtn) {
    compareBtn.addEventListener("click", async () => {

      if (!state.submissionA || !state.submissionB) {
        showToast(
          "Please upload both submissions first.",
          "error"
        );

        return;
      }

      setBusy(true, "pair");

      try {

        /* Existing backend API */
        const response = await fetch("/api/compare", {
          method: "POST",

          headers: {
            "Content-Type": "application/json"
          },

          body: JSON.stringify({
            submission_id_1:
              state.submissionA.submission_id,

            submission_id_2:
              state.submissionB.submission_id
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
            "Could not start comparison."
          );
        }

        pollJob(
          data.job_id,
          () => loadResults(data.comparison_id)
        );

      } catch (error) {

        setBusy(false);

        showToast(
          error.message ||
          "Comparison could not be started.",
          "error"
        );
      }
    });
  }

  /* =========================================================
     COMPARE AGAINST COLLECTION
     ========================================================= */

  if (compareAllBtn) {
    compareAllBtn.addEventListener(
      "click",
      async () => {

        if (!state.submissionA) {
          showToast(
            "Please upload Submission A first.",
            "error"
          );

          return;
        }

        setBusy(true, "collection");

        try {

          /* Existing backend API */
          const response =
            await fetch(
              "/api/compare-against-all",
              {
                method: "POST",

                headers: {
                  "Content-Type":
                    "application/json"
                },

                body: JSON.stringify({
                  submission_id:
                    state.submissionA.submission_id
                })
              }
            );

          const data =
            await response.json();

          if (!response.ok) {
            throw new Error(
              data.error ||
              "Could not start collection comparison."
            );
          }

          pollJob(
            data.job_id,
            (job) => {
              setBusy(false);

              renderCollection(
                job.result?.results || []
              );

              loadHistory();
            }
          );

        } catch (error) {

          setBusy(false);

          showToast(
            error.message ||
            "Collection comparison failed.",
            "error"
          );
        }
      }
    );
  }

  /* =========================================================
     LOADING / PROGRESS STATE
     ========================================================= */

  function setBusy(busy, mode) {

    if (compareBtn) {
      compareBtn.disabled =
        busy ||
        !(state.submissionA &&
          state.submissionB);
    }

    if (compareAllBtn) {
      compareAllBtn.disabled =
        busy ||
        !state.submissionA;
    }

    if (progressPanel) {
      progressPanel.hidden = !busy;
    }

    if (busy) {

      const title =
        el("progressTitle");

      if (title) {
        title.textContent =
          mode === "collection"
            ? "Comparing against collection"
            : "Analysis in progress";
      }

      if (progressFill) {
        progressFill.style.width = "0%";
      }

      if (progressPercent) {
        progressPercent.textContent = "0%";
      }

      if (progressStage) {
        progressStage.textContent =
          "Preparing analysis...";
      }
    }
  }

  function humanizeStage(stage, progress) {

    const messages = {

      queued:
        "Queued",

      extracting:
        "Extracting and preprocessing files",

      running_dsa_algorithms:
        "Running Rabin–Karp, hashing, LCS and edit distance",

      computing_semantic_similarity:
        "Computing semantic similarity",

      scoring:
        "Combining hybrid score",

      comparing:
        "Comparing against stored submissions",

      done:
        "Completed"
    };

    const message =
      messages[stage] ||
      stage ||
      "Working";

    if (typeof progress === "number") {
      return `${message} (${progress}%)`;
    }

    return message;
  }

  function markStages(stage) {

    const order = [
      "extracting",
      "running_dsa_algorithms",
      "computing_semantic_similarity",
      "scoring",
      "done"
    ];

    const index =
      order.indexOf(stage);

    document
      .querySelectorAll(".stage-list span")
      .forEach((stageElement) => {

        const stageIndex =
          order.indexOf(
            stageElement.dataset.stage
          );

        stageElement.classList.toggle(
          "done",
          stageIndex !== -1 &&
          stageIndex <= index
        );
      });
  }

  /* =========================================================
     REAL BACKEND JOB POLLING
     ========================================================= */

  function pollJob(jobId, onDone) {

    clearInterval(state.pollTimer);

    let failures = 0;

    state.pollTimer =
      setInterval(async () => {

        try {

          /* Existing backend progress API */
          const response =
            await fetch(
              `/api/jobs/${jobId}`
            );

          const job =
            await response.json();

          if (!response.ok) {
            throw new Error(
              job.error ||
              "Job lookup failed."
            );
          }

          failures = 0;

          const progress =
            Number(job.progress || 0);

          if (progressFill) {
            progressFill.style.width =
              `${progress}%`;
          }

          if (progressPercent) {
            progressPercent.textContent =
              `${progress}%`;
          }

          if (progressStage) {
            progressStage.textContent =
              humanizeStage(
                job.stage,
                progress
              );
          }

          markStages(job.stage);

          if (job.status === "completed") {

            clearInterval(
              state.pollTimer
            );

            setBusy(false);

            onDone(job);

          } else if (
            job.status === "failed"
          ) {

            clearInterval(
              state.pollTimer
            );

            setBusy(false);

            showToast(
              `Comparison failed: ${
                job.error ||
                "Unknown error"
              }`,
              "error"
            );
          }

        } catch (error) {

          failures++;

          if (failures >= 3) {

            clearInterval(
              state.pollTimer
            );

            setBusy(false);

            showToast(
              "Unable to read analysis status. Please retry.",
              "error"
            );
          }
        }

      }, 650);
  }

  /* =========================================================
     LOAD RESULT
     ========================================================= */

  async function loadResults(id) {

    try {

      /* Existing backend result API */
      const response =
        await fetch(
          `/api/results/${id}`
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          "Could not load results."
        );
      }

      renderResults(data);

      loadHistory();

      location.hash =
        "resultsSection";

      showToast(
        "Comparison completed successfully."
      );

    } catch (error) {

      showToast(
        error.message ||
        "Could not load results.",
        "error"
      );
    }
  }

  /* =========================================================
     RESULT DASHBOARD
     ========================================================= */

  function renderResults(data) {

    if (emptyState) {
      emptyState.hidden = true;
    }

    if (resultContent) {
      resultContent.hidden = false;
    }

    const score =
      Number(
        data.scores?.final_score || 0
      );

    const color =
      scoreColor(score);

    const offset =
      CIRC *
      (1 - score / 100);

    if (gaugeArc) {

      gaugeArc.style.stroke =
        color;

      gaugeArc.style.strokeDashoffset =
        String(offset);
    }

    if (finalScoreEl) {

      finalScoreEl.textContent =
        score.toFixed(1);

      finalScoreEl.style.color =
        color;
    }

    if (classificationEl) {

      classificationEl.textContent =
        data.classification ||
        classification(score);

      classificationEl.style.color =
        color;
    }

    const assessment =
      el("assessmentText");

    if (assessment) {

      assessment.textContent =
        shortClass(score) +
        " similarity";
    }

    const nameA =
      data.submission_1?.file_name ||
      "Submission A";

    const nameB =
      data.submission_2?.file_name ||
      "Submission B";

    if (fileNamesEl) {

      fileNamesEl.textContent =
        `${nameA}  ↔  ${nameB}`;
    }

    if (downloadReport) {

      downloadReport.hidden = false;

      /* Existing PDF report API */
      downloadReport.href =
        `/api/report/${data.id}`;
    }

    renderBreakdown(
      data.scores?.breakdown || {}
    );

    renderDiff(data);
  }

  /* =========================================================
     ALGORITHM BREAKDOWN
     ========================================================= */

  function renderBreakdown(breakdown) {

    if (!breakdownEl) return;

    breakdownEl.innerHTML = "";

    Object.entries(ALGO)
      .forEach(([key, metadata]) => {

        const value =
          Math.max(
            0,
            Math.min(
              100,
              Number(
                breakdown[key] ?? 0
              )
            )
          );

        const contribution =
          value *
          WEIGHTS[key];

        const card =
          document.createElement(
            "article"
          );

        card.className =
          "algo-card";

        card.innerHTML = `

          <div class="algo-top">

            <span class="algo-name">
              ${metadata[0]}
            </span>

            <strong class="algo-value">
              ${value.toFixed(1)}%
            </strong>

          </div>

          <p class="algo-desc">
            ${metadata[1]} —
            ${metadata[2]}
          </p>

          <div class="algo-track">

            <div
              class="algo-fill"
              style="width:${value}%">
            </div>

          </div>

          <div class="algo-foot">

            <span>
              Weight
              <b>
                ${WEIGHTS[key] * 100}%
              </b>
            </span>

            <span>
              Contribution
              <b>
                ${contribution.toFixed(1)}
              </b>
            </span>

          </div>
        `;

        breakdownEl.appendChild(card);
      });
  }

  /* =========================================================
     MATCHED CONTENT / DIFF VIEWER
     ========================================================= */

  function renderDiff(data) {

    const lcs =
      data.matches?.lcs;

    const diff =
      data.diff;

    if (!diff) {

      if (matchNoteEl) {
        matchNoteEl.textContent =
          "Matched-section highlighting is not available for this comparison.";
      }

      if (diffViewEl) {

        diffViewEl.innerHTML = `

          <div class="empty-state">

            <h3>
              Match view unavailable
            </h3>

            <p>
              The analysis result is still valid,
              but the source preview could not be rebuilt.
            </p>

          </div>
        `;
      }

      return;
    }

    const runs =
      lcs?.matched_runs || [];

    if (matchNoteEl) {

      matchNoteEl.textContent =
        lcs?.identifier_normalized

          ? "Highlighted spans show exact overlap; the LCS score also considers identifier-normalized code."

          : "Highlighted spans show tokens shared by both submissions, in order.";
    }

    if (diffViewEl) {

      diffViewEl.innerHTML = `

        <div class="diff-col">

          ${diffHeader(
            "Submission A",
            data.submission_1?.file_name
          )}

          <div class="code-body">

            ${renderCode(
              diff.tokens_a || [],
              runs,
              0
            )}

          </div>

        </div>

        <div class="diff-col">

          ${diffHeader(
            "Submission B",
            data.submission_2?.file_name
          )}

          <div class="code-body">

            ${renderCode(
              diff.tokens_b || [],
              runs,
              2
            )}

          </div>

        </div>
      `;
    }
  }

  function diffHeader(label, name) {

    return `

      <div class="diff-head">

        <strong>
          ${escapeHtml(label)}
        </strong>

        <span>
          ${escapeHtml(
            name || "File"
          )}
        </span>

      </div>
    `;
  }

  function renderCode(
    tokens,
    runs,
    offset
  ) {

    const covered =
      new Set();

    runs.forEach((run) => {

      for (
        let i = run[offset];
        i <= run[offset + 1];
        i++
      ) {
        covered.add(i);
      }
    });

    const lines = [];

    let line = [];

    let lineNumber = 1;

    tokens.forEach((token, index) => {

      if (token.includes("\n")) {

        token
          .split("\n")
          .forEach(
            (part, partIndex) => {

              if (partIndex) {

                lines.push({
                  no: lineNumber++,
                  tokens: line,
                  match:
                    line.some(
                      item =>
                        item.match
                    )
                });

                line = [];
              }

              if (part) {

                line.push({
                  text: part,
                  match:
                    covered.has(index)
                });
              }
            }
          );

      } else {

        line.push({
          text: token,
          match:
            covered.has(index)
        });
      }
    });

    if (
      line.length ||
      !lines.length
    ) {

      lines.push({
        no: lineNumber,
        tokens: line,
        match:
          line.some(
            item => item.match
          )
      });
    }

    return lines
      .map(
        (lineData) => `

          <div
            class="code-line ${
              lineData.match
                ? "match"
                : ""
            }">

            <span class="line-no">
              ${lineData.no}
            </span>

            <span class="line-code">

              ${lineData.tokens
                .map(
                  token =>
                    token.match

                      ? `<mark class="match">
                          ${escapeHtml(
                            token.text
                          )}
                         </mark>`

                      : escapeHtml(
                          token.text
                        )
                )
                .join(" ")}

            </span>

          </div>
        `
      )
      .join("");
  }

  /* =========================================================
     COLLECTION RESULTS
     ========================================================= */

  function renderCollection(results) {

    if (!collectionPanel ||
        !collectionList) {
      return;
    }

    collectionPanel.hidden =
      false;

    collectionList.innerHTML =
      "";

    if (!results.length) {

      collectionList.innerHTML = `

        <div class="table-empty">

          <b>
            No stored comparison candidates
          </b>

          <span>
            Upload additional submissions
            to build a collection.
          </span>

        </div>
      `;

      collectionPanel.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });

      return;
    }

    results.forEach(
      (result, index) => {

        let scores = {};

        try {

          scores =
            typeof result.scores === "string"

              ? JSON.parse(
                  result.scores
                )

              : result.scores || {};

        } catch {
          scores = {};
        }

        const score =
          Number(
            scores.final_score || 0
          );

        const row =
          document.createElement(
            "div"
          );

        row.className =
          "collection-row";

        const level =
          shortClass(score);

        const badgeClass =
          level
            .toLowerCase()
            .replace(" ", "-");

        row.innerHTML = `

          <div class="rank">
            ${index + 1}
          </div>

          <div>

            <div class="collection-name">
              ${escapeHtml(
                result.file_name
              )}
            </div>

            <div class="collection-sub">
              ${escapeHtml(
                result.status ||
                "completed"
              )}
            </div>

          </div>

          <div
            class="collection-score"
            style="color:${scoreColor(score)}">

            ${score.toFixed(1)}%

          </div>

          <span
            class="badge badge-${badgeClass}">

            ${level}

          </span>
        `;

        row.addEventListener(
          "click",
          () => {

            if (
              result.comparison_id
            ) {

              loadResults(
                result.comparison_id
              );
            }
          }
        );

        row.style.cursor =
          "pointer";

        collectionList.appendChild(
          row
        );
      }
    );

    collectionPanel.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  /* =========================================================
     HISTORY
     ========================================================= */

  async function loadHistory() {

    if (!historyList) return;

    try {

      /* Existing history API */
      const response =
        await fetch("/api/history");

      const rows =
        await response.json();

      if (!response.ok) {
        throw new Error(
          "History unavailable"
        );
      }

      if (!rows.length) {

        historyList.innerHTML = `

          <tr>

            <td colspan="6">

              <div class="table-empty">

                <b>
                  No history yet
                </b>

                <span>
                  Your completed comparisons
                  will appear here.
                </span>

              </div>

            </td>

          </tr>
        `;

        return;
      }

      historyList.innerHTML = "";

      rows.forEach((row) => {

        let score = null;

        try {

          if (row.scores) {

            const scores =
              typeof row.scores === "string"

                ? JSON.parse(
                    row.scores
                  )

                : row.scores;

            score =
              Number(
                scores.final_score
              );
          }

        } catch {
          score = null;
        }

        const color =
          score !== null
            ? scoreColor(score)
            : "#8792a3";

        const tr =
          document.createElement(
            "tr"
          );

        let date = "—";

        if (row.created_at) {

          try {

            date =
              new Date(
                row.created_at
                  .replace(
                    " ",
                    "T"
                  ) + "Z"
              ).toLocaleString(
                [],
                {
                  day: "2-digit",
                  month: "short",
                  year: "numeric"
                }
              );

          } catch {
            date = row.created_at;
          }
        }

        const level =
          score !== null
            ? shortClass(score)
            : null;

        const badge =
          score !== null

            ? `
              <span
                class="badge badge-${
                  level
                    .toLowerCase()
                    .replace(" ", "-")
                }">

                ${level}

              </span>
            `

            : `
              <span class="status-cell">
                ${escapeHtml(
                  row.status ||
                  "pending"
                )}
              </span>
            `;

        tr.innerHTML = `

          <td>
            ${date}
          </td>

          <td>

            <div
              class="file-cell"
              title="${escapeHtml(
                row.file_name_1
              )}">

              ${escapeHtml(
                row.file_name_1
              )}

            </div>

          </td>

          <td>

            <div
              class="file-cell"
              title="${escapeHtml(
                row.file_name_2
              )}">

              ${escapeHtml(
                row.file_name_2
              )}

            </div>

          </td>

          <td
            class="score-cell"
            style="color:${color}">

            ${
              score !== null
                ? score.toFixed(1) + "%"
                : "—"
            }

          </td>

          <td>
            ${badge}
          </td>

          <td>

            <div
              class="history-actions">

              ${
                row.status === "completed"

                  ? `

                    <button
                      class="table-action view"
                      type="button">

                      View

                    </button>

                    <a
                      class="table-action"
                      href="/api/report/${row.id}">

                      PDF

                    </a>
                  `

                  : ""
              }

              <button
                class="table-action delete"
                type="button">

                Delete

              </button>

            </div>

          </td>
        `;

        const viewButton =
          tr.querySelector(
            ".view"
          );

        if (viewButton) {

          viewButton.addEventListener(
            "click",
            () => {
              loadResults(row.id);
            }
          );
        }

        const deleteButton =
          tr.querySelector(
            ".delete"
          );

        if (deleteButton) {

          deleteButton.addEventListener(
            "click",
            () => {
              deleteHistory(row.id);
            }
          );
        }

        historyList.appendChild(
          tr
        );
      });

    } catch (error) {

      historyList.innerHTML = `

        <tr>

          <td colspan="6">

            <div class="table-empty">

              <b>
                History could not be loaded
              </b>

              <span>
                Refresh and try again.
              </span>

            </div>

          </td>

        </tr>
      `;
    }
  }

  /* =========================================================
     DELETE HISTORY
     ========================================================= */

  async function deleteHistory(id) {

    if (
      !confirm(
        "Delete this comparison from history?"
      )
    ) {
      return;
    }

    try {

      /* Existing backend DELETE API */
      const response =
        await fetch(
          `/api/history/${id}`,
          {
            method: "DELETE"
          }
        );

      if (!response.ok) {
        throw new Error(
          "Could not delete comparison."
        );
      }

      await loadHistory();

      showToast(
        "Comparison deleted."
      );

    } catch (error) {

      showToast(
        error.message ||
        "Could not delete comparison.",
        "error"
      );
    }
  }

  const refreshHistoryBtn =
    el("refreshHistoryBtn");

  if (refreshHistoryBtn) {

    refreshHistoryBtn.addEventListener(
      "click",
      loadHistory
    );
  }

  /* =========================================================
     SYSTEM HEALTH
     ========================================================= */

  async function checkHealth() {

    const systemStatus =
      el("systemStatus");

    if (!systemStatus) return;

    try {

      /* Existing health API */
      const response =
        await fetch(
          "/api/health"
        );

      const data =
        await response.json();

      if (
        data.status === "ok"
      ) {

        systemStatus.textContent =
          "Operational";

        systemStatus.style.color =
          "var(--success)";

      } else {

        systemStatus.textContent =
          "Attention";

        systemStatus.style.color =
          "var(--warning)";
      }

    } catch {

      systemStatus.textContent =
        "Offline";

      systemStatus.style.color =
        "var(--danger)";
    }
  }

  /* =========================================================
     SETTINGS / HELP MODAL
     ========================================================= */

  function openModal(type) {

    const modalBackdrop =
      el("modalBackdrop");

    const modalBody =
      el("modalBody");

    if (
      !modalBackdrop ||
      !modalBody
    ) {
      return;
    }

    if (type === "settings") {

      modalBody.innerHTML = `

        <h3>
          Workspace Settings
        </h3>

        <p>
          Frontend presentation settings
          for this session. Backend processing
          configuration remains unchanged.
        </p>

        <ul class="modal-list">

          <li>
            <b>Theme</b>
            <br>
            PlagiScope light SaaS theme
          </li>

          <li>
            <b>Analysis</b>
            <br>
            Uses the existing backend
            DSA + semantic scoring engine
          </li>

          <li>
            <b>Upload limit</b>
            <br>
            10 MB per file
          </li>

          <li>
            <b>Supported files</b>
            <br>
            PDF, DOCX, TXT, C, CPP,
            PY, JAVA, JS, HTML, CSS
          </li>

        </ul>
      `;

    } else {

      modalBody.innerHTML = `

        <h3>
          How PlagiScope works
        </h3>

        <p>
          Upload two submissions, run a
          comparison, then inspect the
          weighted similarity signals
          and matched content.
        </p>

        <ul class="modal-list">

          <li>
            <b>1. Upload</b>
            <br>
            Drag a file into either
            submission card or browse.
          </li>

          <li>
            <b>2. Compare</b>
            <br>
            The existing backend runs
            preprocessing, DSA signals
            and semantic similarity.
          </li>

          <li>
            <b>3. Review</b>
            <br>
            Inspect the final score,
            algorithm breakdown and
            matched tokens.
          </li>

          <li>
            <b>4. Report</b>
            <br>
            Download the existing PDF
            report when comparison
            is complete.
          </li>

        </ul>
      `;
    }

    modalBackdrop.hidden = false;
  }

  const settingsBtn =
    el("settingsBtn");

  const helpBtn =
    el("helpBtn");

  const modalClose =
    el("modalClose");

  const modalBackdrop =
    el("modalBackdrop");

  if (settingsBtn) {

    settingsBtn.addEventListener(
      "click",
      () => openModal("settings")
    );
  }

  if (helpBtn) {

    helpBtn.addEventListener(
      "click",
      () => openModal("help")
    );
  }

  if (modalClose) {

    modalClose.addEventListener(
      "click",
      () => {
        if (modalBackdrop) {
          modalBackdrop.hidden =
            true;
        }
      }
    );
  }

  if (modalBackdrop) {

    modalBackdrop.addEventListener(
      "click",
      (event) => {

        if (
          event.target ===
          modalBackdrop
        ) {
          modalBackdrop.hidden =
            true;
        }
      }
    );
  }

  /* =========================================================
     MOBILE SIDEBAR
     ========================================================= */

  const sidebar =
    el("sidebar");

  const overlay =
    el("mobileOverlay");

  const menuBtn =
    el("menuBtn");

  const closeSidebar =
    el("closeSidebar");

  if (menuBtn) {

    menuBtn.addEventListener(
      "click",
      () => {

        if (sidebar) {
          sidebar.classList.add(
            "open"
          );
        }

        if (overlay) {
          overlay.classList.add(
            "show"
          );
        }
      }
    );
  }

  if (closeSidebar) {

    closeSidebar.addEventListener(
      "click",
      () => {

        if (sidebar) {
          sidebar.classList.remove(
            "open"
          );
        }

        if (overlay) {
          overlay.classList.remove(
            "show"
          );
        }
      }
    );
  }

  if (overlay) {

    overlay.addEventListener(
      "click",
      () => {

        if (sidebar) {
          sidebar.classList.remove(
            "open"
          );
        }

        overlay.classList.remove(
          "show"
        );
      }
    );
  }

  /* =========================================================
     NAVIGATION
     ========================================================= */

  document
    .querySelectorAll(
      ".nav-item[href]"
    )
    .forEach((link) => {

      link.addEventListener(
        "click",
        () => {

          document
            .querySelectorAll(
              ".nav-item"
            )
            .forEach((item) => {

              item.classList.remove(
                "active"
              );
            });

          link.classList.add(
            "active"
          );

          if (sidebar) {
            sidebar.classList.remove(
              "open"
            );
          }

          if (overlay) {
            overlay.classList.remove(
              "show"
            );
          }
        }
      );
    });

  /* =========================================================
     INITIALIZATION
     ========================================================= */

  updateActionState();

  checkHealth();

  loadHistory();

})();
