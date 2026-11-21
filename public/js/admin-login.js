/**
 * Lokrun Admin Login Controller (public/js/admin-login.js)
 */

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const adminIdInput = document.getElementById('admin-id');
  const passwordInput = document.getElementById('admin-password');
  const loginBtn = document.getElementById('btn-login-submit');
  const alertBox = document.getElementById('login-alert');

  function showAlert(msg) {
    alertBox.textContent = msg;
    alertBox.classList.add('active');
  }

  function clearAlert() {
    alertBox.textContent = '';
    alertBox.classList.remove('active');
  }

  // If already logged in, redirect to dashboard
  fetch('/api/admin/me')
    .then(res => res.json())
    .then(data => {
      if (data.success && data.admin) {
        window.location.href = '/admin/dashboard.html';
      }
    })
    .catch(() => {});

  // Dynamic configuration flags (hide demo hint, registration toggle)
  fetch('/api/config')
    .then(res => res.json())
    .then(cfg => {
      if (cfg.hideDemoHint) {
        const hintEl = document.getElementById('login-demo-hint');
        if (hintEl) hintEl.style.display = 'none';
      }
      if (cfg.allowRegistration === false) {
        const regLinkEl = document.getElementById('register-link-container');
        if (regLinkEl) regLinkEl.style.display = 'none';
      }
    })
    .catch(() => {});

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlert();

      const username = adminIdInput.value.trim();
      const password = passwordInput.value;

      if (!username || !password) {
        showAlert('Please enter both Admin ID and password.');
        return;
      }

      try {
        loginBtn.disabled = true;
        loginBtn.textContent = 'Authenticating...';

        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ username, password })
        });

        const data = await res.json();
        loginBtn.disabled = false;
        loginBtn.textContent = 'Sign In to Dashboard';

        if (!res.ok || !data.success) {
          showAlert(data.error || 'Invalid credentials. Please verify your Admin ID and password.');
          return;
        }

        // Successfully logged in with cookie set
        window.location.href = '/admin/dashboard.html';

      } catch (err) {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Sign In to Dashboard';
        showAlert('Network error: Unable to connect to authentication service.');
      }
    });
  }
});
