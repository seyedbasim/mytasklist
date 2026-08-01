const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' },
});

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

router.post('/login', loginLimiter, (req, res) => {
  const { password } = req.body || {};
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    return res.status(500).json({ error: 'Server is missing APP_PASSWORD configuration' });
  }
  if (typeof password === 'string' && safeEqual(password, expected)) {
    req.session.authenticated = true;
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: 'Incorrect password' });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/session', (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.authenticated) });
});

module.exports = router;
