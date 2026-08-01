const express = require('express');
const storage = require('../storage');

const router = express.Router();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const CATEGORIES = ['personal', 'work'];

router.get('/', async (req, res, next) => {
  try {
    const { date } = req.query;
    const category = CATEGORIES.includes(req.query.category) ? req.query.category : 'personal';
    if (!date || !DATE_RE.test(date)) {
      return res.status(400).json({ error: 'A valid date query param (YYYY-MM-DD) is required' });
    }
    const tasks = await storage.getTasksByDate(date, category);
    res.json(tasks);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { date, title, time, labelId } = req.body || {};
    const category = CATEGORIES.includes(req.body?.category) ? req.body.category : 'personal';
    if (!date || !DATE_RE.test(date)) {
      return res.status(400).json({ error: 'A valid date (YYYY-MM-DD) is required' });
    }
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Task title is required' });
    }
    if (time && !TIME_RE.test(time)) {
      return res.status(400).json({ error: 'Time must be in HH:MM format' });
    }
    const task = await storage.createTask(date, { title: title.trim(), time, category, labelId });
    res.status(201).json(task);
  } catch (err) {
    next(err);
  }
});

router.post('/rollover', async (req, res, next) => {
  try {
    const { today } = req.body || {};
    const category = CATEGORIES.includes(req.body?.category) ? req.body.category : 'personal';
    if (!today || !DATE_RE.test(today)) {
      return res.status(400).json({ error: 'A valid today (YYYY-MM-DD) is required' });
    }
    const movedCount = await storage.rolloverIncompleteTasks(category, today);
    res.json({ movedCount });
  } catch (err) {
    next(err);
  }
});

router.patch('/:date/:id', async (req, res, next) => {
  try {
    const { date, id } = req.params;
    const { title, time, completed, labelId } = req.body || {};
    if (!DATE_RE.test(date)) return res.status(400).json({ error: 'Invalid date' });
    if (time && !TIME_RE.test(time)) {
      return res.status(400).json({ error: 'Time must be in HH:MM format' });
    }
    const task = await storage.updateTask(date, id, { title, time, completed, labelId });
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
