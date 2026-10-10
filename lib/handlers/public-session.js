import { db } from '../db.js';

export const access = 'public';
export const methods = ['GET'];

export default async function handler(req, res) {
  if (req.method && req.method !== 'GET') {
    return res.status(405).json({ error: 'Kaedah HTTP tidak dibenarkan.' });
  }

  try {
    const { rows: sessions } = await db.query(
      "SELECT id, title, starts_at, ends_at, status, min_votes, max_choices FROM voting_sessions WHERE status IN ('open','scheduled') ORDER BY created_at DESC LIMIT 1"
    );
    const session = sessions[0];
    if (!session) {
      return res.json({ session: null, vendors: [], message: 'Tiada sesi undian sedang dibuka.' });
    }

    const { rows: vendors } = await db.query(
      'SELECT v.id, v.name, v.menu_description, v.image_url, v.slug FROM vendors v JOIN session_vendors sv ON sv.vendor_id=v.id WHERE sv.session_id=$1 AND v.active=TRUE ORDER BY v.name',
      [session.id]
    );

    return res.json({ session, vendors });
  } catch (err) {
    console.error('[PublicSession Error]', err);
    return res.status(500).json({ error: 'Ralat mendapatkan maklumat sesi undian.' });
  }
}
