import app from './api/index.js';

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`VendorVote server running on http://0.0.0.0:${PORT}`);
});
