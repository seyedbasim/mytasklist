function getCategory() {
  return localStorage.getItem('taskCategory') || 'personal';
}

function setCategory(category) {
  localStorage.setItem('taskCategory', category);
}

function renderCategoryToggle() {
  const bar = document.createElement('div');
  bar.className = 'category-toggle';
  const current = getCategory();
  bar.innerHTML = `
    <button class="cat-btn ${current === 'personal' ? 'active' : ''}" data-category="personal">Personal</button>
    <button class="cat-btn ${current === 'work' ? 'active' : ''}" data-category="work">Work</button>
  `;
  document.body.prepend(bar);
  bar.querySelectorAll('.cat-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('active')) return;
      setCategory(btn.dataset.category);
      bar.querySelectorAll('.cat-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      document.dispatchEvent(new CustomEvent('categorychange', { detail: { category: btn.dataset.category } }));
    });
  });
}

function renderNav(active) {
  const nav = document.createElement('nav');
  nav.className = 'nav';
  nav.innerHTML = `
    <div class="nav-brand">Basim's Tasks</div>
    <div class="nav-links">
      <a href="/" class="${active === 'tasks' ? 'active' : ''}">Tasks</a>
      <a href="/dashboard.html" class="${active === 'dashboard' ? 'active' : ''}">Dashboard</a>
      <button id="logout-btn" class="link-btn">Logout</button>
    </div>
  `;
  renderCategoryToggle();
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
