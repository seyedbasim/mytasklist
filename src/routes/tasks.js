const express = require('express');
const storage = require('../storage');

const router = express.Router();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

router.get('/', async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date || !DATE_RE.test(date)) {
      return res.status(400).json({ error: 'A valid date query param (YYYY-MM-DD) is required' });
    }
    const tasks = await storage.getTasksByDate(date);
    res.json(tasks);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { date, title, time } = req.body || {};
    if (!date || !DATE_RE.test(date)) {
      return res.status(400).json({ error: 'A valid date (YYYY-MM-DD) is required' });
    }
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Task title is required' });
    }
    if (time && !TIME_RE.test(time)) {
      return res.status(400).json({ error: 'Time must be in HH:MM format' });
    }
    const task = await storage.createTask(date, { title: title.trim(), time });
    res.status(201).json(task);
  } catch (err) {
    next(err);
  }
});

router.patch('/:date/:id', async (req, res, next) => {
  try {
    const { date, id } = req.params;
    const { title, time, completed } = req.body || {};
    if (!DATE_RE.test(date)) return res.status(400).json({ error: 'Invalid date' });
    if (time && !TIME_RE.test(time)) {
      return res.status(400).json({ error: 'Time must be in HH:MM format' });
    }
    const task = await storage.updateTask(date, id, { title, time, completed });
    res.json(task);
  } catch (err) {
    next(err);
  }
});

router.delete('/:date/:id', async (req, res, next) => {
  try {
    const { date, id } = req.params;
    if (!DATE_RE.test(date)) return res.status(400).json({ error: 'Invalid date' });
    await storage.deleteTask(date, id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
