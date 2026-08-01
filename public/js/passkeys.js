renderNav('passkeys');

const passkeyListEl = document.getElementById('passkey-list');
const passwordWarningEl = document.getElementById('password-warning');
const errorEl = document.getElementById('error');
const successEl = document.getElementById('success');

function showError(message) {
  successEl.hidden = true;
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function showSuccess(message) {
  errorEl.hidden = true;
  successEl.textContent = message;
  successEl.hidden = false;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

async function loadPasskeys() {
  const res = await apiFetch('/api/webauthn/credentials');
  const credentials = await res.json();
  passwordWarningEl.hidden = credentials.length > 0;

  passkeyListEl.innerHTML = '';
  if (credentials.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No passkeys registered yet.';
    passkeyListEl.appendChild(empty);
    return;
  }

  for (const cred of credentials) {
    const row = document.createElement('div');
    row.className = 'passkey-row';

    const info = document.createElement('div');
    const nameEl = document.createElement('div');
    nameEl.className = 'passkey-name';
    nameEl.textContent = cred.label || 'Unnamed passkey';
    const metaEl = document.createElement('div');
    metaEl.className = 'passkey-meta';
    metaEl.textContent = `Added ${formatDate(cred.createdAt)}${cred.deviceType === 'multiDevice' ? ' · syncs via iCloud Keychain' : ''}`;
    info.append(nameEl, metaEl);
    row.appendChild(info);

    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn danger';
    delBtn.textContent = '✕';
    delBtn.title = 'Remove this passkey';
    delBtn.addEventListener('click', () => removePasskey(cred));
    row.appendChild(delBtn);
    passkeyListEl.appendChild(row);
  }
}

async function removePasskey(cred) {
  const warning =
    'Remove this passkey? If it is your only one, password sign-in will turn back on automatically.';
  if (!confirm(warning)) return;
  await apiFetch(`/api/webauthn/credentials/${encodeURIComponent(cred.id)}`, { method: 'DELETE' });
  await loadPasskeys();
}

async function registerPasskey() {
  errorEl.hidden = true;
  successEl.hidden = true;
  const labelInput = document.getElementById('new-passkey-label');
  const label = labelInput.value.trim() || 'Unnamed passkey';

  try {
    const optionsRes = await apiFetch('/api/webauthn/register/options');
    const optionsJSON = await optionsRes.json();

    const attestation = await SimpleWebAuthnBrowser.startRegistration({ optionsJSON });

    const verifyRes = await apiFetch('/api/webauthn/register/verify', {
      method: 'POST',
      body: JSON.stringify({ ...attestation, label }),
    });
    if (!verifyRes.ok) {
      const data = await verifyRes.json().catch(() => ({}));
      throw new Error(data.error || 'Could not register passkey');
    }
    labelInput.value = '';
    showSuccess('Passkey added.');
    await loadPasskeys();
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      showError('Passkey setup was cancelled.');
    } else {
      showError(err.message || 'Could not register passkey.');
    }
  }
}

document.getElementById('register-btn').addEventListener('click', registerPasskey);

loadPasskeys();
