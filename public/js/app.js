renderNav('tasks');

const LABEL_COLORS = [
  '#e53935',
  '#fb8c00',
  '#f9a825',
  '#43a047',
  '#00897b',
  '#1e88e5',
  '#3949ab',
  '#8e24aa',
  '#d81b60',
  '#6d4c41',
];

const datePicker = document.getElementById('date-picker');
const taskRows = document.getElementById('task-rows');
const emptyState = document.getElementById('empty-state');
const progressText = document.getElementById('progress-text');
const progressFill = document.getElementById('progress-fill');
const labelFiltersEl = document.getElementById('label-filters');
const labelManagerEl = document.getElementById('label-manager');
const labelListEl = document.getElementById('label-list');
const colorSwatchesEl = document.getElementById('color-swatches');
const newLabelSelect = document.getElementById('new-label');

function shiftDate(dateStr, delta) {
  const [y, m, day] = dateStr.split('-').map(Number);
  const d = new Date(y, m - 1, day);
  d.setDate(d.getDate() + delta);
  return formatLocalDate(d);
}

let currentDate = todayStr();
let currentCategory = getCategory();
let labels = [];
let activeLabelFilter = null;
let selectedSwatch = LABEL_COLORS[0];
let lastTasks = [];
datePicker.value = currentDate;

function labelById(id) {
  return labels.find((l) => l.id === id) || null;
}

async function loadLabels() {
  const res = await apiFetch(`/api/labels?category=${currentCategory}`);
  labels = await res.json();
  renderLabelFilters();
  renderLabelManager();
  populateLabelSelect(newLabelSelect, '');
}

function renderLabelFilters() {
  labelFiltersEl.innerHTML = '';
  const allBtn = document.createElement('button');
  allBtn.className = `label-pill ${activeLabelFilter === null ? 'active' : ''}`;
  allBtn.textContent = 'All';
  allBtn.addEventListener('click', () => {
    activeLabelFilter = null;
    renderLabelFilters();
    renderFilteredTasks();
  });
  labelFiltersEl.appendChild(allBtn);

  for (const label of labels) {
    const btn = document.createElement('button');
    btn.className = `label-pill ${activeLabelFilter === label.id ? 'active' : ''}`;
    btn.innerHTML = `<span class="label-dot" style="background:${label.color}"></span>${label.name}`;
    btn.addEventListener('click', () => {
      activeLabelFilter = label.id;
      renderLabelFilters();
      renderFilteredTasks();
    });
    labelFiltersEl.appendChild(btn);
  }
}

function renderLabelManager() {
  labelListEl.innerHTML = '';
  if (labels.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No labels yet for this category.';
    labelListEl.appendChild(empty);
  }
  for (const label of labels) {
    const chip = document.createElement('span');
    chip.className = 'label-chip';
    chip.innerHTML = `<span class="label-dot" style="background:${label.color}"></span>${label.name}`;
    const del = document.createElement('button');
    del.className = 'label-chip-remove';
    del.textContent = '×';
    del.title = `Delete "${label.name}"`;
    del.addEventListener('click', () => deleteLabelDef(label));
    chip.appendChild(del);
    labelListEl.appendChild(chip);
  }

  colorSwatchesEl.innerHTML = '';
  for (const color of LABEL_COLORS) {
    const sw = document.createElement('button');
    sw.className = `color-swatch ${color === selectedSwatch ? 'selected' : ''}`;
    sw.style.background = color;
    sw.type = 'button';
    sw.addEventListener('click', () => {
      selectedSwatch = color;
      colorSwatchesEl.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('selected'));
      sw.classList.add('selected');
    });
    colorSwatchesEl.appendChild(sw);
  }
}

function populateLabelSelect(selectEl, selectedId) {
  selectEl.innerHTML = '';
  const noneOpt = document.createElement('option');
  noneOpt.value = '';
  noneOpt.textContent = '— no label —';
  selectEl.appendChild(noneOpt);
  for (const label of labels) {
    const opt = document.createElement('option');
    opt.value = label.id;
    opt.textContent = label.name;
    selectEl.appendChild(opt);
  }
  selectEl.value = selectedId || '';
  applySelectColor(selectEl);
}

function applySelectColor(selectEl) {
  const label = labelById(selectEl.value);
  selectEl.style.borderLeft = label ? `4px solid ${label.color}` : '';
}

async function addLabelDef() {
  const nameInput = document.getElementById('new-label-name');
  const name = nameInput.value.trim();
  if (!name) return;
  await apiFetch('/api/labels', {
    method: 'POST',
    body: JSON.stringify({ category: currentCategory, name, color: selectedSwatch }),
  });
  nameInput.value = '';
  await loadLabels();
}

async function deleteLabelDef(label) {
  if (!confirm(`Delete label "${label.name}"? Tasks using it will keep no label.`)) return;
  await apiFetch(`/api/labels/${label.category}/${label.id}`, { method: 'DELETE' });
  if (activeLabelFilter === label.id) activeLabelFilter = null;
  await loadLabels();
  renderFilteredTasks();
}

