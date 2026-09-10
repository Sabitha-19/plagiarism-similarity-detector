(() => {
  'use strict';

  // ---- State Management ----
  const state = {
    submissions: { A: null, B: null },
    pollTimer: null,
    toastTimer: null,
  };

  // ---- Utility Functions ----
  const getEl = (id) => document.getElementById(id);

  // ---- DOM Elements ----
  const elements = {
    dropzones: {
      A: getEl('dropzoneA'),
      B: getEl('dropzoneB'),
    },
    files: {
      A: getEl('fileA'),
      B: getEl('fileB'),
    },
    buttons: {
      compare: getEl('compareBtn'),
      compareAll: getEl('compareAllBtn'),
    },
    progress: {
      panel: getEl('progressPanel'),
      fill: getEl('progressFill'),
      stage: getEl('progressStage'),
      percent: getEl('progressPercent'),
    },
    history: {
      list: getEl('historyList'),
      empty: getEl('emptyState'),
    },
    results: {
      content: getEl('resultContent'),
      gauge: getEl('gaugeArc'),
      score: getEl('finalScore'),
      classification: getEl('classification'),
      fileNames: getEl('fileNames'),
      reportDownload: getEl('downloadReport'),
      breakdown: getEl('breakdown'),
      matchNote: getEl('matchNote'),
      diffView: getEl('diffView'),
    },
    collection: {
      panel: getEl('collectionPanel'),
      list: getEl('collectionList'),
    },
    modal: {
      backdrop: getEl('modalBackdrop'),
      body: getEl('modalBody'),
      closeBtn: getEl('modalClose'),
    },
    ui: {
      toast: getEl('toast'),
      toastText: getEl('toastText'),
      themeToggle: getEl('themeToggle'), // Example for theme switch
    },
  };

  // ---- Constants ----
  const WEIGHTS = {
    rabin_karp: 0.25,
    hashing: 0.20,
    lcs: 0.20,
    edit_distance: 0.10,
    semantic: 0.25,
  };

  const ALGO = {
    rabin_karp: ['Rabin–Karp', 'Exact n-gram overlap', 'Detects repeated token sequences.'],
    hashing: ['Hashing', 'Shingle Jaccard', 'Measures overlap between token shingles.'],
    lcs: ['LCS', 'Structural sequence match', 'Finds common ordered token sequences.'],
    edit_distance: ['Edit Distance', 'Transformation similarity', 'Measures how much content must change.'],
    semantic: ['Semantic Similarity', 'Meaning-level match', 'Captures similarity beyond exact wording.'],
  };

  const CIRCUMFERENCE = 2 * Math.PI * 76;

  // ---- UI/UX Enhancements ----
  function showToast(message, type = 'ok') {
    const toast = elements.ui.toast;
    if (!toast) return;

    const toastText = getEl('toastText');
    const icon = toast.querySelector('.toast-icon');

    toastText.textContent = message;
    icon.textContent = type === 'error' ? '!' : '✓';

    toast.classList.add('show');

    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  function updateProgress(stage, progress = null) {
    const { panel, fill, stageText, percent } = elements.progress;
    panel.hidden = false;

    stageText.textContent = humanizeStage(stage, progress);
    percent.textContent = progress !== null ? `${progress}%` : '';

    fill.style.width = progress !== null ? `${progress}%` : '0%';
    stageText.dataset.stage = stage;
  }

  function humanizeStage(stage, progress) {
    const stages = {
      queued: 'Queued',
      extracting: 'Extracting and preprocessing files',
      running_dsa_algorithms: 'Running Rabin–Karp, hashing, LCS and edit distance',
      computing_semantic_similarity: 'Computing semantic similarity',
      scoring: 'Combining hybrid score',
      comparing: 'Comparing against stored submissions',
      done: 'Completed',
    };
    const message = stages[stage] || stage || 'Working';
    return progress !== null ? `${message} (${progress}%)` : message;
  }

  function handleDropzoneEvents(zone, slot) {
    zone.addEventListener('dragenter', (e) => { e.preventDefault(); zone.classList.add('is-dragover'); });
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('is-dragover'); });
    zone.addEventListener('dragleave', (e) => { e.preventDefault(); zone.classList.remove('is-dragover'); });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('is-dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        processUpload(e.dataTransfer.files[0], slot);
      }
    });
    // For file input
    getEl(`file${slot}`).addEventListener('change', () => {
      if (getEl(`file${slot}`).files?.[0]) {
        processUpload(getEl(`file${slot}`).files[0], slot);
      }
    });
  }

  async function processUpload(file, slot) {
    // Show uploading status
    updateUploadStatus(slot, 'Uploading…', false);
    // Upload via API
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Upload failed.');

      // Save submission state
      state.submissions[slot] = data;
      // Update UI
      updateUploadStatus(slot, `Uploaded • ${data.file_type} • ready`, true, data.file_name);
      showToast(`${data.file_name} is ready for analysis.`);
    } catch (err) {
      updateUploadStatus(slot, err.message || 'Upload failed.', false);
      showToast(err.message || 'Upload failed.', 'error');
    }
    refreshActionButtons();
  }

  function updateUploadStatus(slot, message, success, filename = '') {
    const statusEl = getEl(`status${slot}`);
    const labelEl = getEl(`label${slot}`);
    const metaEl = getEl(`meta${slot}`);
    const checkEl = getEl(`check${slot}`);

    statusEl.textContent = message;
    statusEl.className = success ? 'field-status is-ok' : 'field-status is-error';

    if (labelEl) labelEl.textContent = filename || 'Drag & drop your file here';

    if (metaEl) {
      metaEl.hidden = !success;
      if (success) {
        metaEl.innerHTML = `
          <span class="meta-name">${escapeHtml(filename)}</span>
          <span class="meta-type">${escapeHtml(getEl(`file${slot}`).files?.[0]?.type || '')}</span>
          <button class="file-remove" aria-label="Replace file">×</button>`;
        metaEl.querySelector('.file-remove').addEventListener('click', () => resetUpload(slot));
      }
    }

    if (checkEl) checkEl.textContent = success ? '✓' : '○';
  }

  function resetUpload(slot) {
    getEl(`file${slot}`).value = '';
    const zone = getEl(`dropzone${slot}`);
    zone.classList.remove('has-file', 'is-dragover');
    updateUploadStatus(slot, 'Drag & drop your file here', false);
    showToast(`Submission ${slot} removed. You can choose another file.`);
    refreshActionButtons();
  }

  function refreshActionButtons() {
    const { compare, compareAll } = elements.buttons;
    compare.disabled = !(state.submissions.A && state.submissions.B);
    compareAll.disabled = !state.submissions.A;
  }

  // Setup Dropzones
  Object.entries(elements.dropzones).forEach(([slot, zone]) => handleDropzoneEvents(zone, slot));

  // Event handlers for buttons
  elements.buttons.compare?.addEventListener('click', startComparison);
  elements.buttons.compareAll?.addEventListener('click', compareAgainstCollection);

  async function startComparison() {
    if (!state.submissions.A || !state.submissions.B) {
      showToast('Please upload both submissions first.', 'error');
      return;
    }
    setBusy(true, 'pair');
    try {
      const response = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submission_id_1: state.submissions.A.submission_id,
          submission_id_2: state.submissions.B.submission_id,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not start comparison.');
      pollJob(data.job_id, () => loadResults(data.comparison_id));
    } catch (err) {
      setBusy(false);
      showToast(err.message || 'Comparison could not be started.', 'error');
    }
  }

  async function compareAgainstCollection() {
    if (!state.submissions.A) {
      showToast('Please upload Submission A first.', 'error');
      return;
    }
    setBusy(true, 'collection');
    try {
      const response = await fetch('/api/compare-against-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: state.submissions.A.submission_id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not start collection comparison.');
      pollJob(data.job_id, (job) => {
        setBusy(false);
        renderCollection(job.result?.results || []);
        loadHistory();
      });
    } catch (err) {
      setBusy(false);
      showToast(err.message || 'Collection comparison failed.', 'error');
    }
  }

  function setBusy(isBusy, mode) {
    elements.buttons.compare.disabled = isBusy || !(state.submissions.A && state.submissions.B);
    elements.buttons.compareAll.disabled = isBusy || !state.submissions.A;
    elements.progress.panel.hidden = !isBusy;

    if (isBusy) {
      updateProgress('queued', 0);
    }
  }

  function pollJob(jobId, onComplete) {
    clearInterval(state.pollTimer);
    let failures = 0;
    state.pollTimer = setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}`);
        const job = await response.json();
        if (!response.ok) throw new Error(job.error || 'Job lookup failed.');
        updateProgress(job.stage, job.progress);
        if (job.status === 'completed') {
          clearInterval(state.pollTimer);
          setBusy(false);
          onComplete(job);
        } else if (job.status === 'failed') {
          clearInterval(state.pollTimer);
          setBusy(false);
          showToast(`Comparison failed: ${job.error || 'Unknown error'}`, 'error');
        }
        failures = 0;
      } catch {
        failures++;
        if (failures >= 3) {
          clearInterval(state.pollTimer);
          setBusy(false);
          showToast('Unable to read analysis status. Please retry.', 'error');
        }
      }
    }, 650);
  }

  async function loadResults(id) {
    try {
      const response = await fetch(`/api/results/${id}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load results.');
      renderResults(data);
      loadHistory();
      // Navigate to results section
      location.hash = 'resultsSection';
      showToast('Comparison completed successfully.');
    } catch (err) {
      showToast(err.message || 'Could not load results.', 'error');
    }
  }

  function renderResults(data) {
    // Reset UI
    elements.results.content.hidden = false;
    elements.results.gauge.style.stroke = '';
    elements.results.score.textContent = '';
    elements.results.classification.textContent = '';

    // Final score & color
    const score = Number(data.scores?.final_score || 0);
    const color = scoreColor(score);
    const offset = CIRCUMFERENCE * (1 - score / 100);

    // Update gauge
    elements.results.gauge.style.stroke = color;
    elements.results.gauge.style.strokeDashoffset = String(offset);
    // Update score & classification
    elements.results.score.textContent = score.toFixed(1);
    elements.results.score.style.color = color;
    elements.results.classification.textContent = data.classification || classification(score);
    elements.results.classification.style.color = color;

    // File names
    const nameA = data.submission_1?.file_name || 'Submission A';
    const nameB = data.submission_2?.file_name || 'Submission B';
    elements.results.fileNames.textContent = `${nameA}  ↔  ${nameB}`;

    // Download report
    elements.results.reportDownload.hidden = false;
    elements.results.reportDownload.href = `/api/report/${data.id}`;

    // Render breakdown and diff
    renderBreakdown(data.scores?.breakdown || {});
    renderDiff(data);
  }

  function renderBreakdown(breakdown) {
    const container = elements.results.breakdown;
    container.innerHTML = '';

    Object.entries(ALGO).forEach(([key, [title, desc]]) => {
      const value = Math.max(0, Math.min(100, Number(breakdown[key] ?? 0)));
      const contribution = value * WEIGHTS[key];

      const card = document.createElement('article');
      card.className = 'algo-card';
      card.innerHTML = `
        <div class="algo-top">
          <span class="algo-name">${title}</span>
          <strong class="algo-value">${value.toFixed(1)}%</strong>
        </div>
        <p class="algo-desc">${desc}</p>
        <div class="algo-track">
          <div class="algo-fill" style="width:${value}%"></div>
        </div>
        <div class="algo-foot">
          <span>Weight <b>${(WEIGHTS[key] * 100).toFixed(0)}%</b></span>
          <span>Contribution <b>${contribution.toFixed(1)}</b></span>
        </div>
      `;
      container.appendChild(card);
    });
  }

  function renderDiff(data) {
    const { lcs, tokens_a, tokens_b } = data.matches || {};
    const diffTokens = data.diff;

    if (!diffTokens) {
      elements.results.matchNote.textContent = 'Matched-section highlighting is not available for this comparison.';
      elements.results.diffView.innerHTML = `
        <div class="empty-state">
          <h3>Match view unavailable</h3>
          <p>The analysis result is still valid, but the source preview could not be rebuilt.</p>
        </div>`;
      return;
    }

    // Highlight shared tokens
    const sharedIndices = new Set();
    (lcs?.matched_runs || []).forEach(run => {
      run.forEach(i => sharedIndices.add(i));
    });
    // Render code with highlights
    elements.results.diffView.innerHTML = `
      <div class="diff-column">
        ${renderCodeBlock(tokens_a, sharedIndices, 0)}
      </div>
      <div class="diff-column">
        ${renderCodeBlock(tokens_b, sharedIndices, 2)}
      </div>
    `;
    // Note about shared tokens
    elements.results.matchNote.textContent = lcs?.identifier_normalized
      ? 'Highlighted spans show exact overlap; the LCS score also considers identifier-normalized code.'
      : 'Highlighted spans show tokens shared by both submissions, in order.';
  }

  function renderCodeBlock(tokens, sharedIndices, offset) {
    const lines = [];
    let currentLine = { no: 1, tokens: [], match: false };
    let lineNumber = 1;

    tokens.forEach((token, index) => {
      const isMatch = sharedIndices.has(index);
      const tokenParts = token.split('\n');

      tokenParts.forEach((part, partIdx) => {
        if (partIdx > 0) {
          // Save previous line
          lines.push({ ...currentLine });
          currentLine = { no: ++lineNumber, tokens: [], match: false };
        }
        currentLine.tokens.push({ text: part, match: isMatch });
      });
    });
    lines.push(currentLine);

    return lines
      .map(lineData => `
        <div class="code-line ${lineData.match ? 'match' : ''}">
          <span class="line-no">${lineData.no}</span>
          <span class="line-code">
            ${lineData.tokens
              .map(t => t.match
                ? `<mark class="match">${escapeHtml(t.text)}</mark>`
                : escapeHtml(t.text))
              .join(' ')}
          </span>
        </div>`)
      .join('');
  }

  // ---- Collection Render ----
  function renderCollection(results) {
    const container = elements.collection.list;
    const panel = elements.collection.panel;

    if (!container || !panel) return;

    panel.hidden = false;
    container.innerHTML = '';

    if (!results.length) {
      container.innerHTML = `
        <div class="table-empty">
          <b>No stored comparison candidates</b>
          <span>Upload additional submissions to build a collection.</span>
        </div>`;
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    results.forEach((res, idx) => {
      const score = Number(JSON.parse(res.scores ?? '{}')?.final_score ?? 0);
      const level = shortClass(score);
      const badgeClass = level.toLowerCase().replace(' ', '-');

      const row = document.createElement('div');
      row.className = 'collection-row';
      row.innerHTML = `
        <div class="rank">${idx + 1}</div>
        <div>
          <div class="collection-name">${escapeHtml(res.file_name)}</div>
          <div class="collection-sub">${escapeHtml(res.status || 'completed')}</div>
        </div>
        <div class="collection-score" style="color:${scoreColor(score)}">${score.toFixed(1)}%</div>
        <span class="badge badge-${badgeClass}">${level}</span>
      `;

      row.style.cursor = 'pointer';
      row.addEventListener('click', () => {
        if (res.comparison_id) loadResults(res.comparison_id);
      });
      container.appendChild(row);
    });
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---- Load History ----
  async function loadHistory() {
    const list = elements.history.list;
    if (!list) return;

    try {
      const response = await fetch('/api/history');
      const rows = await response.json();

      if (!response.ok || !rows.length) {
        list.innerHTML = `<tr><td colspan="6"><div class="table-empty"><b>No history yet</b><span>Your completed comparisons will appear here.</span></div></td></tr>`;
        return;
      }

      list.innerHTML = '';
      rows.forEach(row => {
        const scoreData = (() => {
          try {
            return JSON.parse(row.scores ?? '{}');
          } catch {
            return {};
          }
        })();
        const score = Number(scoreData.final_score ?? 0);
        const color = score ? scoreColor(score) : '#8792a3';

        const dateStr = new Date(row.created_at?.replace(' ', 'T') + 'Z')
          .toLocaleString([], { day: '2-digit', month: 'short', year: 'numeric' })
          ?? row.created_at ?? '—';

        const level = score ? shortClass(score) : '';
        const badge = score
          ? `<span class="badge badge-${level.toLowerCase().replace(' ', '-') }">${level}</span>`
          : `<span class="status-cell">${escapeHtml(row.status || 'pending')}</span>`;

        const rowEl = document.createElement('tr');
        rowEl.innerHTML = `
          <td>${dateStr}</td>
          <td><div class="file-cell" title="${escapeHtml(row.file_name_1)}">${escapeHtml(row.file_name_1)}</div></td>
          <td><div class="file-cell" title="${escapeHtml(row.file_name_2)}">${escapeHtml(row.file_name_2)}</div></td>
          <td class="score-cell" style="color:${color}">${score ? score.toFixed(1) + '%' : '—'}</td>
          <td>${badge}</td>
          <td>
            <div class="history-actions">
              ${row.status === 'completed' ? `<button class="table-action view" type="button">View</button> <a class="table-action" href="/api/report/${row.id}">PDF</a>` : ''}
              <button class="table-action delete" type="button">Delete</button>
            </div>
          </td>`;
        // Attach handlers
        rowEl.querySelector('.view')?.addEventListener('click', () => loadResults(row.id));
        rowEl.querySelector('.delete')?.addEventListener('click', () => deleteHistory(row.id));

        list.appendChild(rowEl);
      });
    } catch {
      list.innerHTML = `<tr><td colspan="6"><div class="table-empty"><b>History could not be loaded</b><span>Refresh and try again.</span></div></td></tr>`;
    }
  }

  async function deleteHistory(id) {
    if (!confirm('Delete this comparison from history?')) return;
    try {
      const response = await fetch(`/api/history/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Could not delete comparison.');
      await loadHistory();
      showToast('Comparison deleted.');
    } catch (err) {
      showToast(err.message || 'Could not delete comparison.', 'error');
    }
  }

  // ---- System Health Check ----
  async function checkHealth() {
    const statusEl = getEl('systemStatus');
    if (!statusEl) return;
    try {
      const response = await fetch('/api/health');
      const data = await response.json();
      if (data.status === 'ok') {
        statusEl.textContent = 'Operational';
        statusEl.style.color = 'var(--success)';
      } else {
        statusEl.textContent = 'Attention';
        statusEl.style.color = 'var(--warning)';
      }
    } catch {
      statusEl.textContent = 'Offline';
      statusEl.style.color = 'var(--danger)';
    }
  }

  // ---- Modal Management ----
  function openModal(type) {
    const { backdrop, body } = elements.modal;
    if (!backdrop || !body) return;
    if (type === 'settings') {
      body.innerHTML = `
        <h3>Workspace Settings</h3>
        <p>Frontend presentation settings for this session. Backend processing remains unchanged.</p>
        <ul class="modal-list">
          <li><b>Theme</b>: PlagiScope light SaaS theme</li>
          <li><b>Analysis</b>: Uses the existing backend DSA + semantic scoring engine</li>
          <li><b>Upload limit</b>: 10 MB per file</li>
          <li><b>Supported files</b>: PDF, DOCX, TXT, C, CPP, PY, JAVA, JS, HTML, CSS</li>
        </ul>`;
    } else {
      body.innerHTML = `
        <h3>How PlagiScope works</h3>
        <p>Upload two submissions, run a comparison, then inspect the weighted similarity signals and matched content.</p>
        <ul class="modal-list">
          <li><b>1. Upload</b>: Drag or browse files</li>
          <li><b>2. Compare</b>: Backend runs preprocessing, DSA signals, semantic similarity</li>
          <li><b>3. Review</b>: Final score, breakdown, matched tokens</li>
          <li><b>4. Report</b>: Download PDF report after comparison</li>
        </ul>`;
    }
    backdrop.hidden = false;
  }

  getEl('modalClose')?.addEventListener('click', () => {
    elements.modal.backdrop.hidden = true;
  });
  elements.modal.backdrop?.addEventListener('click', (e) => {
    if (e.target === elements.modal.backdrop) {
      elements.modal.backdrop.hidden = true;
    }
  });

  // ---- Sidebar & Navigation ----
  const sidebar = getEl('sidebar');
  const overlay = getEl('mobileOverlay');
  getEl('menuBtn')?.addEventListener('click', () => {
    sidebar.classList.add('open');
    overlay.classList.add('show');
  });
  getEl('closeSidebar')?.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
  });
  overlay?.addEventListener('click', () => {
    sidebar?.classList.remove('open');
    overlay.classList.remove('show');
  });
  document.querySelectorAll('.nav-item[href]').forEach((link) => {
    link.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach((el) => el.classList.remove('active'));
      link.classList.add('active');
      sidebar?.classList.remove('open');
      overlay?.classList.remove('show');
    });
  });

  // ---- Initialize ----
  function init() {
    refreshActionButtons();
    checkHealth();
    loadHistory();
  }

  init();

  // Optional: add theme toggle, accessibility improvements, and other UX enhancements

})();
