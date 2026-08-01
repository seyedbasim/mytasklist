renderNav('tasks');

const datePicker = document.getElementById('date-picker');
const taskRows = document.getElementById('task-rows');
const emptyState = document.getElementById('empty-state');
const progressText = document.getElementById('progress-text');
const progressFill = document.getElementById('progress-fill');

function todayStr() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function shiftDate(dateStr, delta) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

let currentDate = todayStr();
datePicker.value = currentDate;

async function loadTasks() {
  const res = await apiFetch(`/api/tasks?date=${currentDate}`);
  const tasks = await res.json();
  renderTasks(tasks);
}

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

  tr.append(checkTd, timeTd, titleTd, actionsTd);
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
    body: JSON.stringify({ date: currentDate, title, time: timeInput.value }),
  });
  titleInput.value = '';
  timeInput.value = '';
  titleInput.focus();
  loadTasks();
}

document.getElementById('add-btn').addEventListener('click', addTask);
document.getElementById('new-title').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addTask();
});

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
document.getElementById('today-btn').addEventListener('click', () => {
  currentDate = todayStr();
  datePicker.value = currentDate;
  loadTasks();
});
datePicker.addEventListener('change', () => {
  currentDate = datePicker.value;
  loadTasks();
});

loadTasks();
