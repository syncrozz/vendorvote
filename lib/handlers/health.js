import { db } from '../db.js';

export const methods = ['GET'];

export default async function handler(req, res) {
  if (req.method && req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Kaedah HTTP tidak dibenarkan.' });
  }

  try {
    const health = await db.getHealth();
    return res.json({ ok: true, database: health });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
