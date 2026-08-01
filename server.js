require('dotenv').config();

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');

const { requireAuth, requireAuthPage } = require('./src/auth');
const { ensureTableExists } = require('./src/storage');
const authRoutes = require('./src/routes/auth');
const taskRoutes = require('./src/routes/tasks');
const dashboardRoutes = require('./src/routes/dashboard');

const app = express();
const PORT = process.env.PORT || 8080;

// Azure App Service sits behind a reverse proxy; needed for secure cookies to work.
app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  })
);

// Auth endpoints (login/logout/session check) are public.
app.use('/api', authRoutes);

// Everything else under /api requires an authenticated session.
app.use('/api/tasks', requireAuth, taskRoutes);
app.use('/api/dashboard', requireAuth, dashboardRoutes);

// Protect the app pages themselves; redirect to the login page if not signed in.
app.get(['/', '/index.html'], requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/dashboard.html', requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Static assets (including the public login page) are served last.
app.use(express.static(path.join(__dirname, 'public')));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

async function main() {
  if (!process.env.APP_PASSWORD) {
    console.warn('WARNING: APP_PASSWORD is not set. Sign-in will fail until it is configured.');
  }
  await ensureTableExists();
  app.listen(PORT, () => {
    console.log(`Task list app listening on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error('Failed to start app:', err);
  process.exit(1);
});
