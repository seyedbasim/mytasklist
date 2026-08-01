const express = require('express');
const storage = require('../storage');

const router = express.Router();

function fmt(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

router.get('/', async (req, res, next) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);
    const today = new Date();
    const start = addDays(today, -(days - 1));
    const tasks = await storage.getTasksInRange(fmt(start), fmt(today));

    const byDate = new Map();
    for (let i = 0; i < days; i++) {
      const date = fmt(addDays(start, i));
      byDate.set(date, { date, total: 0, completed: 0 });
    }
    for (const t of tasks) {
      const bucket = byDate.get(t.date);
      if (!bucket) continue;
      bucket.total += 1;
      if (t.completed) bucket.completed += 1;
    }
    const series = Array.from(byDate.values());

    const totals = series.reduce(
      (acc, d) => {
        acc.total += d.total;
        acc.completed += d.completed;
        return acc;
      },
      { total: 0, completed: 0 }
    );

    // Current streak: consecutive days ending today, walking backward, where
    // the day had at least one task and every task on that day was completed.
    let streak = 0;
    for (let i = series.length - 1; i >= 0; i--) {
      const d = series[i];
      if (d.total > 0 && d.completed === d.total) streak += 1;
      else break;
    }

    res.json({
      series,
      totals,
      completionRate: totals.total ? Math.round((totals.completed / totals.total) * 100) : 0,
      streak,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
