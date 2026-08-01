function renderNav(active) {
  const nav = document.createElement('nav');
  nav.className = 'nav';
  nav.innerHTML = `
    <div class="nav-brand">Task List</div>
    <div class="nav-links">
      <a href="/" class="${active === 'tasks' ? 'active' : ''}">Tasks</a>
      <a href="/dashboard.html" class="${active === 'dashboard' ? 'active' : ''}">Dashboard</a>
      <button id="logout-btn" class="link-btn">Logout</button>
    </div>
  `;
  document.body.prepend(nav);
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login.html';
  });
}

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 401) {
    window.location.href = '/login.html';
    throw new Error('Not authenticated');
  }
  return res;
}
