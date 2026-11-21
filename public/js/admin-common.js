/**
 * Lokrun Admin Common Controller (public/js/admin-common.js)
 * Shared authentication guard, sidebar navigation, and user session management.
 * Strictly enforces textContent for all dynamic server data to prevent XSS.
 */

window.LokrunAdmin = {
  currentAdmin: null,

  async init(activePageId) {
    // 1. Highlight active navigation item
    if (activePageId) {
      const activeLink = document.getElementById(`nav-${activePageId}`);
      if (activeLink) activeLink.classList.add('active');
    }

    // 2. Setup mobile sidebar toggle
    this.setupSidebar();

    // 3. Verify admin authentication guard
    await this.checkAuth();

    // 4. Setup sign out button
    const btnSignOut = document.getElementById('btn-sign-out');
    if (btnSignOut) {
      btnSignOut.addEventListener('click', () => this.signOut());
    }
  },

  async checkAuth() {
    try {
      const res = await fetch('/api/admin/me');
      if (res.status === 401) {
        window.location.href = '/admin/login.html';
        return;
      }
      const data = await res.json();
      if (!res.ok || !data.success || !data.admin) {
        window.location.href = '/admin/login.html';
        return;
      }

      this.currentAdmin = data.admin;

      // Populate user chip at the bottom of sidebar
      const nameEl = document.getElementById('user-chip-name');
      const roleEl = document.getElementById('user-chip-role');
      const avatarEl = document.getElementById('user-chip-avatar');

      const displayName = data.admin.name || data.admin.username || 'Admin';
      if (nameEl) nameEl.textContent = displayName;
      if (roleEl) roleEl.textContent = 'Administrator';
      if (avatarEl) {
        avatarEl.textContent = displayName.charAt(0).toUpperCase();
      }

    } catch (err) {
      console.error('Auth verification error:', err);
      window.location.href = '/admin/login.html';
    }
  },

  async signOut() {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } catch (e) {
      // ignore
    } finally {
      window.location.href = '/admin/login.html';
    }
  },

  setupSidebar() {
    const toggleBtn = document.getElementById('btn-sidebar-toggle');
    const sidebar = document.getElementById('admin-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');

    if (toggleBtn && sidebar && backdrop) {
      toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        backdrop.classList.toggle('active');
      });

      backdrop.addEventListener('click', () => {
        sidebar.classList.remove('open');
        backdrop.classList.remove('active');
      });
    }
  },

  formatDate(isoString) {
    if (!isoString) return '—';
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
  },

  getStatusBadgeClass(status) {
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
  },

  getPriorityBadgeClass(priority) {
    switch (priority) {
      case 'Critical': return 'badge' + ' style="background:#FEE2E2; color:#991B1B;"';
      case 'High': return 'badge' + ' style="background:#FEF3C7; color:#92400E;"';
      default: return 'badge' + ' style="background:#E8F4F1; color:#104C42;"';
    }
  }
};
