import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import publicSessionHandler from './api/public-session.js';
import voteHandler from './api/vote.js';
import studentStatusHandler from './api/student-status.js';
import adminDashboardHandler from './api/admin-dashboard.js';
import adminRosterHandler from './api/admin-roster.js';
import adminManageHandler from './api/admin-manage.js';
import adminImportVendorsHandler from './api/admin-import-vendors.js';
import adminExportResultsHandler from './api/admin-export-results.js';
import adminExportVendorsHandler from './api/admin-export-vendors.js';
import adminExportRosterHandler from './api/admin-export-roster.js';
import { db } from './api/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));

// Admin authentication middleware
const requireAdmin = (req, res, next) => {
  const secret = process.env.ADMIN_SECRET;
  const ADMIN_PIN = '5313';

  const authHeader = req.headers['authorization'];
  const adminKey = req.headers['x-admin-key'];
  const adminPin = req.headers['x-admin-pin'];

  // Check valid Admin PIN
  if (adminPin === ADMIN_PIN || adminKey === ADMIN_PIN || authHeader === `Bearer ${ADMIN_PIN}`) {
    req.member = {
      email: process.env.ADMIN_EMAIL || 'admin@kpmbp.edu.my',
      role: 'admin'
    };
    return next();
  }

  if (secret && (adminKey === secret || authHeader === `Bearer ${secret}`)) {
    req.member = {
      email: process.env.ADMIN_EMAIL || 'admin@kpmbp.edu.my',
      role: 'admin'
    };
    return next();
  }

  return res.status(403).json({ error: 'Akses ditolak. Sila masukkan PIN keselamatan pentadbir yang sah.' });
};

// Admin PIN verification endpoint
app.post('/api/admin-verify-pin', (req, res) => {
  const { pin } = req.body || {};
  const ADMIN_PIN = '5313';
  if (String(pin || '').trim() === ADMIN_PIN) {
    return res.json({ ok: true, message: 'Admin Mode diaktifkan.' });
  }
  return res.status(401).json({ ok: false, error: 'PIN keselamatan tidak sah. Sila cuba lagi.' });
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const health = await db.getHealth();
    res.json({ ok: true, database: health });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Public API endpoints
app.get('/api/public-session', (req, res, next) => {
  publicSessionHandler(req, res).catch(next);
});

app.post('/api/vote', (req, res, next) => {
  voteHandler(req, res).catch(next);
});

app.get('/api/student-status', (req, res, next) => {
  studentStatusHandler(req, res).catch(next);
});

app.post('/api/student-status', (req, res, next) => {
  studentStatusHandler(req, res).catch(next);
});

// Admin API endpoints
app.get('/api/admin-dashboard', requireAdmin, (req, res, next) => {
  adminDashboardHandler(req, res).catch(next);
});

app.post('/api/admin-roster', requireAdmin, (req, res, next) => {
  adminRosterHandler(req, res).catch(next);
});

app.post('/api/admin-manage', requireAdmin, (req, res, next) => {
  adminManageHandler(req, res).catch(next);
});

app.post('/api/admin-import-vendors', requireAdmin, (req, res, next) => {
  adminImportVendorsHandler(req, res).catch(next);
});

app.get('/api/admin-export-results', requireAdmin, (req, res, next) => {
  adminExportResultsHandler(req, res).catch(next);
});

app.get('/api/admin-export-vendors', requireAdmin, (req, res, next) => {
  adminExportVendorsHandler(req, res).catch(next);
});

app.get('/api/admin-export-roster', requireAdmin, (req, res, next) => {
  adminExportRosterHandler(req, res).catch(next);
});

// SPA fallback for HTML pages
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[ServerError]', err);
  res.status(500).json({ error: 'Ralat dalaman pelayan. Sila cuba lagi sebentar lagi.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`VendorVote server running on http://0.0.0.0:${PORT}`);
});
