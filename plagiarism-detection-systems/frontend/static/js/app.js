(() => {
  'use strict';

  const state = {
    submissions: { A: null, B: null },
    pollTimer: null,
    toastTimer: null,
  };

  // Elements selectors
  const el = (id) => document.getElementById(id);
  const elements = {
    dropzoneA: el('dropzoneA'),
    dropzoneB: el('dropzoneB'),
    fileA: el('fileA'),
    fileB: el('fileB'),
    compareBtn: el('compareBtn'),
    compareAllBtn: el('compareAllBtn'),
    progressPanel: el('progressPanel'),
    progressFill: el('progressFill'),
    progressStage: el('progressStage'),
    progressPercent: el('progressPercent'),
    toastContainer: el('toast'),
    resultContent: el('resultContent'),
    gaugeRing: el('gaugeRing'),
    finalScore: el('finalScore'),
    classificationBadge: el('classification'),
    breakdownContainer: el('breakdown'),
    matchNote: el('matchNote'),
    diffView: el('diffView'),
    reportDownload: el('downloadReport'),
    historyTable: el('historyTable'),
    toast: el('toast'),
  };

  // Utility functions
  const showToast = (msg, type='ok') => {
    if (!elements.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      ${type === 'error' ? '!' : '✓'} ${msg}
    `;
    elements.toastContainer.appendChild(toast);
    toast.style.opacity = 0;
    setTimeout(() => {
      toast.style.opacity = 1;
    }, 10);
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => {
      toast.style.opacity = 0;
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  };

  const setProgress = (stage, percent=null) => {
    if (!elements.progressPanel) return;
    elements.progressPanel.hidden = false;
    if (elements.progressStage) {
      elements.progressStage.textContent = stage;
    }
    if (elements.progressPercent) {
      elements.progressPercent.textContent = percent !== null ? `${percent}%` : '';
    }
    if (elements.progressFill) {
      elements.progressFill.style.width = percent !== null ? `${percent}%` : '0%';
    }
  };

  const resetProgress = () => {
    setProgress('Queued', 0);
    if (elements.progressPanel) {
      elements.progressPanel.hidden = true;
    }
  };

  // Drag & Drop setup
  const setupDropzone = (zone, slot) => {
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
    // Also listen to file input changes if any
    const fileInput = el(`file${slot}`);
    fileInput?.addEventListener('change', () => {
      if (fileInput.files && fileInput.files[0]) {
        handleFileUpload(fileInput.files[0], slot);
      }
    });
  };

  const handleFileUpload = async (file, slot) => {
    // Validate file size/type if needed
    if (!file) return;
    updateUploadState(slot, 'Uploading…', false);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Upload failed.');
      // Save state
      state.submissions[slot] = data;
      updateUploadState(slot, `Uploaded • ${data.file_type} • ready`, true, data.file_name);
      showToast(`${data.file_name} is ready for analysis.`);
    } catch (err) {
      updateUploadState(slot, err.message || 'Upload failed.', false);
      showToast(err.message || 'Upload failed.', 'error');
    }
    refreshButtons();
  };

  const updateUploadState = (slot, message, success, filename='') => {
    const statusEl = el(`status${slot}`);
    const labelEl = el(`label${slot}`);
    const checkEl = el(`check${slot}`);
    const metaEl = el(`meta${slot}`);
    if (statusEl) {
      statusEl.textContent = message;
      statusEl.className = `field-status ${success ? 'is-ok' : 'is-error'}`;
    }
    if (labelEl) {
      labelEl.textContent = filename || 'Drag & drop your file here';
    }
    if (checkEl) {
      checkEl.textContent = success ? '✓' : '○';
    }
    if (metaEl) {
      metaEl.hidden = !success;
      if (success) {
        metaEl.innerHTML = `
          <span class="meta-name">${escapeHtml(filename)}</span>
          <button class="file-remove" aria-label="Replace file">×</button>
        `;
        metaEl.querySelector('.file-remove')?.addEventListener('click', () => resetUpload(slot));
      }
    }
  };

  const resetUpload = (slot) => {
    el(`file${slot}`).value = '';
    updateUploadState(slot, 'Drag & drop your file here', false);
    refreshButtons();
  };

  const refreshButtons = () => {
    if (elements.compareBtn) {
      elements.compareBtn.disabled = !(state.submissions.A && state.submissions.B);
    }
    if (elements.compareAllBtn) {
      elements.compareAllBtn.disabled = !state.submissions.A;
    }
  };

  // Setup dropzones
  setupDropzone(elements.dropzoneA, 'A');
  setupDropzone(elements.dropzoneB, 'B');

  // Comparison action
  const startComparison = async () => {
    if (!state.submissions.A || !state.submissions.B) {
      showToast('Please upload both submissions first.', 'error');
      return;
    }
    setProgress('Preparing comparison', 0);
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
      pollJob(data.job_id, (job) => loadResults(job.comparison_id));
    } catch (err) {
      resetProgress();
      showToast(err.message || 'Comparison failed.', 'error');
    }
  };

  // Compare against all
  const compareAgainstAll = async () => {
    if (!state.submissions.A) {
      showToast('Please upload Submission A first.', 'error');
      return;
    }
    setProgress('Comparing against collection', 0);
    try {
      const res = await fetch('/api/compare-against-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: state.submissions.A.submission_id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start collection comparison.');
      pollJob(data.job_id, (job) => {
        resetProgress();
        renderCollection(job.result?.results || []);
        loadHistory();
      });
    } catch (err) {
      resetProgress();
      showToast(err.message || 'Comparison failed.', 'error');
    }
  };

  // Poll job status
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
          showToast(`Comparison failed: ${job.error}`, 'error');
        }
      } catch (err) {
        clearInterval(state.pollTimer);
        resetProgress();
        showToast('Unable to read analysis status. Please retry.', 'error');
      }
    }, 650);
  };

  // Load results
  const loadResults = async (comparisonId) => {
    try {
      const res = await fetch(`/api/results/${comparisonId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load results.');
      renderResults(data);
      loadHistory();
      location.hash = 'resultsSection';
      showToast('Comparison finished successfully.');
    } catch (err) {
      showToast(err.message || 'Failed to load results.', 'error');
    }
  };

  // Render result UI
  const renderResults = (data) => {
    // Clear previous
    if (elements.resultContent) {
      elements.resultContent.innerHTML = '';
      elements.resultContent.hidden = false;
    }
    // Score ring
    const score = Number(data.scores?.final_score || 0);
    const color = score > 80 ? 'var(--mint)' :
                  score > 60 ? 'var(--cyan)' :
                  score > 40 ? '#FFA500' : // orange for moderate
                  'var(--coral)';
    // Animate ring
    renderScoreRing(score, color);
    // Show score percentage
    if (elements.finalScore) {
      elements.finalScore.textContent = `${score.toFixed(1)}%`;
      elements.finalScore.style.color = color;
    }
    // Classification badge
    const classification = classifyScore(score);
    if (elements.classificationBadge) {
      elements.classificationBadge.textContent = classification;
      elements.classificationBadge.style.backgroundColor = classifyColor(score);
    }
    // File names
    const nameA = data.submission_1?.file_name || 'Submission A';
    const nameB = data.submission_2?.file_name || 'Submission B';
    // Algorithm breakdown
    renderBreakdown(data.scores?.breakdown || {});
    // Matched content diff
    renderDiff(data);
    // Download report link
    if (elements.reportDownload) {
      elements.reportDownload.href = `/api/report/${data.id}`;
      elements.reportDownload.hidden = false;
    }
  };

  const renderScoreRing = (score, color) => {
    if (!elements.gaugeRing) return;
    const ring = elements.gaugeRing;
    // Assume SVG circle with stroke-dasharray
    const radius = 90;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference * (1 - score / 100);
    ring.style.stroke = color;
    ring.style.strokeDasharray = `${circumference} ${circumference}`;
    ring.style.strokeDashoffset = dashOffset;
  };

  const classifyScore = (score) => {
    if (score >= 80) return 'Very High';
    if (score >= 60) return 'High';
    if (score >= 40) return 'Moderate';
    if (score >= 20) return 'Low';
    return 'Very Low';
  };

  const classifyColor = (score) => {
    if (score >= 80) return 'var(--mint)';
    if (score >= 60) return 'var(--cyan)';
    if (score >= 40) return 'orange';
    if (score >= 20) return 'pink';
    return 'gray';
  };

  const renderBreakdown = (breakdown) => {
    if (!elements.breakdownContainer) return;
    elements.breakdownContainer.innerHTML = '';
    Object.entries(breakdown).forEach(([algo, value]) => {
      const val = Math.max(0, Math.min(100, value));
      const card = document.createElement('div');
      card.className = 'breakdown-card';
      card.innerHTML = `
        <div class="breakdown-header">${getAlgorithmName(algo)}</div>
        <div class="breakdown-bar">
          <div class="breakdown-progress" style="width:${val}%;"></div>
        </div>
        <div class="breakdown-value">${val.toFixed(1)}%</div>
      `;
      elements.breakdownContainer.appendChild(card);
    });
  };

  const getAlgorithmName = (key) => {
    const names = {
      rabin_karp: 'Rabin–Karp',
      hashing: 'Hashing',
      lcs: 'LCS',
      edit_distance: 'Edit Distance',
      semantic: 'Semantic Similarity',
    };
    return names[key] || key;
  };

  const renderDiff = (data) => {
    if (!data.matches || !data.diff) {
      if (elements.matchNote) elements.matchNote.textContent = 'Matching info unavailable.';
      if (elements.diffView) {
        elements.diffView.innerHTML = '<div class="empty-state"><h3>Match view unavailable</h3><p>The analysis result is valid, but the diff cannot be displayed.</p></div>';
      }
      return;
    }
    const { tokens_a, tokens_b, lcs } = data.matches;
    const matchedIndices = new Set((lcs?.matched_runs || []).flat());
    // Render for file A
    if (elements.diffView) {
      elements.diffView.innerHTML = `
        <div class="diff-container">
          <div class="diff-block">${renderDiffLines(tokens_a, matchedIndices, 0)}</div>
          <div class="diff-block">${renderDiffLines(tokens_b, matchedIndices, 2)}</div>
        </div>`;
    }
    if (elements.matchNote) {
      elements.matchNote.textContent = lcs?.identifier_normalized
        ? 'Highlighted spans show exact overlap; the LCS score also considers normalized code.'
        : 'Shared tokens are highlighted.';
    }
  };

  const renderDiffLines = (tokens, matchedIndices, offset) => {
    const lines = [];
    let currentLine = { no: 1, tokens: [], match: false };
    let lineNumber = 1;
    tokens.forEach((token, index) => {
      const isMatch = matchedIndices.has(index);
      const parts = token.split('\n');
      parts.forEach((part, pIdx) => {
        if (pIdx > 0) {
          lines.push({ ...currentLine });
          currentLine = { no: ++lineNumber, tokens: [], match: false };
        }
        currentLine.tokens.push({ text: part, match: isMatch });
      });
    });
    lines.push(currentLine);
    return lines.map(line => `
      <div class="diff-line ${line.match ? 'match' : ''}">
        <span class="line-no">${line.no}</span>
        <span class="line-code">
          ${line.tokens.map(t => t.match ? `<mark class="match">${escapeHtml(t.text)}</mark>` : escapeHtml(t.text)).join(' ')}
        </span>
      </div>`).join('');
  };

  const escapeHtml = (str) => {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  // Load history
  const loadHistory = async () => {
    if (!el('historyTable')) return;
    try {
      const res = await fetch('/api/history');
      const rows = await res.json();
      if (!res.ok || !rows.length) {
        el('historyTable').innerHTML = '<tr><td colspan="6" class="empty-state"><b>No history yet</b><br>Your completed comparisons will appear here.</td></tr>';
        return;
      }
      const tbody = document.createElement('tbody');
      rows.forEach(row => {
        const scoreObj = (() => {
          try { return JSON.parse(row.scores ?? '{}'); } catch { return {}; }
        })();
        const score = Number(scoreObj.final_score ?? 0);
        const classification = classifyScore(score);
        const rowEl = document.createElement('tr');
        rowEl.className = 'history-row';
        rowEl.innerHTML = `
          <td>${new Date(row.created_at).toLocaleString()}</td>
          <td class="history-files">${escapeHtml(row.file_name_1)}</td>
          <td class="history-files">${escapeHtml(row.file_name_2)}</td>
          <td class="history-score" style="color:${score > 80 ? 'var(--mint)' : score > 60 ? 'var(--cyan)' : '#FFA500'}">${score.toFixed(1)}%</td>
          <td>${classification}</td>
          <td>
            <div class="history-actions">
              <button class="history-button view">View</button>
              <button class="history-button delete">Delete</button>
            </div>
          </td>`;
        rowEl.querySelector('.view')?.addEventListener('click', () => loadResults(row.id));
        rowEl.querySelector('.delete')?.addEventListener('click', () => deleteHistory(row.id));
        tbody.appendChild(rowEl);
      });
      el('historyTable').innerHTML = '';
      el('historyTable').appendChild(tbody);
    } catch {
      el('historyTable').innerHTML = '<tr><td colspan="6" class="empty-state"><b>Failed to load history</b></td></tr>';
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

  // Initialize event listeners
  document.querySelectorAll('.nav-item').forEach(link => {
    link.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
    });
  });

  el('compareBtn')?.addEventListener('click', startComparison);
  el('compareAllBtn')?.addEventListener('click', compareAgainstAll);

  // Main functions
  const startComparison = async () => {
    if (!state.submissions.A || !state.submissions.B) {
      showToast('Please upload both files', 'error');
      return;
    }
    setProgress('Starting comparison', 0);
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
      if (!res.ok) throw new Error(data.error || 'Failed to start');
      pollJob(data.job_id, () => loadResults(data.comparison_id));
    } catch (err) {
      resetProgress();
      showToast(err.message, 'error');
    }
  };

  const compareAgainstAll = async () => {
    if (!state.submissions.A) {
      showToast('Upload Submission A first', 'error');
      return;
    }
    setProgress('Comparing against collection', 0);
    try {
      const res = await fetch('/api/compare-against-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: state.submissions.A.submission_id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start collection compare');
      pollJob(data.job_id, (job) => {
        resetProgress();
        renderCollection(job.result?.results || []);
        loadHistory();
      });
    } catch (err) {
      resetProgress();
      showToast(err.message, 'error');
    }
  };

  const pollJob = (jobId, onDone) => {
    clearInterval(state.pollTimer);
    state.pollTimer = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        const job = await res.json();
        if (!res.ok) throw new Error(job.error || 'Job fetch error');
        setProgress(job.stage, job.progress);
        if (job.status === 'completed') {
          clearInterval(state.pollTimer);
          resetProgress();
          onDone(job);
        } else if (job.status === 'failed') {
          clearInterval(state.pollTimer);
          resetProgress();
          showToast(`Comparison failed: ${job.error}`, 'error');
        }
      } catch {
        clearInterval(state.pollTimer);
        resetProgress();
        showToast('Unable to read job status. Retry.', 'error');
      }
    }, 650);
  };

  const loadResults = async (comparisonId) => {
    try {
      const res = await fetch(`/api/results/${comparisonId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      renderResults(data);
      loadHistory();
      location.hash = 'resultsSection';
      showToast('Comparison completed.');
    } catch (err) {
      showToast(err.message || 'Failed to load results', 'error');
    }
  };

  const renderResults = (data) => {
    // Show results container
    if (!elements.resultContent) return;
    elements.resultContent.hidden = false;
    // Score ring
    const score = Number(data.scores?.final_score || 0);
    const color = score > 80 ? 'var(--mint)' :
                  score > 60 ? 'var(--cyan)' :
                  score > 40 ? '#FFA500' :
                  'var(--coral)';
    renderScoreRing(score, color);
    // Final score
    if (elements.finalScore) {
      elements.finalScore.textContent = `${score.toFixed(1)}%`;
      elements.finalScore.style.color = color;
    }
    // Classification badge
    const classification = classifyScore(score);
    if (elements.classificationBadge) {
      elements.classificationBadge.textContent = classification;
      elements.classificationBadge.style.backgroundColor = classifyColor(score);
    }
    // Render breakdown
    renderBreakdown(data.scores?.breakdown || {});
    // Render diff
    renderDiff(data);
    // Report button
    if (elements.reportDownload) {
      elements.reportDownload.href = `/api/report/${data.id}`;
      elements.reportDownload.hidden = false;
    }
  };

  const renderScoreRing = (score, color) => {
    const ring = el('gaugeRing');
    if (!ring) return;
    const radius = 80;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference * (1 - score / 100);
    ring.style.stroke = color;
    ring.style.strokeDasharray = `${circumference} ${circumference}`;
    ring.style.strokeDashoffset = offset;
  };

  const classifyScore = (score) => {
    if (score >= 80) return 'Very High';
    if (score >= 60) return 'High';
    if (score >= 40) return 'Moderate';
    if (score >= 20) return 'Low';
    return 'Very Low';
  };

  const classifyColor = (score) => {
    if (score >= 80) return 'var(--mint)';
    if (score >= 60) return 'var(--cyan)';
    if (score >= 40) return '#FFA500';
    if (score >= 20) return 'pink';
    return 'gray';
  };

  const renderBreakdown = (breakdown) => {
    if (!el('breakdown')) return;
    const container = el('breakdown');
    container.innerHTML = '';
    Object.entries(breakdown).forEach(([algo, value]) => {
      const val = Math.max(0, Math.min(100, value));
      const card = document.createElement('div');
      card.className = 'breakdown-card';
      card.innerHTML = `
        <div class="breakdown-header">${getAlgorithmName(algo)}</div>
        <div class="breakdown-bar">
          <div class="breakdown-progress" style="width:${val}%"></div>
        </div>
        <div class="breakdown-value">${val.toFixed(1)}%</div>
      `;
      container.appendChild(card);
    });
  };

  const getAlgorithmName = (key) => {
    const names = {
      rabin_karp: 'Rabin–Karp',
      hashing: 'Hashing',
      lcs: 'LCS',
      edit_distance: 'Edit Distance',
      semantic: 'Semantic Similarity',
    };
    return names[key] || key;
  };

  const renderDiff = (data) => {
    if (!data.matches || !data.diff) {
      if (el('matchNote')) el('matchNote').textContent = 'Matching info unavailable.';
      if (el('diffView')) {
        el('diffView').innerHTML = '<div class="empty-state"><h3>Match view unavailable</h3><p>The analysis result is valid, but the diff cannot be displayed.</p></div>';
      }
      return;
    }
    const { tokens_a, tokens_b, lcs } = data.matches;
    const matchedIndices = new Set((lcs?.matched_runs || []).flat());
    if (el('diffView')) {
      el('diffView').innerHTML = `
        <div class="diff-container">
          <div class="diff-block">${renderDiffLines(tokens_a, matchedIndices, 0)}</div>
          <div class="diff-block">${renderDiffLines(tokens_b, matchedIndices, 2)}</div>
        </div>`;
    }
    if (el('matchNote')) {
      el('matchNote').textContent = lcs?.identifier_normalized
        ? 'Highlighted spans show exact overlap; the LCS score also considers normalized code.'
        : 'Shared tokens are highlighted.';
    }
  };

  const renderDiffLines = (tokens, matchedIndices, offset) => {
    const lines = [];
    let currentLine = { no: 1, tokens: [], match: false };
    let lineNumber = 1;
    tokens.forEach((token, index) => {
      const isMatch = matchedIndices.has(index);
      const parts = token.split('\n');
      parts.forEach((part, pIdx) => {
        if (pIdx > 0) {
          lines.push({ ...currentLine });
          currentLine = { no: ++lineNumber, tokens: [], match: false };
        }
        currentLine.tokens.push({ text: part, match: isMatch });
      });
    });
    lines.push(currentLine);
    return lines.map(line => `
      <div class="diff-line ${line.match ? 'match' : ''}">
        <span class="line-no">${line.no}</span>
        <span class="line-code">
          ${line.tokens.map(t => t.match ? `<mark class="match">${escapeHtml(t.text)}</mark>` : escapeHtml(t.text)).join(' ')}
        </span>
      </div>`).join('');
  };

  // Load history
  const loadHistory = async () => {
    if (!el('historyTable')) return;
    try {
      const res = await fetch('/api/history');
      const rows = await res.json();
      if (!res.ok || !rows.length) {
        el('historyTable').innerHTML = '<tr><td colspan="6" class="empty-state"><b>No history yet</b><br>Your completed comparisons will appear here.</td></tr>';
        return;
      }
      const tbody = document.createElement('tbody');
      rows.forEach(row => {
        const scoreObj = (() => {
          try { return JSON.parse(row.scores ?? '{}'); } catch { return {}; }
        })();
        const score = Number(scoreObj.final_score ?? 0);
        const classification = classifyScore(score);
        const rowEl = document.createElement('tr');
        rowEl.className = 'history-row';
        rowEl.innerHTML = `
          <td>${new Date(row.created_at).toLocaleString()}</td>
          <td class="history-files">${escapeHtml(row.file_name_1)}</td>
          <td class="history-files">${escapeHtml(row.file_name_2)}</td>
          <td class="history-score" style="color:${score > 80 ? 'var(--mint)' : score > 60 ? 'var(--cyan)' : '#FFA500'}">${score.toFixed(1)}%</td>
          <td>${classification}</td>
          <td>
            <div class="history-actions">
              <button class="history-button view">View</button>
              <button class="history-button delete">Delete</button>
            </div>
          </td>`;
        rowEl.querySelector('.view')?.addEventListener('click', () => loadResults(row.id));
        rowEl.querySelector('.delete')?.addEventListener('click', () => deleteHistory(row.id));
        tbody.appendChild(rowEl);
      });
      el('historyTable').innerHTML = '';
      el('historyTable').appendChild(tbody);
    } catch {
      el('historyTable').innerHTML = '<tr><td colspan="6" class="empty-state"><b>Failed to load history</b></td></tr>';
    }
  };

  const deleteHistory = async (id) => {
    if (!confirm('Delete this comparison from history?')) return;
    try {
      const res = await fetch(`/api/history/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      await loadHistory();
      showToast('Deleted from history.');
    } catch (err) {
      showToast(err.message || 'Deletion failed.', 'error');
    }
  };

  // Initialization
  document.querySelectorAll('.nav-item').forEach(link => {
    link.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
    });
  });

  el('compareBtn')?.addEventListener('click', startComparison);
  el('compareAllBtn')?.addEventListener('click', compareAgainstAll);

  // Comparison functions
  const startComparison = async () => {
    if (!state.submissions.A || !state.submissions.B) {
      showToast('Upload both files', 'error');
      return;
    }
    setProgress('Starting comparison', 0);
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
      if (!res.ok) throw new Error(data.error || 'Failed to start');
      pollJob(data.job_id, () => loadResults(data.comparison_id));
    } catch (err) {
      resetProgress();
      showToast(err.message, 'error');
    }
  };

  const compareAgainstAll = async () => {
    if (!state.submissions.A) {
      showToast('Upload Submission A first', 'error');
      return;
    }
    setProgress('Comparing against collection', 0);
    try {
      const res = await fetch('/api/compare-against-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: state.submissions.A.submission_id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start');
      pollJob(data.job_id, (job) => {
        resetProgress();
        renderCollection(job.result?.results || []);
        loadHistory();
      });
    } catch (err) {
      resetProgress();
      showToast(err.message, 'error');
    }
  };

  const pollJob = (jobId, onComplete) => {
    clearInterval(state.pollTimer);
    state.pollTimer = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        const job = await res.json();
        if (!res.ok) throw new Error(job.error || 'Job fetch error');
        setProgress(job.stage, job.progress);
        if (job.status === 'completed') {
          clearInterval(state.pollTimer);
          resetProgress();
          onComplete(job);
        } else if (job.status === 'failed') {
          clearInterval(state.pollTimer);
          resetProgress();
          showToast(`Comparison failed: ${job.error}`, 'error');
        }
      } catch {
        clearInterval(state.pollTimer);
        resetProgress();
        showToast('Unable to read job status. Retry.', 'error');
      }
    }, 650);
  };

  const loadResults = async (comparisonId) => {
    try {
      const res = await fetch(`/api/results/${comparisonId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      renderResults(data);
      loadHistory();
      location.hash = 'resultsSection';
      showToast('Comparison finished.');
    } catch (err) {
      showToast(err.message || 'Failed to load results', 'error');
    }
  };

  const renderResults = (data) => {
    // Show container
    if (!elements.resultContent) return;
    elements.resultContent.hidden = false;

    // Score ring
    const score = Number(data.scores?.final_score || 0);
    const color = score > 80 ? 'var(--mint)' :
                  score > 60 ? 'var(--cyan)' :
                  score > 40 ? '#FFA500' :
                  'var(--coral)';
    renderScoreRing(score, color);

    // Score text
    if (elements.finalScore) {
      elements.finalScore.textContent = `${score.toFixed(1)}%`;
      elements.finalScore.style.color = color;
    }

    // Classification badge
    const classification = classifyScore(score);
    if (elements.classificationBadge) {
      elements.classificationBadge.textContent = classification;
      elements.classificationBadge.style.backgroundColor = classifyColor(score);
    }

    // Breakdown
    renderBreakdown(data.scores?.breakdown || {});

    // Diff view
    renderDiff(data);

    // Report button
    if (elements.reportDownload) {
      elements.reportDownload.href = `/api/report/${data.id}`;
      elements.reportDownload.hidden = false;
    }
  };

  const renderScoreRing = (score, color) => {
    const ring = el('gaugeRing');
    if (!ring) return;
    const radius = 80;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference * (1 - score / 100);
    ring.style.stroke = color;
    ring.style.strokeDasharray = `${circumference} ${circumference}`;
    ring.style.strokeDashoffset = offset;
  };

  const classifyScore = (score) => {
    if (score >= 80) return 'Very High';
    if (score >= 60) return 'High';
    if (score >= 40) return 'Moderate';
    if (score >= 20) return 'Low';
    return 'Very Low';
  };

  const classifyColor = (score) => {
    if (score >= 80) return 'var(--mint)';
    if (score >= 60) return 'var(--cyan)';
    if (score >= 40) return '#FFA500';
    if (score >= 20) return 'pink';
    return 'gray';
  };

  const renderBreakdown = (breakdown) => {
    if (!el('breakdown')) return;
    const container = el('breakdown');
    container.innerHTML = '';
    Object.entries(breakdown).forEach(([algo, value]) => {
      const val = Math.max(0, Math.min(100, value));
      const card = document.createElement('div');
      card.className = 'breakdown-card';
      card.innerHTML = `
        <div class="breakdown-header">${getAlgorithmName(algo)}</div>
        <div class="breakdown-bar">
          <div class="breakdown-progress" style="width:${val}%"></div>
        </div>
        <div class="breakdown-value">${val.toFixed(1)}%</div>
      `;
      container.appendChild(card);
    });
  };

  const getAlgorithmName = (key) => {
    const names = {
      rabin_karp: 'Rabin–Karp',
      hashing: 'Hashing',
      lcs: 'LCS',
      edit_distance: 'Edit Distance',
      semantic: 'Semantic Similarity',
    };
    return names[key] || key;
  };

  const renderDiff = (data) => {
    if (!data.matches || !data.diff) {
      if (el('matchNote')) el('matchNote').textContent = 'Matching info unavailable.';
      if (el('diffView')) {
        el('diffView').innerHTML = '<div class="empty-state"><h3>Match view unavailable</h3><p>The analysis result is valid, but the diff cannot be displayed.</p></div>';
      }
      return;
    }
    const { tokens_a, tokens_b, lcs } = data.matches;
    const matchedIndices = new Set((lcs?.matched_runs || []).flat());
    if (el('diffView')) {
      el('diffView').innerHTML = `
        <div class="diff-container">
          <div class="diff-block">${renderDiffLines(tokens_a, matchedIndices, 0)}</div>
          <div class="diff-block">${renderDiffLines(tokens_b, matchedIndices, 2)}</div>
        </div>`;
    }
    if (el('matchNote')) {
      el('matchNote').textContent = lcs?.identifier_normalized
        ? 'Highlighted spans show exact overlap; the LCS score also considers normalized code.'
        : 'Shared tokens are highlighted.';
    }
  };

  const renderDiffLines = (tokens, matchedIndices, offset) => {
    const lines = [];
    let currentLine = { no: 1, tokens: [], match: false };
    let lineNumber = 1;
    tokens.forEach((token, index) => {
      const isMatch = matchedIndices.has(index);
      const parts = token.split('\n');
      parts.forEach((part, pIdx) => {
        if (pIdx > 0) {
          lines.push({ ...currentLine });
          currentLine = { no: ++lineNumber, tokens: [], match: false };
        }
        currentLine.tokens.push({ text: part, match: isMatch });
      });
    });
    lines.push(currentLine);
    return lines.map(line => `
      <div class="diff-line ${line.match ? 'match' : ''}">
        <span class="line-no">${line.no}</span>
        <span class="line-code">
          ${line.tokens.map(t => t.match ? `<mark class="match">${escapeHtml(t.text)}</mark>` : escapeHtml(t.text)).join(' ')}
        </span>
      </div>`).join('');
  };

  const escapeHtml = (str) => {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  // Load history
  const loadHistory = async () => {
    if (!el('historyTable')) return;
    try {
      const res = await fetch('/api/history');
      const rows = await res.json();
      if (!res.ok || !rows.length) {
        el('historyTable').innerHTML = '<tr><td colspan="6" class="empty-state"><b>No history yet</b><br>Your completed comparisons will appear here.</td></tr>';
        return;
      }
      const tbody = document.createElement('tbody');
      rows.forEach(row => {
        const scoreObj = (() => {
          try { return JSON.parse(row.scores ?? '{}'); } catch { return {}; }
        })();
        const score = Number(scoreObj.final_score ?? 0);
        const classification = classifyScore(score);
        const rowEl = document.createElement('tr');
        rowEl.className = 'history-row';
        rowEl.innerHTML = `
          <td>${new Date(row.created_at).toLocaleString()}</td>
          <td class="history-files">${escapeHtml(row.file_name_1)}</td>
          <td class="history-files">${escapeHtml(row.file_name_2)}</td>
          <td class="history-score" style="color:${score > 80 ? 'var(--mint)' : score > 60 ? 'var(--cyan)' : '#FFA500'}">${score.toFixed(1)}%</td>
          <td>${classification}</td>
          <td>
            <div class="history-actions">
              <button class="history-button view">View</button>
              <button class="history-button delete">Delete</button>
            </div>
          </td>`;
        rowEl.querySelector('.view')?.addEventListener('click', () => loadResults(row.id));
        rowEl.querySelector('.delete')?.addEventListener('click', () => deleteHistory(row.id));
        tbody.appendChild(rowEl);
      });
      el('historyTable').innerHTML = '';
      el('historyTable').appendChild(tbody);
    } catch {
      el('historyTable').innerHTML = '<tr><td colspan="6" class="empty-state"><b>Failed to load history</b></td></tr>';
    }
  };

  const deleteHistory = async (id) => {
    if (!confirm('Delete this comparison from history?')) return;
    try {
      const res = await fetch(`/api/history/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      await loadHistory();
      showToast('Deleted from history.');
    } catch (err) {
      showToast(err.message || 'Deletion failed.', 'error');
    }
  };

  // Initialize
  const init = () => {
    // Setup upload zones
    ['A', 'B'].forEach(s => {
      setupDropzone(elements[`dropzone${s}`], s);
    });
    // Setup buttons
    elements.compareBtn?.addEventListener('click', startComparison);
    elements.compareAllBtn?.addEventListener('click', compareAgainstAll);
    // Initial UI state
    refreshButtons();
    loadHistory();
  };

  // Start
  init();

})();
