const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const storage = require('../storage');

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

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    // Once a passkey is registered, password login is disabled entirely — there's no
    // brute-forceable credential left to guard, regardless of what's passed here.
    const credentials = await storage.getCredentials();
    if (credentials.length > 0) {
      return res.status(403).json({ error: 'Password login is disabled. Sign in with your passkey.' });
    }

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
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/session', (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.authenticated) });
});

module.exports = router;