document.getElementById('manage-labels-btn').addEventListener('click', () => {
  labelManagerEl.hidden = !labelManagerEl.hidden;
});
document.getElementById('add-label-btn').addEventListener('click', addLabelDef);

async function loadTasks() {
  const res = await apiFetch(`/api/tasks?date=${currentDate}&category=${currentCategory}`);
  lastTasks = await res.json();
  renderFilteredTasks();
}

function renderFilteredTasks() {
  const tasks = activeLabelFilter ? lastTasks.filter((t) => t.labelId === activeLabelFilter) : lastTasks;
  renderTasks(tasks);
}

document.addEventListener('categorychange', async (e) => {
  currentCategory = e.detail.category;
  activeLabelFilter = null;
  await loadLabels();
  loadTasks();
});

function renderTasks(tasks) {
  taskRows.innerHTML = '';
  emptyState.hidden = tasks.length > 0;

  let completed = 0;
  for (const task of tasks) {
    if (task.completed) completed += 1;
    taskRows.appendChild(buildRow(task));
  }
  progressText.textContent = `${completed} / ${tasks.length} done`;
  progressFill.style.width = tasks.length ? `${Math.round((completed / tasks.length) * 100)}%` : '0%';
}

function buildRow(task) {
  const tr = document.createElement('tr');
  tr.className = task.completed ? 'completed' : '';
  tr.dataset.id = task.id;

  const checkTd = document.createElement('td');
  checkTd.className = 'col-check';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = task.completed;
  checkbox.addEventListener('change', () => toggleComplete(task, checkbox.checked, tr));
  checkTd.appendChild(checkbox);

  const labelTd = document.createElement('td');
  labelTd.className = 'col-label';
  const labelSelect = document.createElement('select');
  populateLabelSelect(labelSelect, task.labelId);
  labelSelect.addEventListener('change', () => {
    applySelectColor(labelSelect);
    updateTask(task, { labelId: labelSelect.value });
  });
  labelTd.appendChild(labelSelect);

  const timeTd = document.createElement('td');
  timeTd.className = 'col-time';
  const timeInput = document.createElement('input');
  timeInput.type = 'time';
  timeInput.value = task.time || '';
  timeInput.addEventListener('change', () => updateTask(task, { time: timeInput.value }));
  timeTd.appendChild(timeInput);

  const titleTd = document.createElement('td');
  titleTd.className = 'col-title';
  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.value = task.title;
  titleInput.addEventListener('change', () => updateTask(task, { title: titleInput.value }));
  titleTd.appendChild(titleInput);

  const actionsTd = document.createElement('td');
  actionsTd.className = 'col-actions';
  const delBtn = document.createElement('button');
  delBtn.className = 'icon-btn danger';
  delBtn.textContent = '✕';
  delBtn.title = 'Delete task';
  delBtn.addEventListener('click', () => deleteTask(task, tr));
  actionsTd.appendChild(delBtn);

  tr.append(checkTd, labelTd, timeTd, titleTd, actionsTd);
  return tr;
}

async function toggleComplete(task, completed, tr) {
  tr.className = completed ? 'completed' : '';
  await apiFetch(`/api/tasks/${task.date}/${task.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ completed }),
  });
  loadTasks();
}

async function updateTask(task, updates) {
  await apiFetch(`/api/tasks/${task.date}/${task.id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  if (typeof updates.labelId === 'string') loadTasks();
}

async function deleteTask(task, tr) {
  tr.remove();
  await apiFetch(`/api/tasks/${task.date}/${task.id}`, { method: 'DELETE' });
  loadTasks();
}

async function addTask() {
  const titleInput = document.getElementById('new-title');
  const timeInput = document.getElementById('new-time');
  const title = titleInput.value.trim();
  if (!title) return;
  await apiFetch('/api/tasks', {
    method: 'POST',
    body: JSON.stringify({
      date: currentDate,
      title,
      time: timeInput.value,
      category: currentCategory,
      labelId: newLabelSelect.value,
    }),
  });
  titleInput.value = '';
  timeInput.value = '';
  newLabelSelect.value = '';
  applySelectColor(newLabelSelect);
  titleInput.focus();
  loadTasks();
}

document.getElementById('add-btn').addEventListener('click', addTask);
document.getElementById('new-title').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addTask();
});
newLabelSelect.addEventListener('change', () => applySelectColor(newLabelSelect));

document.getElementById('prev-day').addEventListener('click', () => {
  currentDate = shiftDate(currentDate, -1);
  datePicker.value = currentDate;
  loadTasks();
});
document.getElementById('next-day').addEventListener('click', () => {
  currentDate = shiftDate(currentDate, 1);
  datePicker.value = currentDate;
  loadTasks();
});
document.getElementById('today-btn').addEventListener('click', async () => {
  currentDate = todayStr();
  datePicker.value = currentDate;
  await triggerRollover(currentCategory);
  loadTasks();
});
datePicker.addEventListener('change', () => {
  currentDate = datePicker.value;
  loadTasks();
});

(async function init() {
  await rolloverAllCategories();
  await loadLabels();
  await loadTasks();
})();
