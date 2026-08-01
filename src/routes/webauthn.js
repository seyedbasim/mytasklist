const express = require('express');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const storage = require('../storage');
const { requireAuth } = require('../auth');

const router = express.Router();

const RP_NAME = process.env.WEBAUTHN_RP_NAME || "Basim's Tasks";
const RP_ID = process.env.WEBAUTHN_RP_ID || 'localhost';
const ORIGIN = process.env.WEBAUTHN_ORIGIN || 'http://localhost:8080';

// Public: lets the login page know whether to show the password form or go passkey-only.
router.get('/status', async (req, res, next) => {
  try {
    const credentials = await storage.getCredentials();
    res.json({ enabled: credentials.length > 0 });
  } catch (err) {
    next(err);
  }
});

// Registering a new passkey requires an existing session (password, during bootstrap,
// or an already-registered passkey afterward) — this is what prevents a stranger from
// just adding their own passkey to your app.
router.get('/register/options', requireAuth, async (req, res, next) => {
  try {
    const existing = await storage.getCredentials();
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userName: 'basim',
      userDisplayName: RP_NAME,
      attestationType: 'none',
      excludeCredentials: existing.map((c) => ({ id: c.id, transports: c.transports })),
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'preferred',
        authenticatorAttachment: 'platform',
      },
    });
    req.session.currentChallenge = options.challenge;
    res.json(options);
  } catch (err) {
    next(err);
  }
});

router.post('/register/verify', requireAuth, async (req, res, next) => {
  try {
    const expectedChallenge = req.session.currentChallenge;
    if (!expectedChallenge) {
      return res.status(400).json({ error: 'No registration in progress' });
    }
    const { label, ...response } = req.body || {};
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
    });
    delete req.session.currentChallenge;

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'Passkey registration could not be verified' });
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    await storage.createCredential({
      id: credential.id,
      publicKey: credential.publicKey,
      counter: credential.counter,
      transports: credential.transports,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      label: typeof label === 'string' ? label.slice(0, 60) : '',
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Public: this is how you actually sign in.
router.get('/login/options', async (req, res, next) => {
  try {
    const credentials = await storage.getCredentials();
    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      userVerification: 'preferred',
      allowCredentials: credentials.map((c) => ({ id: c.id, transports: c.transports })),
    });
    req.session.currentChallenge = options.challenge;
    res.json(options);
  } catch (err) {
    next(err);
  }
});

router.post('/login/verify', async (req, res, next) => {
  try {
    const expectedChallenge = req.session.currentChallenge;
    if (!expectedChallenge) {
      return res.status(400).json({ error: 'No sign-in attempt in progress' });
    }
    const credentialId = req.body?.id;
    const stored = credentialId ? await storage.getCredentialById(credentialId) : null;
    if (!stored) {
      return res.status(401).json({ error: 'Unrecognized passkey' });
    }

    const verification = await verifyAuthenticationResponse({
      response: req.body,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: stored.id,
        publicKey: stored.publicKey,
        counter: stored.counter,
        transports: stored.transports,
      },
    });
    delete req.session.currentChallenge;

    if (!verification.verified) {
      return res.status(401).json({ error: 'Passkey verification failed' });
    }

    await storage.updateCredentialCounter(stored.id, verification.authenticationInfo.newCounter);
    req.session.authenticated = true;
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/credentials', requireAuth, async (req, res, next) => {
  try {
    const credentials = await storage.getCredentials();
    res.json(
      credentials.map((c) => ({
        id: c.id,
        label: c.label,
        deviceType: c.deviceType,
        createdAt: c.createdAt,
      }))
    );
  } catch (err) {
    next(err);
  }
});

router.delete('/credentials/:id', requireAuth, async (req, res, next) => {
  try {
    await storage.deleteCredential(req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
