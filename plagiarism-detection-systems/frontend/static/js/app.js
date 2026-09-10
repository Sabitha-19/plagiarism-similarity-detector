(() => {
  'use strict';

  const state = {
    submissions: { A: null, B: null },
    pollTimer: null,
  };

  const el = (id) => document.getElementById(id);
  const elements = {
    dropzoneA: el('dropzoneA'),
    dropzoneB: el('dropzoneB'),
    compareBtn: el('compareBtn'),
    compareAllBtn: el('compareAllBtn'),
    progressPanel: el('progressPanel'),
    progressFill: el('progressFill'),
    progressStage: el('progressStage'),
    progressPercent: el('progressPercent'),
    toastContainer: el('toast'),
    emptyState: el('emptyState'),
    resultContent: el('resultContent'),
    gaugeRing: el('gaugeRing'),
    finalScore: el('finalScore'),
    classificationBadge: el('classification'),
    breakdownContainer: el('breakdown'),
    matchNote: el('matchNote'),
    diffSubNote: el('diffSubNote'),
    diffView: el('diffView'),
    reportDownload: el('downloadReport'),
  };

  // Score -> color only drives the gauge/badge tint. The label text itself
  // always comes from the backend (config.CLASSIFICATION_BANDS), not from
  // thresholds duplicated here.
  const COLORS = { low: '#4bbaa6', mid: '#8b8fe8', high: '#e8a33d', veryHigh: '#e2635f' };
  const scoreColor = (score) =>
    score > 80 ? COLORS.veryHigh :
    score > 60 ? COLORS.high :
    score > 40 ? COLORS.mid :
    COLORS.low;

  const ALGO_NAMES = {
    rabin_karp: 'Rabin–Karp',
    hashing: 'Hashing',
    lcs: 'LCS',
    edit_distance: 'Edit Distance',
    semantic: 'Semantic Similarity',
  };
  const getAlgorithmName = (key) => ALGO_NAMES[key] || key;

  const escapeHtml = (str) =>
    String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const showToast = (msg, type = 'ok') => {
    if (!elements.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${type === 'error' ? '⚠' : '✓'}</span><span>${escapeHtml(msg)}</span>`;
    elements.toastContainer.appendChild(toast);
    toast.style.opacity = 0;
    requestAnimationFrame(() => { toast.style.opacity = 1; });
    setTimeout(() => {
      toast.style.opacity = 0;
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  };

  const setProgress = (stage, percent = null) => {
    if (!elements.progressPanel) return;
    elements.progressPanel.hidden = false;
    if (elements.progressStage) elements.progressStage.textContent = humanizeStage(stage);
    if (elements.progressPercent) elements.progressPercent.textContent = percent !== null ? `${percent}%` : '';
    if (elements.progressFill) elements.progressFill.style.width = percent !== null ? `${percent}%` : '0%';
  };

  const resetProgress = () => {
    if (elements.progressPanel) elements.progressPanel.hidden = true;
  };

  // Matches the stage names comparison_service.py actually emits.
  const humanizeStage = (stage) => {
    const labels = {
      queued: 'Queued',
      extracting: 'Extracting and preprocessing files',
      running_dsa_algorithms: 'Running Rabin–Karp, hashing, LCS, edit distance',
      computing_semantic_similarity: 'Computing semantic similarity',
      scoring: 'Combining hybrid score',
      comparing: 'Comparing against stored submissions',
      done: 'Done',
    };
    return labels[stage] || stage || 'Working';
  };

  // ---------------------------------------------------------- uploads

  const setupDropzone = (zone, slot) => {
    const fileInput = el(`file${slot}`);
    zone.addEventListener('click', (e) => {
      if (e.target.closest('.file-remove')) return;
      fileInput.click();
    });
    zone.addEventListener('dragenter', e => { e.preventDefault(); zone.classList.add('is-dragover'); });
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('is-dragover'); });
    zone.addEventListener('dragleave', e => { e.preventDefault(); zone.classList.remove('is-dragover'); });
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('is-dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFileUpload(e.dataTransfer.files[0], slot);
      }
    });
    fileInput?.addEventListener('change', () => {
      if (fileInput.files && fileInput.files[0]) {
        handleFileUpload(fileInput.files[0], slot);
      }
    });
  };

  const handleFileUpload = async (file, slot) => {
    if (!file) return;
    updateUploadState(slot, 'Uploading…', false);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Upload failed.');
      state.submissions[slot] = data;
      updateUploadState(slot, `Uploaded · ${data.file_type} · ready`, true, data.file_name);
      showToast(`${data.file_name} is ready for analysis.`);
    } catch (err) {
      updateUploadState(slot, err.message || 'Upload failed.', false);
      showToast(err.message || 'Upload failed.', 'error');
    }
    refreshButtons();
  };

  const updateUploadState = (slot, message, success, filename = '') => {
    const zone = elements[`dropzone${slot}`];
    const statusEl = el(`status${slot}`);
    const labelEl = el(`label${slot}`);
    const checkEl = el(`check${slot}`);
    const metaEl = el(`meta${slot}`);
    zone?.classList.toggle('is-ok', !!success);
    if (statusEl) {
      statusEl.textContent = message;
      statusEl.className = `field-status ${success ? 'is-ok' : (message ? 'is-error' : '')}`;
    }
    if (labelEl) labelEl.textContent = filename || 'Drag & drop your file here';
    if (checkEl) {
      checkEl.textContent = success ? '✓' : '○';
      checkEl.classList.toggle('is-ok', !!success);
    }
    if (metaEl) {
      metaEl.hidden = !success;
      if (success) {
        metaEl.innerHTML = `<span class="meta-name">${escapeHtml(filename)}</span><button class="file-remove" aria-label="Replace file">×</button>`;
        metaEl.querySelector('.file-remove')?.addEventListener('click', (e) => { e.stopPropagation(); resetUpload(slot); });
      }
    }
  };

  const resetUpload = (slot) => {
    el(`file${slot}`).value = '';
    state.submissions[slot] = null;
    updateUploadState(slot, '', false);
    refreshButtons();
  };

  const refreshButtons = () => {
    if (elements.compareBtn) elements.compareBtn.disabled = !(state.submissions.A && state.submissions.B);
    if (elements.compareAllBtn) elements.compareAllBtn.disabled = !state.submissions.A;
  };

  setupDropzone(elements.dropzoneA, 'A');
  setupDropzone(elements.dropzoneB, 'B');

  // ---------------------------------------------------------- compare

  const startComparison = async () => {
    if (!state.submissions.A || !state.submissions.B) {
      showToast('Please upload both submissions first.', 'error');
      return;
    }
    setProgress('queued', 0);
    try {
      const res = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submission_id_1: state.submissions.A.submission_id,
          submission_id_2: state.submissions.B.submission_id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start comparison.');
      pollJob(data.job_id, () => loadResults(data.comparison_id));
    } catch (err) {
      resetProgress();
      showToast(err.message || 'Comparison failed.', 'error');
    }
  };

  const compareAgainstAll = async () => {
    if (!state.submissions.A) {
      showToast('Please upload Submission A first.', 'error');
      return;
    }
    setProgress('queued', 0);
    try {
      const res = await fetch('/api/compare-against-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: state.submissions.A.submission_id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start collection comparison.');
      pollJob(data.job_id, (job) => {
        const top = job.result && job.result.results && job.result.results[0];
        if (top) {
          loadResults(top.comparison_id);
        } else {
          loadHistory();
          showToast('No other stored submissions to compare against yet.');
        }
      });
    } catch (err) {
      resetProgress();
      showToast(err.message || 'Comparison failed.', 'error');
    }
  };

  const pollJob = (jobId, onDone) => {
    clearInterval(state.pollTimer);
    state.pollTimer = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        const job = await res.json();
        if (!res.ok) throw new Error(job.error || 'Job status fetch failed.');
        setProgress(job.stage, job.progress);
        if (job.status === 'completed') {
          clearInterval(state.pollTimer);
          resetProgress();
          onDone(job);
        } else if (job.status === 'failed') {
          clearInterval(state.pollTimer);
          resetProgress();
          showToast(`Comparison failed: ${job.error || 'unknown error'}`, 'error');
        }
      } catch (err) {
        clearInterval(state.pollTimer);
        resetProgress();
        showToast('Unable to read analysis status. Please retry.', 'error');
      }
    }, 650);
  };

  // ---------------------------------------------------------- results

  const loadResults = async (comparisonId) => {
    try {
      const res = await fetch(`/api/results/${comparisonId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load results.');

      if (data.status !== 'completed' || !data.scores) {
        showToast(
          data.status === 'failed'
            ? `That comparison failed: ${data.error || 'unknown error'}`
            : 'That comparison is still running — check back shortly.',
          'error'
        );
        return;
      }

      renderResults(data);
      loadHistory();
      location.hash = 'resultsSection';
      showToast('Comparison finished successfully.');
    } catch (err) {
      showToast(err.message || 'Failed to load results.', 'error');
    }
  };

  const renderResults = (data) => {
    if (elements.emptyState) elements.emptyState.hidden = true;
    if (elements.resultContent) elements.resultContent.hidden = false;

    const score = Number(data.scores?.final_score || 0);
    const color = scoreColor(score);

    renderScoreRing(score, color);

    if (elements.finalScore) {
      elements.finalScore.textContent = `${score.toFixed(1)}%`;
      elements.finalScore.style.color = color;
    }

    // The classification label always comes from the backend
    // (config.CLASSIFICATION_BANDS), never recomputed client-side.
    if (elements.classificationBadge) {
      elements.classificationBadge.textContent = data.classification || 'Unclassified';
      elements.classificationBadge.style.backgroundColor = color;
    }

    const nameA = data.submission_1?.file_name || 'Submission A';
    const nameB = data.submission_2?.file_name || 'Submission B';
    if (elements.matchNote) {
      elements.matchNote.textContent = `${nameA}  vs.  ${nameB}`;
    }

    renderBreakdown(data.scores?.breakdown || {});
    renderDiff(data);

    if (elements.reportDownload) {
      elements.reportDownload.href = `/api/report/${data.id}`;
      elements.reportDownload.hidden = false;
    }
  };

  const renderScoreRing = (score, color) => {
    if (!elements.gaugeRing) return;
    const radius = 80;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference * (1 - Math.max(0, Math.min(100, score)) / 100);
    elements.gaugeRing.style.stroke = color;
    elements.gaugeRing.style.strokeDasharray = `${circumference} ${circumference}`;
    elements.gaugeRing.style.strokeDashoffset = circumference;
    requestAnimationFrame(() => {
      elements.gaugeRing.style.strokeDashoffset = dashOffset;
    });
  };

  const renderBreakdown = (breakdown) => {
    if (!elements.breakdownContainer) return;
    elements.breakdownContainer.innerHTML = '';
    Object.entries(breakdown).forEach(([algo, value]) => {
      const val = Math.max(0, Math.min(100, Number(value) || 0));
      const row = document.createElement('div');
      row.className = 'breakdown-row';
      row.innerHTML = `
        <div class="breakdown-header">${getAlgorithmName(algo)}</div>
        <div class="breakdown-bar"><div class="breakdown-progress" style="width:0%"></div></div>
        <div class="breakdown-value">${val.toFixed(1)}%</div>
      `;
      elements.breakdownContainer.appendChild(row);
      requestAnimationFrame(() => {
        row.querySelector('.breakdown-progress').style.width = `${val}%`;
      });
    });
  };

  // /api/results puts the raw token streams under data.diff (rebuilt
  // server-side from the stored files) and the matched-run spans under
  // data.matches.lcs — they live in different places on purpose.
  const renderDiff = (data) => {
    const diff = data.diff;
    const lcs = data.matches && data.matches.lcs;

    if (!diff) {
      if (elements.diffSubNote) {
        elements.diffSubNote.textContent = 'Matched-section highlighting is not available for this comparison.';
      }
      if (elements.diffView) elements.diffView.innerHTML = '';
      return;
    }

    if (elements.diffSubNote) {
      elements.diffSubNote.textContent = lcs && lcs.identifier_normalized
        ? 'Highlighted spans show exact overlap; the score above also accounts for simple variable/function renaming.'
        : 'Shared tokens are highlighted across both files, in order.';
    }

    const runs = (lcs && lcs.matched_runs) || [];
    if (elements.diffView) {
      elements.diffView.innerHTML = `
        <div class="diff-container">
          <div class="diff-block">${renderDiffLines(diff.tokens_a, runs, 0)}</div>
          <div class="diff-block">${renderDiffLines(diff.tokens_b, runs, 2)}</div>
        </div>`;
    }
  };

  // runs: array of [startA, endA, startB, endB]; sideOffset picks the pair
  // of indices to read (0,1 for side A, 2,3 for side B).
  const renderDiffLines = (tokens, runs, sideOffset) => {
    const covered = new Set();
    runs.forEach((run) => {
      for (let i = run[sideOffset]; i <= run[sideOffset + 1]; i++) covered.add(i);
    });

    const lines = [];
    let currentLine = { no: 1, tokens: [] };
    let lineNumber = 1;
    tokens.forEach((token, index) => {
      const isMatch = covered.has(index);
      const parts = String(token).split('\n');
      parts.forEach((part, pIdx) => {
        if (pIdx > 0) {
          lines.push(currentLine);
          currentLine = { no: ++lineNumber, tokens: [] };
        }
        currentLine.tokens.push({ text: part, match: isMatch });
      });
    });
    lines.push(currentLine);

    return lines.map(line => `
      <div class="diff-line ${line.tokens.some(t => t.match) ? 'match' : ''}">
        <span class="line-no">${line.no}</span>
        <span class="line-code">${line.tokens.map(t => t.match ? `<mark class="match">${escapeHtml(t.text)}</mark>` : escapeHtml(t.text)).join(' ')}</span>
      </div>`).join('');
  };

  // ---------------------------------------------------------- history

  const loadHistory = async () => {
    const table = el('historyTable');
    if (!table) return;
    try {
      const res = await fetch('/api/history');
      const rows = await res.json();
      if (!res.ok || !rows.length) {
        table.innerHTML = '<tr><td colspan="6" class="empty-state"><b>No history yet</b>Your completed comparisons will appear here.</td></tr>';
        return;
      }
      table.innerHTML = '';
      rows.forEach(row => {
        // /api/history already parses `scores` into an object server-side
        // (see _comparison_public in app.py) — it is not a JSON string here.
        const score = Number(row.scores?.final_score ?? 0);
        const hasScore = row.status === 'completed' && row.scores;
        const color = hasScore ? scoreColor(score) : 'var(--muted-2)';
        const rowEl = document.createElement('tr');
        rowEl.className = 'history-row';
        rowEl.innerHTML = `
          <td>${new Date(row.created_at).toLocaleString()}</td>
          <td class="history-files">${escapeHtml(row.file_name_1)}</td>
          <td class="history-files">${escapeHtml(row.file_name_2)}</td>
          <td class="history-score" style="color:${color}">${hasScore ? score.toFixed(1) + '%' : row.status}</td>
          <td>${hasScore ? escapeHtml(row.classification || '—') : '—'}</td>
          <td>
            <div class="history-actions">
              <button class="history-button view">View</button>
              <button class="history-button delete">Delete</button>
            </div>
          </td>`;
        rowEl.querySelector('.view')?.addEventListener('click', () => {
          if (row.status === 'completed') loadResults(row.id);
          else showToast(row.status === 'failed' ? `Comparison failed: ${row.error || 'unknown error'}` : 'Still running — check back shortly.', 'error');
        });
        rowEl.querySelector('.delete')?.addEventListener('click', () => deleteHistory(row.id));
        table.appendChild(rowEl);
      });
    } catch {
      table.innerHTML = '<tr><td colspan="6" class="empty-state"><b>Failed to load history</b></td></tr>';
    }
  };

  const deleteHistory = async (id) => {
    if (!confirm('Delete this comparison from history?')) return;
    try {
      const res = await fetch(`/api/history/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete.');
      await loadHistory();
      showToast('Deleted from history.');
    } catch (err) {
      showToast(err.message || 'Deletion failed.', 'error');
    }
  };

  // ---------------------------------------------------------- nav + boot

  document.querySelectorAll('.nav-item').forEach(link => {
    link.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
    });
  });

  elements.compareBtn?.addEventListener('click', startComparison);
  elements.compareAllBtn?.addEventListener('click', compareAgainstAll);

  refreshButtons();
  loadHistory();
})();
