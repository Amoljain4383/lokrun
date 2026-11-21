/**
 * Lokrun Admin Reports Controller (public/js/admin-reports.js)
 * LIVE DATA ONLY: All reports queried from live API endpoints.
 * Complete XSS protection: strictly uses textContent & createElement for all server data.
 */

document.addEventListener('DOMContentLoaded', async () => {
  await window.LokrunAdmin.init('reports');

  let allReports = [];
  let currentDetailReport = null;

  const searchInput = document.getElementById('filter-search');
  const statusFilter = document.getElementById('filter-status');
  const catFilter = document.getElementById('filter-category');
  const sortSelect = document.getElementById('filter-sort');
  const btnRefresh = document.getElementById('btn-refresh-reports');

  const countLabel = document.getElementById('reports-count-label');
  const tbody = document.getElementById('reports-tbody');
  const emptyState = document.getElementById('reports-empty-state');
  const emptyDesc = document.getElementById('reports-empty-desc');

  // Modal elements
  const modal = document.getElementById('report-modal');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnCloseModalFooter = document.getElementById('btn-close-modal-footer');
  const btnPrintReport = document.getElementById('btn-print-report');
  const modalAlert = document.getElementById('modal-alert');

  const modalReportId = document.getElementById('modal-report-id');
  const modalTitle = document.getElementById('modal-title');
  const modalCategory = document.getElementById('modal-category');
  const modalDesc = document.getElementById('modal-description');
  const modalLandmark = document.getElementById('modal-landmark');
  const modalCoordsWrap = document.getElementById('modal-coordinates-wrap');
  const modalImageWrap = document.getElementById('modal-image-wrap');

  const modalReporterName = document.getElementById('modal-reporter-name');
  const modalReporterPhone = document.getElementById('modal-reporter-phone');
  const modalReporterEmail = document.getElementById('modal-reporter-email');

  const selectPriority = document.getElementById('modal-select-priority');
  const selectStatus = document.getElementById('modal-select-status');
  const inputNote = document.getElementById('modal-internal-note');
  const btnSaveReport = document.getElementById('btn-save-report');
  const modalAuditTimeline = document.getElementById('modal-audit-timeline');

  // --- Load Reports from API ---
  async function loadReports() {
    try {
      const res = await fetch('/api/admin/reports');
      const data = await res.json();

      if (!res.ok || !data.success) {
        console.error('Failed to load reports:', data.error);
        return;
      }

      allReports = data.reports || [];
      applyFilters();

      // If URL has ?id=, auto-open that report
      const urlParams = new URLSearchParams(window.location.search);
      const urlReportId = urlParams.get('id');
      if (urlReportId) {
        const target = allReports.find(r => r.id.toLowerCase() === urlReportId.toLowerCase());
        if (target) {
          openReportDetail(target.id);
        }
      }

    } catch (err) {
      console.error('Network error loading reports:', err);
    }
  }

  // --- Filter & Sort Logic ---
  function applyFilters() {
    const query = searchInput.value.trim().toLowerCase();
    const statusVal = statusFilter.value;
    const catVal = catFilter.value;
    const sortVal = sortSelect.value;

    let filtered = allReports.filter(r => {
      // Status filter
      if (statusVal && r.status.toLowerCase() !== statusVal.toLowerCase()) {
        return false;
      }
      // Category filter
      if (catVal && r.category.toLowerCase() !== catVal.toLowerCase()) {
        return false;
      }
      // Search query (matches id, title, description, landmark, name, phone, email)
      if (query) {
        const idMatch = r.id && r.id.toLowerCase().includes(query);
        const titleMatch = r.title && r.title.toLowerCase().includes(query);
        const descMatch = r.description && r.description.toLowerCase().includes(query);
        const lmMatch = r.landmark && r.landmark.toLowerCase().includes(query);
        const nameMatch = r.contact?.name && r.contact.name.toLowerCase().includes(query);
        const phoneMatch = r.contact?.phone && r.contact.phone.toLowerCase().includes(query);
        const emailMatch = r.contact?.email && r.contact.email.toLowerCase().includes(query);

        if (!idMatch && !titleMatch && !descMatch && !lmMatch && !nameMatch && !phoneMatch && !emailMatch) {
          return false;
        }
      }
      return true;
    });

    // Sort
    const priorityWeight = { 'Critical': 3, 'High': 2, 'Medium': 1 };
    if (sortVal === 'newest') {
      filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else if (sortVal === 'oldest') {
      filtered.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    } else if (sortVal === 'priority') {
      filtered.sort((a, b) => {
        const pDiff = (priorityWeight[b.priority] || 1) - (priorityWeight[a.priority] || 1);
        if (pDiff !== 0) return pDiff;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
    }

    renderTable(filtered);
  }

  // --- Table Rendering (Strict textContent) ---
  function renderTable(reports) {
    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

    countLabel.textContent = `Showing ${reports.length} of ${allReports.length} report${allReports.length === 1 ? '' : 's'}`;

    if (reports.length === 0) {
      emptyState.classList.remove('hidden');
      if (allReports.length === 0) {
        emptyDesc.textContent = 'No civic reports currently exist in the database.';
      } else {
        emptyDesc.textContent = 'No reports match your current search and filter criteria.';
      }
      return;
    }

    emptyState.classList.add('hidden');

    reports.forEach(r => {
      const tr = document.createElement('tr');

      // Reference ID
      const tdId = document.createElement('td');
      const idSpan = document.createElement('span');
      idSpan.style.fontFamily = 'var(--font-mono)';
      idSpan.style.fontWeight = '700';
      idSpan.style.color = 'var(--color-primary)';
      idSpan.textContent = r.id;
      tdId.appendChild(idSpan);

      // Title & Landmark
      const tdTitle = document.createElement('td');
      const titleDiv = document.createElement('div');
      titleDiv.style.fontWeight = '600';
      titleDiv.style.color = 'var(--color-navy)';
      titleDiv.textContent = r.title;

      const lmDiv = document.createElement('div');
      lmDiv.style.fontSize = '0.8rem';
      lmDiv.style.color = 'var(--color-text-muted)';
      lmDiv.textContent = r.landmark;
      tdTitle.appendChild(titleDiv);
      tdTitle.appendChild(lmDiv);

      // Category
      const tdCat = document.createElement('td');
      tdCat.textContent = r.category;

      // Priority
      const tdPri = document.createElement('td');
      const priBadge = document.createElement('span');
      priBadge.className = 'badge';
      if (r.priority === 'Critical') {
        priBadge.style.background = '#FEE2E2';
        priBadge.style.color = '#991B1B';
      } else if (r.priority === 'High') {
        priBadge.style.background = '#FEF3C7';
        priBadge.style.color = '#92400E';
      } else {
        priBadge.style.background = 'var(--color-primary-tint)';
        priBadge.style.color = 'var(--color-primary-dark)';
      }
      priBadge.textContent = r.priority || 'Medium';
      tdPri.appendChild(priBadge);

      // Status
      const tdStatus = document.createElement('td');
      const statusBadge = document.createElement('span');
      statusBadge.className = window.LokrunAdmin.getStatusBadgeClass(r.status);
      statusBadge.textContent = r.status || 'Submitted';
      tdStatus.appendChild(statusBadge);

      // Reporter
      const tdReporter = document.createElement('td');
      tdReporter.style.fontSize = '0.825rem';
      tdReporter.textContent = r.contact?.name || 'Anonymous';

      // Date
      const tdDate = document.createElement('td');
      tdDate.style.fontSize = '0.8rem';
      tdDate.style.color = 'var(--color-text-muted)';
      tdDate.textContent = window.LokrunAdmin.formatDate(r.createdAt);

      // Action
      const tdAction = document.createElement('td');
      const btnView = document.createElement('button');
      btnView.type = 'button';
      btnView.className = 'btn btn-outline btn-sm';
      btnView.textContent = 'Inspect';
      btnView.addEventListener('click', () => openReportDetail(r.id));
      tdAction.appendChild(btnView);

      tr.appendChild(tdId);
      tr.appendChild(tdTitle);
      tr.appendChild(tdCat);
      tr.appendChild(tdPri);
      tr.appendChild(tdStatus);
      tr.appendChild(tdReporter);
      tr.appendChild(tdDate);
      tr.appendChild(tdAction);

      tbody.appendChild(tr);
    });
  }

  // --- Open Report Detail Modal ---
  async function openReportDetail(reportId) {
    clearModalAlert();
    try {
      const res = await fetch(`/api/admin/reports/${encodeURIComponent(reportId)}`);
      const data = await res.json();

      if (!res.ok || !data.success || !data.report) {
        alert('Failed to load report details.');
        return;
      }

      currentDetailReport = data.report;
      const r = currentDetailReport;

      // Populate Header & Fields (strictly textContent)
      modalReportId.textContent = r.id;
      modalTitle.textContent = r.title;
      modalCategory.textContent = r.category;
      modalDesc.textContent = r.description;
      modalLandmark.textContent = r.landmark;

      // Coordinates handling: "Open in Maps" link ONLY when lat/lng exist
      while (modalCoordsWrap.firstChild) modalCoordsWrap.removeChild(modalCoordsWrap.firstChild);
      if (r.lat !== null && r.lng !== null && typeof r.lat !== 'undefined' && typeof r.lng !== 'undefined') {
        const coordSpan = document.createElement('span');
        coordSpan.style.color = 'var(--color-text-muted)';
        coordSpan.textContent = `Coordinates: ${r.lat}, ${r.lng} — `;

        const mapLink = document.createElement('a');
        mapLink.href = r.mapUrl || `https://www.google.com/maps?q=${r.lat},${r.lng}`;
        mapLink.target = '_blank';
        mapLink.rel = 'noopener noreferrer';
        mapLink.style.color = 'var(--color-primary)';
        mapLink.style.fontWeight = '700';
        mapLink.style.textDecoration = 'underline';
        mapLink.textContent = 'Open in Google Maps ↗';

        modalCoordsWrap.appendChild(coordSpan);
        modalCoordsWrap.appendChild(mapLink);
      } else {
        const noCoords = document.createElement('span');
        noCoords.style.color = 'var(--color-text-muted)';
        noCoords.style.fontStyle = 'italic';
        noCoords.textContent = 'Coordinates not provided (Manual landmark only)';
        modalCoordsWrap.appendChild(noCoords);
      }

      // Attached Photo handling
      while (modalImageWrap.firstChild) modalImageWrap.removeChild(modalImageWrap.firstChild);
      if (r.imageFile) {
        const imgBox = document.createElement('div');
        imgBox.className = 'detail-image-box';

        const img = document.createElement('img');
        img.src = `/api/admin/image/${encodeURIComponent(r.id)}`;
        img.className = 'detail-image';
        img.alt = 'Uploaded citizen photo';

        imgBox.addEventListener('click', () => {
          window.open(`/api/admin/image/${encodeURIComponent(r.id)}`, '_blank');
        });

        imgBox.appendChild(img);

        const hint = document.createElement('div');
        hint.style.fontSize = '0.75rem';
        hint.style.color = 'var(--color-text-muted)';
        hint.style.marginTop = '0.25rem';
        hint.textContent = 'Click image to view in full resolution';

        modalImageWrap.appendChild(imgBox);
        modalImageWrap.appendChild(hint);
      } else {
        const noImg = document.createElement('div');
        noImg.style.color = 'var(--color-text-muted)';
        noImg.style.fontStyle = 'italic';
        noImg.style.fontSize = '0.875rem';
        noImg.textContent = 'No photo uploaded with this report.';
        modalImageWrap.appendChild(noImg);
      }

      // Reporter Contact Details
      modalReporterName.textContent = r.contact?.name || 'Name not recorded';
      modalReporterPhone.textContent = r.contact?.phone || 'Phone not recorded';
      modalReporterEmail.textContent = r.contact?.email || 'Email not recorded';

      // Preset Priority and Status form selects
      selectPriority.value = r.priority || 'Medium';
      selectStatus.value = r.status || 'Submitted';
      inputNote.value = '';

      // Render Complete Audit Trail (strictly textContent)
      renderAuditTimeline(r.auditLog || []);

      // Show modal
      modal.classList.add('active');

    } catch (err) {
      console.error('Error opening report detail:', err);
    }
  }

  function renderAuditTimeline(audits) {
    while (modalAuditTimeline.firstChild) modalAuditTimeline.removeChild(modalAuditTimeline.firstChild);

    if (audits.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'timeline-item';
      emptyEl.style.color = 'var(--color-text-muted)';
      emptyEl.textContent = 'No audit history recorded.';
      modalAuditTimeline.appendChild(emptyEl);
      return;
    }

    audits.forEach(entry => {
      const itemEl = document.createElement('div');
      itemEl.className = 'timeline-item';

      const dotEl = document.createElement('div');
      dotEl.className = 'timeline-dot';
      itemEl.appendChild(dotEl);

      const headerEl = document.createElement('div');
      headerEl.className = 'timeline-header';

      const titleEl = document.createElement('span');
      titleEl.className = 'timeline-status';
      if (entry.field === 'status') {
        titleEl.textContent = `Status changed: ${entry.oldValue ? entry.oldValue + ' → ' : ''}${entry.newValue}`;
      } else if (entry.field === 'priority') {
        titleEl.textContent = `Priority changed: ${entry.oldValue ? entry.oldValue + ' → ' : ''}${entry.newValue}`;
      } else {
        titleEl.textContent = `Field Note Added`;
      }

      const timeEl = document.createElement('span');
      timeEl.className = 'timeline-time';
      timeEl.textContent = window.LokrunAdmin.formatDate(entry.timestamp);

      headerEl.appendChild(titleEl);
      headerEl.appendChild(timeEl);
      itemEl.appendChild(headerEl);

      const actorEl = document.createElement('div');
      actorEl.style.fontSize = '0.775rem';
      actorEl.style.color = 'var(--color-primary-dark)';
      actorEl.style.fontWeight = '600';
      actorEl.textContent = `Updated by: ${entry.admin || 'system'}`;
      itemEl.appendChild(actorEl);

      if (entry.note && typeof entry.note === 'string' && entry.note.trim()) {
        const noteEl = document.createElement('div');
        noteEl.className = 'timeline-note';
        noteEl.textContent = entry.note.trim();
        itemEl.appendChild(noteEl);
      }

      modalAuditTimeline.appendChild(itemEl);
    });
  }

  // --- Save Priority / Status Changes (PATCH /api/admin/reports/:id) ---
  if (btnSaveReport) {
    btnSaveReport.addEventListener('click', async () => {
      if (!currentDetailReport) return;
      clearModalAlert();

      const newPriority = selectPriority.value;
      const newStatus = selectStatus.value;
      const note = inputNote.value.trim();

      const patchBody = {};
      let hasChanges = false;

      if (newPriority !== currentDetailReport.priority) {
        patchBody.priority = newPriority;
        hasChanges = true;
      }
      if (newStatus !== currentDetailReport.status) {
        patchBody.status = newStatus;
        hasChanges = true;
      }
      if (note) {
        patchBody.note = note;
        hasChanges = true;
      }

      if (!hasChanges) {
        showModalAlert('No changes detected to priority, status, or notes.');
        return;
      }

      try {
        btnSaveReport.disabled = true;
        btnSaveReport.textContent = 'Saving...';

        const res = await fetch(`/api/admin/reports/${encodeURIComponent(currentDetailReport.id)}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(patchBody)
        });

        const data = await res.json();
        btnSaveReport.disabled = false;
        btnSaveReport.textContent = 'Save Changes & Log Audit';

        if (!res.ok || !data.success) {
          showModalAlert(data.error || 'Failed to update report.');
          return;
        }

        // Success: refresh modal detail and table
        inputNote.value = '';
        await openReportDetail(currentDetailReport.id);
        await loadReports();

      } catch (err) {
        btnSaveReport.disabled = false;
        btnSaveReport.textContent = 'Save Changes & Log Audit';
        showModalAlert('Network error saving report modifications.');
      }
    });
  }

  function showModalAlert(msg) {
    modalAlert.textContent = msg;
    modalAlert.classList.add('active');
  }

  function clearModalAlert() {
    modalAlert.textContent = '';
    modalAlert.classList.remove('active');
  }

  function closeModal() {
    modal.classList.remove('active');
    currentDetailReport = null;
    clearModalAlert();
  }

  if (btnCloseModal) btnCloseModal.addEventListener('click', closeModal);
  if (btnCloseModalFooter) btnCloseModalFooter.addEventListener('click', closeModal);

  if (btnPrintReport) {
    btnPrintReport.addEventListener('click', () => {
      window.print();
    });
  }

  // Close modal on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
      closeModal();
    }
  });

  // Event Listeners for Filtering
  if (searchInput) searchInput.addEventListener('input', applyFilters);
  if (statusFilter) statusFilter.addEventListener('change', applyFilters);
  if (catFilter) catFilter.addEventListener('change', applyFilters);
  if (sortSelect) sortSelect.addEventListener('change', applyFilters);
  if (btnRefresh) btnRefresh.addEventListener('click', loadReports);

  // Initial load
  loadReports();
});
