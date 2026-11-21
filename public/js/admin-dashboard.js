/**
 * Lokrun Admin Dashboard Controller (public/js/admin-dashboard.js)
 * LIVE DATA ONLY: All figures, charts, and lists derived from API endpoints.
 * Pure CSS/SVG charts (zero external chart libraries).
 * Empty states ("No reports yet") displayed when database contains 0 reports.
 */

document.addEventListener('DOMContentLoaded', async () => {
  await window.LokrunAdmin.init('dashboard');

  const statTotal = document.getElementById('stat-total');
  const statSubmitted = document.getElementById('stat-submitted');
  const statProgress = document.getElementById('stat-progress');
  const statResolved = document.getElementById('stat-resolved');

  const catContainer = document.getElementById('chart-categories-container');
  const priorityContainer = document.getElementById('chart-priorities-container');
  const statusContainer = document.getElementById('chart-statuses-container');
  const landmarksContainer = document.getElementById('top-landmarks-container');

  const recentTbody = document.getElementById('recent-reports-tbody');
  const recentEmpty = document.getElementById('recent-reports-empty');
  const btnRefresh = document.getElementById('btn-refresh');

  function renderEmptyState(container, title = 'No reports yet', desc = 'Data will appear automatically as live reports arrive.') {
    while (container.firstChild) container.removeChild(container.firstChild);

    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.style.padding = '2rem 1rem';

    const icon = document.createElement('div');
    icon.className = 'empty-state-icon';
    icon.textContent = '📊';

    const h = document.createElement('div');
    h.className = 'empty-state-title';
    h.textContent = title;

    const p = document.createElement('div');
    p.className = 'empty-state-desc';
    p.textContent = desc;

    empty.appendChild(icon);
    empty.appendChild(h);
    empty.appendChild(p);
    container.appendChild(empty);
  }

  async function loadDashboard() {
    try {
      const [statsRes, reportsRes] = await Promise.all([
        fetch('/api/admin/stats'),
        fetch('/api/admin/reports')
      ]);

      const statsData = await statsRes.json();
      const reportsData = await reportsRes.json();

      const total = statsData.totalReports || 0;
      const byStatus = statsData.byStatus || {};
      const byPriority = statsData.byPriority || {};
      const byCategory = statsData.byCategory || {};
      const reports = reportsData.reports || [];

      // 1. Stat Cards
      statTotal.textContent = total;
      statSubmitted.textContent = byStatus['Submitted'] || 0;
      statProgress.textContent = byStatus['In Progress'] || 0;
      const resolvedCombined = (byStatus['Resolved'] || 0) + (byStatus['Completed'] || 0);
      statResolved.textContent = resolvedCombined;

      // 2. Category Chart
      if (total === 0) {
        renderEmptyState(catContainer, 'No reports yet', 'No category data recorded.');
      } else {
        while (catContainer.firstChild) catContainer.removeChild(catContainer.firstChild);
        Object.entries(byCategory).forEach(([cat, count]) => {
          const pct = Math.round((count / total) * 100);
          const group = document.createElement('div');
          group.className = 'chart-bar-group';

          const header = document.createElement('div');
          header.className = 'chart-bar-header';

          const label = document.createElement('span');
          label.textContent = cat;

          const countSpan = document.createElement('span');
          countSpan.textContent = `${count} (${pct}%)`;

          header.appendChild(label);
          header.appendChild(countSpan);

          const track = document.createElement('div');
          track.className = 'chart-bar-track';

          const fill = document.createElement('div');
          fill.className = 'chart-bar-fill';
          fill.style.width = `${pct}%`;

          track.appendChild(fill);
          group.appendChild(header);
          group.appendChild(track);
          catContainer.appendChild(group);
        });
      }

      // 3. Priority Chart
      if (total === 0) {
        renderEmptyState(priorityContainer, 'No reports yet', 'No priority data recorded.');
      } else {
        while (priorityContainer.firstChild) priorityContainer.removeChild(priorityContainer.firstChild);
        ['Critical', 'High', 'Medium'].forEach(pri => {
          const count = byPriority[pri] || 0;
          const pct = Math.round((count / total) * 100);

          const group = document.createElement('div');
          group.className = 'chart-bar-group';

          const header = document.createElement('div');
          header.className = 'chart-bar-header';

          const label = document.createElement('span');
          label.textContent = pri;

          const countSpan = document.createElement('span');
          countSpan.textContent = `${count} (${pct}%)`;

          header.appendChild(label);
          header.appendChild(countSpan);

          const track = document.createElement('div');
          track.className = 'chart-bar-track';

          const fill = document.createElement('div');
          fill.className = `chart-bar-fill ${pri === 'Critical' ? 'bar-critical' : pri === 'High' ? 'bar-high' : 'bar-medium'}`;
          fill.style.width = `${pct}%`;

          track.appendChild(fill);
          group.appendChild(header);
          group.appendChild(track);
          priorityContainer.appendChild(group);
        });
      }

      // 4. Status Pipeline Chart
      if (total === 0) {
        renderEmptyState(statusContainer, 'No reports yet', 'No status data recorded.');
      } else {
        while (statusContainer.firstChild) statusContainer.removeChild(statusContainer.firstChild);
        Object.entries(byStatus).forEach(([st, count]) => {
          const pct = Math.round((count / total) * 100);

          const group = document.createElement('div');
          group.className = 'chart-bar-group';

          const header = document.createElement('div');
          header.className = 'chart-bar-header';

          const label = document.createElement('span');
          label.textContent = st;

          const countSpan = document.createElement('span');
          countSpan.textContent = `${count} (${pct}%)`;

          header.appendChild(label);
          header.appendChild(countSpan);

          const track = document.createElement('div');
          track.className = 'chart-bar-track';

          const fill = document.createElement('div');
          fill.className = 'chart-bar-fill';
          fill.style.width = `${pct}%`;

          track.appendChild(fill);
          group.appendChild(header);
          group.appendChild(track);
          statusContainer.appendChild(group);
        });
      }

      // 5. Top Landmarks from Real Reports
      if (total === 0 || reports.length === 0) {
        renderEmptyState(landmarksContainer, 'No reports yet', 'Location frequency will appear here as complaints are filed.');
      } else {
        while (landmarksContainer.firstChild) landmarksContainer.removeChild(landmarksContainer.firstChild);

        const landmarkCounts = {};
        reports.forEach(r => {
          if (r.landmark && typeof r.landmark === 'string') {
            const lm = r.landmark.trim();
            landmarkCounts[lm] = (landmarkCounts[lm] || 0) + 1;
          }
        });

        const sortedLandmarks = Object.entries(landmarkCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5);

        if (sortedLandmarks.length === 0) {
          renderEmptyState(landmarksContainer, 'No reports yet', 'No landmarks recorded.');
        } else {
          sortedLandmarks.forEach(([landmark, count]) => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.justifyContent = 'space-between';
            row.style.padding = '0.65rem 0';
            row.style.borderBottom = '1px solid var(--color-border-subtle)';

            const name = document.createElement('span');
            name.style.fontSize = '0.875rem';
            name.style.fontWeight = '600';
            name.style.color = 'var(--color-navy)';
            name.textContent = landmark;

            const badge = document.createElement('span');
            badge.className = 'badge';
            badge.style.background = 'var(--color-bg-sage)';
            badge.style.color = 'var(--color-navy)';
            badge.textContent = `${count} report${count > 1 ? 's' : ''}`;

            row.appendChild(name);
            row.appendChild(badge);
            landmarksContainer.appendChild(row);
          });
        }
      }

      // 6. Recent Reports Table
      while (recentTbody.firstChild) recentTbody.removeChild(recentTbody.firstChild);

      if (reports.length === 0) {
        recentEmpty.classList.remove('hidden');
      } else {
        recentEmpty.classList.add('hidden');
        const recentSubset = reports.slice(0, 5);

        recentSubset.forEach(r => {
          const tr = document.createElement('tr');

          // Reference ID
          const tdId = document.createElement('td');
          const idLink = document.createElement('a');
          idLink.href = `/admin/reports.html?id=${encodeURIComponent(r.id)}`;
          idLink.style.fontFamily = 'var(--font-mono)';
          idLink.style.fontWeight = '700';
          idLink.style.color = 'var(--color-primary)';
          idLink.textContent = r.id;
          tdId.appendChild(idLink);

          // Title & Landmark
          const tdTitle = document.createElement('td');
          const titleDiv = document.createElement('div');
          titleDiv.style.fontWeight = '600';
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

          // Date
          const tdDate = document.createElement('td');
          tdDate.style.fontSize = '0.8rem';
          tdDate.style.color = 'var(--color-text-muted)';
          tdDate.textContent = window.LokrunAdmin.formatDate(r.createdAt);

          tr.appendChild(tdId);
          tr.appendChild(tdTitle);
          tr.appendChild(tdCat);
          tr.appendChild(tdPri);
          tr.appendChild(tdStatus);
          tr.appendChild(tdDate);

          recentTbody.appendChild(tr);
        });
      }

    } catch (err) {
      console.error('Failed to load dashboard metrics:', err);
    }
  }

  if (btnRefresh) {
    btnRefresh.addEventListener('click', loadDashboard);
  }

  loadDashboard();
});
