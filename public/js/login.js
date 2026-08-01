const errorEl = document.getElementById('error');
const passkeyBtn = document.getElementById('passkey-btn');
const loginForm = document.getElementById('login-form');
const subtitleEl = document.getElementById('subtitle');

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

async function signInWithPasskey() {
  errorEl.hidden = true;
  try {
    const optionsRes = await fetch('/api/webauthn/login/options');
    if (!optionsRes.ok) throw new Error('Could not start passkey sign-in');
    const optionsJSON = await optionsRes.json();

    const assertion = await SimpleWebAuthnBrowser.startAuthentication({ optionsJSON });

    const verifyRes = await fetch('/api/webauthn/login/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(assertion),
    });
    if (!verifyRes.ok) {
      const data = await verifyRes.json().catch(() => ({}));
      throw new Error(data.error || 'Passkey sign-in failed');
    }
    window.location.href = '/';
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      showError('Passkey sign-in was cancelled.');
    } else {
      showError(err.message || 'Passkey sign-in failed.');
    }
  }
}

async function init() {
  try {
    const res = await fetch('/api/webauthn/status');
    const { enabled } = await res.json();
    if (enabled && window.SimpleWebAuthnBrowser?.browserSupportsWebAuthn()) {
      passkeyBtn.hidden = false;
      loginForm.hidden = true;
      subtitleEl.textContent = 'Sign in with your passkey';
    } else {
      passkeyBtn.hidden = true;
      loginForm.hidden = false;
      subtitleEl.textContent = enabled
        ? 'Your browser does not support passkeys — try Safari on your Mac, iPad, or iPhone.'
        : 'Enter the password to continue';
      document.getElementById('password').focus();
    }
  } catch (err) {
    // Fall back to the password form if the status check itself fails.
    passkeyBtn.hidden = true;
    loginForm.hidden = false;
  }
}

passkeyBtn.addEventListener('click', signInWithPasskey);

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('password').value;
  errorEl.hidden = true;
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showError(data.error || 'Sign in failed');
      return;
    }
    window.location.href = '/';
  } catch (err) {
    showError('Network error, please try again.');
  }
});

init();
