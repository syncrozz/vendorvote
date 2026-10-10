import express from 'express';
import path from 'path';

import publicSessionHandler from '../lib/handlers/public-session.js';
import voteHandler from '../lib/handlers/vote.js';
import studentStatusHandler from '../lib/handlers/student-status.js';
import adminHandler from '../lib/handlers/admin.js';
import healthHandler from '../lib/handlers/health.js';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets from public directory
app.use(express.static(path.join(process.cwd(), 'public')));

// Health check endpoint
app.get('/api/health', (req, res, next) => {
  healthHandler(req, res).catch(next);
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
app.post('/api/admin-verify-pin', (req, res, next) => {
  adminHandler(req, res).catch(next);
});

app.get('/api/admin-dashboard', (req, res, next) => {
  adminHandler(req, res).catch(next);
});

app.post('/api/admin-roster', (req, res, next) => {
  adminHandler(req, res).catch(next);
});

app.post('/api/admin-manage', (req, res, next) => {
  adminHandler(req, res).catch(next);
});

app.post('/api/admin-import-vendors', (req, res, next) => {
  adminHandler(req, res).catch(next);
});

app.get('/api/admin-export-results', (req, res, next) => {
  adminHandler(req, res).catch(next);
});

app.get('/api/admin-export-vendors', (req, res, next) => {
  adminHandler(req, res).catch(next);
});

app.get('/api/admin-export-roster', (req, res, next) => {
  adminHandler(req, res).catch(next);
});

// Catch-all for any other /api/admin* paths or direct /api/admin invocations
app.all('/api/admin*', (req, res, next) => {
  adminHandler(req, res).catch(next);
});

// Direct root /api invocation
app.all('/api', (req, res) => {
  res.json({ ok: true, name: 'VendorVote API', version: '1.0.0' });
});

// SPA fallback for HTML pages in local dev
app.get('/admin', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'admin.html'));
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[ServerError]', err);
  res.status(500).json({ error: 'Ralat dalaman pelayan. Sila cuba lagi sebentar lagi.' });
});

export default app;
