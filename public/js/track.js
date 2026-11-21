/**
 * Lokrun – A Citizen Civic-Infrastructure Reporting Platform
 * Client-side Tracking Controller (public/js/track.js)
 * Vanilla JavaScript (Zero external dependencies)
 * XSS Security: ALL server-supplied data rendered with textContent ONLY
 */

document.addEventListener('DOMContentLoaded', () => {
  const trackForm = document.getElementById('track-form');
  const trackInput = document.getElementById('track-id-input');
  const trackBtn = document.getElementById('btn-track-submit');

  const resultContainer = document.getElementById('track-result-container');
  const errorContainer = document.getElementById('track-error-container');
  const errorMsg = document.getElementById('track-error-msg');
  const loadingIndicator = document.getElementById('track-loading');

  // Result display fields
  const displayId = document.getElementById('result-id');
  const displayCategory = document.getElementById('result-category');
  const displayStatus = document.getElementById('result-status');
  const displayLandmark = document.getElementById('result-landmark');
  const displayCreated = document.getElementById('result-created');
  const displayUpdated = document.getElementById('result-updated');
  const timelineContainer = document.getElementById('result-timeline');

  // Format status badge CSS class
  function getStatusBadgeClass(status) {
    switch (status) {
      case 'Submitted': return 'badge badge-submitted';
      case 'Under Review': return 'badge badge-under-review';
      case 'In Progress': return 'badge badge-in-progress';
      case 'Waiting for Citizen': return 'badge badge-waiting';
      case 'Resolved': return 'badge badge-resolved';
      case 'Completed': return 'badge badge-completed';
      case 'Closed': return 'badge badge-closed';
      default: return 'badge badge-submitted';
    }
  }

  function formatDate(isoString) {
    if (!isoString) return 'N/A';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  }

  async function fetchReport(reportId) {
    const cleanId = (reportId || '').trim();
    if (!cleanId) return;

    // Reset views
    resultContainer.classList.add('hidden');
    errorContainer.classList.add('hidden');
    loadingIndicator.classList.remove('hidden');
    trackBtn.disabled = true;

    try {
      const response = await fetch(`/api/track/${encodeURIComponent(cleanId)}`);
      const data = await response.json();

      loadingIndicator.classList.add('hidden');
      trackBtn.disabled = false;

      if (!response.ok || !data.success || !data.report) {
        errorMsg.textContent = data.error || `No report found with ID "${cleanId}". Please check the ID and try again.`;
        errorContainer.classList.remove('hidden');
        return;
      }

      const report = data.report;

      // Render Report Header & Metadata (strictly textContent)
      displayId.textContent = report.id || '';
      displayCategory.textContent = report.category || '';
      displayLandmark.textContent = report.landmark || '';
      displayCreated.textContent = formatDate(report.createdAt);
      displayUpdated.textContent = formatDate(report.updatedAt);

      displayStatus.textContent = report.status || 'Submitted';
      displayStatus.className = getStatusBadgeClass(report.status);

      // Render Timeline Elements safely using createElement and textContent
      while (timelineContainer.firstChild) {
        timelineContainer.removeChild(timelineContainer.firstChild);
      }

      if (Array.isArray(report.timeline) && report.timeline.length > 0) {
        report.timeline.forEach((item) => {
          if (!item.status) return;

          const itemEl = document.createElement('div');
          itemEl.className = 'timeline-item';

          const dotEl = document.createElement('div');
          dotEl.className = 'timeline-dot';
          itemEl.appendChild(dotEl);

          const headerEl = document.createElement('div');
          headerEl.className = 'timeline-header';

          const statusEl = document.createElement('span');
          statusEl.className = 'timeline-status';
          statusEl.textContent = item.status;
          headerEl.appendChild(statusEl);

          const timeEl = document.createElement('span');
          timeEl.className = 'timeline-time';
          timeEl.textContent = formatDate(item.timestamp);
          headerEl.appendChild(timeEl);

          itemEl.appendChild(headerEl);
          timelineContainer.appendChild(itemEl);
        });
      } else {
        const emptyEl = document.createElement('div');
        emptyEl.className = 'timeline-item';
        emptyEl.textContent = 'Report received and logged.';
        timelineContainer.appendChild(emptyEl);
      }

      resultContainer.classList.remove('hidden');
      resultContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    } catch (err) {
      loadingIndicator.classList.add('hidden');
      trackBtn.disabled = false;
      errorMsg.textContent = 'Network error: Unable to contact tracking service. Ensure server is active.';
      errorContainer.classList.remove('hidden');
    }
  }

  // Handle form submit
  if (trackForm) {
    trackForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = trackInput.value.trim();
      if (val) {
        // Update URL query string without reloading page
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('id', val);
        window.history.pushState({}, '', newUrl);
        fetchReport(val);
      }
    });
  }

  // Auto-fill and query if ?id= is present in URL
  const urlParams = new URLSearchParams(window.location.search);
  const initialId = urlParams.get('id');
  if (initialId && trackInput) {
    trackInput.value = initialId.trim();
    fetchReport(initialId.trim());
  }
});
