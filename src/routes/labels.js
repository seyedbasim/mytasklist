const express = require('express');
const storage = require('../storage');

const router = express.Router();
const CATEGORIES = ['personal', 'work'];
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

router.get('/', async (req, res, next) => {
  try {
    const category = CATEGORIES.includes(req.query.category) ? req.query.category : 'personal';
    const labels = await storage.getLabels(category);
    res.json(labels);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, color } = req.body || {};
    const category = CATEGORIES.includes(req.body?.category) ? req.body.category : 'personal';
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Label name is required' });
    }
    if (!color || !COLOR_RE.test(color)) {
      return res.status(400).json({ error: 'Color must be a hex value like #2e7d32' });
    }
    const label = await storage.createLabel(category, { name: name.trim(), color });
    res.status(201).json(label);
  } catch (err) {
    next(err);
  }
});

router.delete('/:category/:id', async (req, res, next) => {
  try {
    const { category, id } = req.params;
    if (!CATEGORIES.includes(category)) return res.status(400).json({ error: 'Invalid category' });
    await storage.deleteLabel(category, id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
