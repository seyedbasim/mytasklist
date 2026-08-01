renderNav('dashboard');

let chart;
let currentCategory = getCategory();

document.addEventListener('categorychange', (e) => {
  currentCategory = e.detail.category;
  loadDashboard();
});

async function loadDashboard() {
  const days = document.getElementById('range-select').value;
  const res = await apiFetch(`/api/dashboard?days=${days}&category=${currentCategory}`);
  const data = await res.json();

  document.getElementById('stat-rate').textContent = `${data.completionRate}%`;
  document.getElementById('stat-completed').textContent = data.totals.completed;
  document.getElementById('stat-total').textContent = data.totals.total;
  document.getElementById('stat-streak').textContent = data.streak;

  const labels = data.series.map((d) => d.date.slice(5));
  const rates = data.series.map((d) => (d.total ? Math.round((d.completed / d.total) * 100) : 0));

  const ctx = document.getElementById('progress-chart').getContext('2d');
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Completion %',
          data: rates,
          backgroundColor: '#2e7d32',
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      scales: { y: { beginAtZero: true, max: 100 } },
      plugins: { legend: { display: false } },
    },
  });
}

document.getElementById('range-select').addEventListener('change', loadDashboard);
loadDashboard();
