/**
 * Lokrun Admin Registration Controller (public/js/admin-register.js)
 */

document.addEventListener('DOMContentLoaded', () => {
  const registerForm = document.getElementById('register-form');
  const nameInput = document.getElementById('reg-name');
  const usernameInput = document.getElementById('reg-username');
  const emailInput = document.getElementById('reg-email');
  const passwordInput = document.getElementById('reg-password');
  const submitBtn = document.getElementById('btn-register-submit');
  const alertBox = document.getElementById('register-alert');
  const successBox = document.getElementById('register-success');

  function showAlert(msg) {
    alertBox.textContent = msg;
    alertBox.classList.add('active');
  }

  function clearAlert() {
    alertBox.textContent = '';
    alertBox.classList.remove('active');
  }

  // Check if registration is allowed on this instance
  fetch('/api/config')
    .then(res => res.json())
    .then(cfg => {
      if (cfg.allowRegistration === false) {
        if (registerForm) registerForm.style.display = 'none';
        showAlert('Administrator registration is currently disabled on this instance.');
      }
    })
    .catch(() => {});

  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlert();

      const name = nameInput.value.trim();
      const username = usernameInput.value.trim();
      const email = emailInput.value.trim();
      const password = passwordInput.value;

      if (!name) {
        showAlert('Full Name is required.');
        return;
      }

      if (!username || username.length < 3) {
        showAlert('Admin ID / Username must be at least 3 characters.');
        return;
      }

      if (!password || password.length < 8) {
        showAlert('Password must be at least 8 characters long.');
        return;
      }

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Registering account...';

        const res = await fetch('/api/admin/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name,
            username,
            password
          })
        });

        const data = await res.json();
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Admin Account';

        if (!res.ok || !data.success) {
          if (data.details && Array.isArray(data.details)) {
            showAlert(data.details.join(', '));
          } else {
            showAlert(data.error || 'Failed to register administrator.');
          }
          return;
        }

        // Show success
        registerForm.classList.add('hidden');
        successBox.classList.remove('hidden');

      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Admin Account';
        showAlert('Network error: Unable to connect to server.');
      }
    });
  }
});
