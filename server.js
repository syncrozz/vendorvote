import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import publicSessionHandler from './api/public-session.js';
import voteHandler from './api/vote.js';
import studentStatusHandler from './api/student-status.js';
import adminHandler from './api/admin.js';
import healthHandler from './api/health.js';
import { db } from './lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));

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

// Admin API endpoints (Consolidated handler)
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

// Catch-all for any other /api/admin/* paths
app.all('/api/admin*', (req, res, next) => {
  adminHandler(req, res).catch(next);
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
