/**
 * Lokrun Admin Profile Controller (public/js/admin-profile.js)
 */

document.addEventListener('DOMContentLoaded', async () => {
  await window.LokrunAdmin.init('profile');

  const admin = window.LokrunAdmin.currentAdmin;
  if (!admin) return;

  const profileName = document.getElementById('profile-name');
  const profileId = document.getElementById('profile-id');
  const profileCreated = document.getElementById('profile-created');
  const profileAvatar = document.getElementById('profile-avatar');
  const profileRole = document.getElementById('profile-role');

  const displayName = admin.name || admin.username || 'Admin';

  if (profileName) profileName.textContent = displayName;
  if (profileId) profileId.textContent = admin.username || admin.id || '—';
  if (profileRole) profileRole.textContent = admin.role || 'Administrator';
  if (profileCreated) profileCreated.textContent = window.LokrunAdmin.formatDate(admin.createdAt);
  if (profileAvatar) {
    profileAvatar.textContent = displayName.charAt(0).toUpperCase();
  }

  // Dynamic registration visibility check
  fetch('/api/config')
    .then(res => res.json())
    .then(cfg => {
      if (cfg.allowRegistration === false) {
        const regBtn = document.getElementById('btn-register-admin');
        if (regBtn) regBtn.style.display = 'none';
      }
    })
    .catch(() => {});
});
