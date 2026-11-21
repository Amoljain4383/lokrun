/**
 * Lokrun Admin Status Controller (public/js/admin-status.js)
 * Queries live telemetry from /api/admin/server-status
 */

document.addEventListener('DOMContentLoaded', async () => {
  await window.LokrunAdmin.init('status');

  const statusServer = document.getElementById('status-server');
  const statusUptime = document.getElementById('status-uptime');
  const statusNodeVersion = document.getElementById('status-node-version');
  const statusPlatform = document.getElementById('status-platform');
  const statusMemory = document.getElementById('status-memory');

  const statusDbRecords = document.getElementById('status-db-records');
  const statusDbAudits = document.getElementById('status-db-audits');
  const statusDbAdmins = document.getElementById('status-db-admins');

  const statusUploadsCount = document.getElementById('status-uploads-count');
  const statusUploadsSize = document.getElementById('status-uploads-size');
  const btnRefresh = document.getElementById('btn-refresh-status');

  function formatUptime(seconds) {
    if (!seconds || isNaN(seconds)) return '0s';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const parts = [];
    if (hrs > 0) parts.push(`${hrs}h`);
    if (mins > 0 || hrs > 0) parts.push(`${mins}m`);
    parts.push(`${secs}s`);
    return parts.join(' ');
  }

  async function loadStatus() {
    try {
      const res = await fetch('/api/admin/server-status');
      const data = await res.json();

      if (!res.ok || !data.success) {
        if (statusServer) statusServer.textContent = 'Degraded';
        return;
      }

      if (statusServer) statusServer.textContent = 'Online';
      if (statusUptime) statusUptime.textContent = `Uptime: ${formatUptime(data.uptimeSeconds)}`;
      if (statusNodeVersion) statusNodeVersion.textContent = data.nodeVersion || 'Node.js';
      if (statusPlatform) statusPlatform.textContent = data.platform || 'windows';

      if (statusMemory && data.memoryUsage) {
        const rssMb = (data.memoryUsage.rss / (1024 * 1024)).toFixed(1);
        statusMemory.textContent = `${rssMb} MB`;
      }

      if (data.database) {
        if (statusDbRecords) statusDbRecords.textContent = data.database.totalReports ?? 0;
        if (statusDbAudits) statusDbAudits.textContent = data.database.totalAuditEntries ?? 0;
        if (statusDbAdmins) statusDbAdmins.textContent = data.database.totalAdmins ?? 1;
      }

      if (data.storage) {
        if (statusUploadsCount) statusUploadsCount.textContent = data.storage.uploadsCount ?? 0;
        if (statusUploadsSize) statusUploadsSize.textContent = data.storage.uploadsSizeFormatted || '0.00 MB';
      }

    } catch (err) {
      console.error('Failed to load server diagnostics:', err);
      if (statusServer) statusServer.textContent = 'Error connecting';
    }
  }

  if (btnRefresh) {
    btnRefresh.addEventListener('click', loadStatus);
  }

  loadStatus();
});
